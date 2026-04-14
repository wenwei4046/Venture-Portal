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
  const { error: insertErr } = await supabase.from('hr_cost_submissions').insert({
    period_month: period,
    submitted_by: user.id,
    dept_summaries: payload.dept_summaries,
    staff_snapshot: payload.staff_snapshot,
    pool_allocation_snapshot: payload.pool_allocation_snapshot,
    staff_allocation_snapshot: payload.staff_allocation_snapshot,
  })

  if (insertErr) {
    if (insertErr.code === '23505') {
      throw new Error(
        `HR cost summary for ${dayjs(period).format('MMM YYYY')} is already submitted.`
      )
    }
    throw new Error(`Failed to submit HR cost summary: ${insertErr.message}`)
  }

  revalidatePath('/hr-costing')
  revalidatePath('/billing')
  revalidatePath('/dashboard')

  return {
    period,
    departments: Object.keys(deptSummaries),
  }
}
