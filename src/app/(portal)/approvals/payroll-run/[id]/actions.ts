'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'

/**
 * Principal approves a submitted payroll_run.
 * Wraps approve_payroll_run RPC (migration 129) which fans out into one
 * salary_payout voucher per staff + director, flips all statuses to paid,
 * and marks the run paid.
 */
export async function approvePayrollRun(runId: string): Promise<void> {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const { data: run, error: readErr } = await supabase
    .from('payroll_runs')
    .select('period_month, submitted_by, status')
    .eq('id', runId)
    .maybeSingle()

  if (readErr || !run) throw new Error('Payroll run not found')
  if (run.submitted_by === user.id) throw new Error('Cannot approve your own submission')
  if (run.status !== 'submitted') throw new Error(`Run status is ${run.status}, not submitted`)

  // Period-lock gate (voucher fan-out writes against today's period)
  await assertPeriodOpen(supabase, new Date())
  await assertPeriodOpen(supabase, run.period_month)

  const { error } = await supabase.rpc('approve_payroll_run', {
    p_run_id: runId,
    p_approver: user.id,
  })

  if (error) throw new Error(`Approve failed: ${error.message}`)

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
  const user = await requireRole(['principal'])
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
  if (run.submitted_by === user.id) throw new Error('Cannot reject your own submission')
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
