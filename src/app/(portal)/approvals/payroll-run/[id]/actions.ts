'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { postPayrollAccrualJVs } from '@/lib/payroll-accrual'

/**
 * Principal approves a submitted payroll_run.
 * Wraps approve_payroll_run RPC (migration 129) which fans out into one
 * salary_payout voucher per staff + director, flips all statuses to paid,
 * and marks the run paid.
 */
export async function approvePayrollRun(runId: string): Promise<void> {
  const user = await requirePermission('approvals')
  const supabase = await createClient()

  const { data: run, error: readErr } = await supabase
    .from('payroll_runs')
    .select('period_month, submitted_by, status')
    .eq('id', runId)
    .maybeSingle()

  if (readErr || !run) throw new Error('Payroll run not found')
  // Self-approval allowed (user 2026-08-06: "principal submit 要自己能approve")
  if (run.status !== 'submitted') throw new Error(`Run status is ${run.status}, not submitted`)

  // Period-lock gate (voucher fan-out writes against today's period)
  await assertPeriodOpen(supabase, new Date())
  await assertPeriodOpen(supabase, run.period_month)

  const { error } = await supabase.rpc('approve_payroll_run', {
    p_run_id: runId,
    p_approver: user.id,
  })

  if (error) throw new Error(`Approve failed: ${error.message}`)

  // Auto payroll accrual JVs (user 2026-08-07): approving the run books the
  // month's per-department salary JVs, dated back to the payroll month-end.
  // The run IS approved at this point — an accrual failure surfaces loudly but
  // doesn't undo the approval.
  try {
    await postPayrollAccrualJVs(supabase as unknown as SupabaseClient, {
      periodMonth: run.period_month,
      kind: 'staff',
      runId,
      userId: user.id,
    })
  } catch (e) {
    throw new Error(
      `Run approved ✓ but the auto accrual JV failed: ${e instanceof Error ? e.message : 'unknown'}`,
    )
  }

  revalidatePath(`/approvals/payroll-run/${runId}`)
  revalidatePath('/approvals')
  revalidatePath(`/hr-costing/payroll/${run.period_month}`)
  revalidatePath('/hr-costing/payroll')
}

/**
 * Principal rejects a submitted payroll_run with a mandatory reason.
 * HR can re-open the grid and edit after rejection.
 */
export async function rejectPayrollRun(runId: string, reason: string): Promise<void> {
  const user = await requirePermission('approvals')
  const supabase = await createClient()

  if (!reason || reason.trim().length === 0) {
    throw new Error('Rejection reason is required')
  }

  const { data: run, error: readErr } = await supabase
    .from('payroll_runs')
    .select('period_month, submitted_by, status')
    .eq('id', runId)
    .maybeSingle()

  if (readErr || !run) throw new Error('Payroll run not found')
  // Self-reject allowed too (mirror of the 2026-08-06 self-approval rule).
  if (run.status !== 'submitted') throw new Error(`Run status is ${run.status}, not submitted`)

  const { error } = await supabase.rpc('reject_payroll_run', {
    p_run_id: runId,
    p_approver: user.id,
    p_reason: reason.trim(),
  })

  if (error) throw new Error(`Reject failed: ${error.message}`)

  revalidatePath(`/approvals/payroll-run/${runId}`)
  revalidatePath('/approvals')
  revalidatePath(`/hr-costing/payroll/${run.period_month}`)
  revalidatePath('/hr-costing/payroll')
  redirect('/approvals')
}
