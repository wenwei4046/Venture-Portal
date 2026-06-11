'use server'

import { revalidatePath } from 'next/cache'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'

// ─── Submit HR cost summary for a period (HR) ────────────────────────────────

export async function submitHRCostSummary(formData: FormData) {
  const user = await requireRole(['hr'])
  const supabase = await createClient()

  const rawPeriod = (formData.get('period_month') as string) ?? ''
  if (!rawPeriod) throw new Error('Period month is required')

  // Normalize to first of month
  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')

  // Block future periods — HR submits for the current or past month
  if (dayjs(period).isAfter(dayjs().startOf('month'))) {
    throw new Error('Cannot submit for a future period')
  }

  await assertPeriodOpen(supabase, period)

  // Build snapshot payload via SECURITY DEFINER RPC (reads all hr_staff_costs).
  const { data: payload, error: payloadErr } = await supabase
    .rpc('build_hr_cost_submission_payload', { p_period: period })
    .single()

  if (payloadErr || !payload) {
    throw new Error(`Failed to build payload: ${payloadErr?.message ?? 'empty response'}`)
  }

  const deptSummaries = (payload.dept_summaries ?? {}) as Record<string, unknown>
  if (Object.keys(deptSummaries).length === 0) {
    throw new Error(
      'No active HR staff costs found for the period. Seed or enter staff data before submitting.'
    )
  }

  // Insert the immutable snapshot. UNIQUE (period_month) enforces idempotency:
  // a second submission for the same period fails with a clear error.
  // Phase 7 Step 15: start with execution_state='pending' so Principal can
  // approve the snapshot before Finance executes it.
  const { data: submission, error: insertErr } = await supabase
    .from('hr_cost_submissions')
    .insert({
      period_month: period,
      submitted_by: user.id,
      dept_summaries: payload.dept_summaries,
      staff_snapshot: payload.staff_snapshot,
      pool_allocation_snapshot: payload.pool_allocation_snapshot,
      staff_allocation_snapshot: payload.staff_allocation_snapshot,
      execution_state: 'pending',
    })
    .select('id')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
      throw new Error(
        `HR cost summary for ${dayjs(period).format('MMM YYYY')} is already submitted.`
      )
    }
    throw new Error(`Failed to submit HR cost summary: ${insertErr.message}`)
  }

  // Phase 7 Step 15: queue Principal approval for the HR cost snapshot.
  const totalCtc = Object.values(deptSummaries).reduce<number>(
    (acc, d) => acc + Number((d as { total_ctc?: number }).total_ctc ?? 0),
    0
  )
  const { error: approvalErr } = await supabase.from('approval_requests').insert({
    request_type: 'hr_costing',
    reference_id: submission.id,
    reference_table: 'hr_cost_submissions',
    submitted_by: user.id,
    description: `HR Costing snapshot for ${dayjs(period).format('MMM YYYY')} — ${Object.keys(deptSummaries).length} dept(s)`,
    amount: totalCtc,
    status: 'pending',
    workflow_state: 'submitted',
  })
  if (approvalErr) {
    // Fail loud (2026-06-11 audit): a swallowed failure here leaves the
    // submission pending forever with no entry in Principal's queue. The
    // period-unique constraint already guards a retry from duplicating the
    // submission itself.
    throw new Error(
      `HR cost summary saved, but opening the approval queue entry failed: ${approvalErr.message}. ` +
        `The snapshot will not appear in /approvals — contact an engineer.`,
    )
  }

  revalidatePath('/hr-costing')
  revalidatePath('/statements')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')

  return {
    period,
    departments: Object.keys(deptSummaries),
  }
}

// ─── Finance executes an approved HR Costing snapshot (Step 15) ──────────────
//
// After Principal approves the hr_costing approval_request, Finance clicks
// Execute on the snapshot row. No money movement here — the snapshot is
// already used by billing; execution_state = 'executed' signals that
// Finance has formally picked it up.

export async function executeHrCosting(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Submission id is required')

  const { error } = await supabase
    .from('hr_cost_submissions')
    .update({ execution_state: 'executed' })
    .eq('id', id)
    .eq('execution_state', 'approved_for_execution')

  if (error) throw new Error(`Failed to execute HR costing: ${error.message}`)

  void user
  revalidatePath('/hr-costing')
  revalidatePath('/dashboard')
}
