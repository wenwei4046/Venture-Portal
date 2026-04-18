'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'

/**
 * HR submits the month's payroll to Principal for approval.
 * Wraps submit_payroll_to_principal RPC (migration 128).
 * Redirects to the approval detail page for the newly-created run.
 */
export async function submitToPrincipal(period: string): Promise<void> {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  // Period-lock gate — RPC assumes caller already checked.
  await assertPeriodOpen(supabase, period)

  const { data, error } = await supabase.rpc('submit_payroll_to_principal', {
    p_period: period,
    p_user_id: user.id,
  })

  if (error) throw new Error(`Submit failed: ${error.message}`)
  if (!data) throw new Error('Submit failed: no run id returned')

  revalidatePath('/hr-costing/payroll')
  revalidatePath(`/hr-costing/payroll/${period}`)
  revalidatePath('/approvals')
  redirect(`/approvals/payroll-run/${data}`)
}

export interface PayrollRowUpdate {
  basic_salary?: number
  statutory_allowance?: number
  non_statutory_allowance?: number
  ot_hours?: number
  ot_amount?: number
  commission_amount?: number
  unpaid_leave_days?: number
}

/**
 * Update one payroll row. The DB trigger recomputes pro-rata + statutory + gross/net.
 * Only allowed while status='draft'.
 */
export async function updatePayrollRow(
  id: string,
  fields: PayrollRowUpdate,
): Promise<void> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('hr_monthly_payroll')
    .update(fields)
    .eq('id', id)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to update payroll row: ${error.message}`)

  revalidatePath('/hr-costing/payroll', 'layout')
}

/**
 * Delete one or more draft payroll rows for a given period. Used to drop
 * staff who shouldn't be on this month's payroll (no pay leave, late joiners,
 * early resignations) after an InfoTech import seeds rows for everyone.
 *
 * Only draft rows are deletable — once submitted/approved/paid, the row is
 * part of the payroll_run total and must stay. The .eq('status','draft')
 * guard silently drops non-draft ids from the delete set rather than throwing,
 * so mixed-selection UI still succeeds partially; the returned count reflects
 * what actually got removed.
 */
export async function deletePayrollRows(
  ids: string[],
  period: string,
): Promise<{ deleted: number }> {
  await requireRole(['hr', 'principal'])
  if (ids.length === 0) return { deleted: 0 }

  const supabase = await createClient()
  await assertPeriodOpen(supabase, period)

  const { error, count } = await supabase
    .from('hr_monthly_payroll')
    .delete({ count: 'exact' })
    .in('id', ids)
    .eq('status', 'draft')
    .eq('period_month', period)

  if (error) throw new Error(`Failed to delete payroll rows: ${error.message}`)

  revalidatePath(`/hr-costing/payroll/${period}`)
  revalidatePath('/hr-costing/payroll')

  return { deleted: count ?? 0 }
}

/**
 * Create rows for every active staff in the given period.
 * Idempotent — relies on uq_monthly_payroll_staff_period to skip existing.
 * Same behavior as migration 126 backfill, now callable from the UI.
 */
export async function createPayrollPeriod(period: string): Promise<{ created: number }> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { data: staff, error: staffErr } = await supabase
    .from('hr_staff_costs')
    .select('id, basic_salary, allowances')
    .eq('status', 'active')

  if (staffErr) throw new Error(`Failed to read staff: ${staffErr.message}`)
  if (!staff || staff.length === 0) return { created: 0 }

  // Upsert: insert if not exists, ignore if exists
  const rows = staff.map(s => ({
    staff_id: s.id,
    period_month: period,
    basic_salary: s.basic_salary,
    non_statutory_allowance: s.allowances,
    source: 'carried_forward' as const,
    status: 'draft' as const,
  }))

  const { error, count } = await supabase
    .from('hr_monthly_payroll')
    .upsert(rows, { onConflict: 'staff_id,period_month', ignoreDuplicates: true, count: 'exact' })

  if (error) throw new Error(`Failed to create period: ${error.message}`)

  revalidatePath('/hr-costing/payroll')
  return { created: count ?? 0 }
}

/**
 * Stage D — HR requests payroll payment.
 * Creates a payroll_payment_requests row (status='submitted') linked to an
 * approved payroll_run. Finance then generates a PV against this request
 * (Stage E). The DB trigger validates that the run is in 'approved' state
 * and that the amount matches total_amount exactly.
 *
 * Fails if:
 *   - the run is not status='approved' (trigger raises)
 *   - there's already an active request (UNIQUE partial index raises 23505)
 */
export async function requestPayrollPayment(runId: string): Promise<string> {
  const user = await requireRole(['hr'])
  const supabase = await createClient()

  const { data: run, error: readErr } = await supabase
    .from('payroll_runs')
    .select('id, period_month, status, total_amount')
    .eq('id', runId)
    .maybeSingle()

  if (readErr) throw new Error(`Failed to read payroll run: ${readErr.message}`)
  if (!run) throw new Error('Payroll run not found')
  if (run.status !== 'approved') {
    throw new Error(
      `Cannot request payment — run status is ${run.status}, must be approved`,
    )
  }

  const amount = Number(run.total_amount ?? 0)
  if (amount <= 0) {
    throw new Error('Payroll run has no total_amount recorded; cannot request payment')
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('payroll_payment_requests')
    .insert({
      payroll_run_id: run.id,
      requested_by: user.id,
      amount,
      target_pool: 'hr_opex',
      status: 'submitted',
    })
    .select('id')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
      throw new Error(
        'A payment request is already active for this payroll run. Cancel it first if you need to re-submit.',
      )
    }
    throw new Error(`Failed to create payment request: ${insertErr.message}`)
  }

  revalidatePath(`/hr-costing/payroll/${run.period_month}`)
  revalidatePath('/hr-costing/payroll')
  revalidatePath('/dashboard')
  revalidatePath('/payments')
  return inserted.id
}

/**
 * Stage D cancel — HR withdraws a still-submitted payment request before
 * Finance has generated a PV. RLS enforces ownership + submitted status.
 */
export async function cancelPayrollPaymentRequest(
  requestId: string,
  reason: string,
): Promise<void> {
  const user = await requireRole(['hr'])
  const supabase = await createClient()

  const trimmed = reason.trim()
  if (trimmed.length === 0) throw new Error('Cancellation reason is required')

  const { data: req, error: readErr } = await supabase
    .from('payroll_payment_requests')
    .select('id, payroll_run_id, status, requested_by, payroll_runs(period_month)')
    .eq('id', requestId)
    .maybeSingle()

  if (readErr) throw new Error(`Failed to read request: ${readErr.message}`)
  if (!req) throw new Error('Payment request not found')
  if (req.requested_by !== user.id) {
    throw new Error('You can only cancel your own request')
  }
  if (req.status !== 'submitted') {
    throw new Error(
      `Cannot cancel — request status is ${req.status}. ` +
        (req.status === 'pv_generated'
          ? 'Finance has already generated a PV; ask Finance to void it.'
          : ''),
    )
  }

  const { error: updateErr } = await supabase
    .from('payroll_payment_requests')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancellation_reason: trimmed,
    })
    .eq('id', requestId)
    .eq('status', 'submitted')

  if (updateErr) throw new Error(`Failed to cancel: ${updateErr.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const period = (req.payroll_runs as any)?.period_month
  if (period) revalidatePath(`/hr-costing/payroll/${period}`)
  revalidatePath('/hr-costing/payroll')
  revalidatePath('/dashboard')
  revalidatePath('/payments')
}

/**
 * Copy values from last month's rows into this period's rows.
 * Only affects existing draft rows for p_period — does not create new rows.
 */
export async function copyFromLastMonth(period: string): Promise<{ copied: number }> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const periodDate = new Date(period + 'T00:00:00Z')
  const lastMonth = new Date(periodDate)
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1)
  const lastPeriod = lastMonth.toISOString().slice(0, 10)

  const { data: prior, error: readErr } = await supabase
    .from('hr_monthly_payroll')
    .select('staff_id, basic_salary, statutory_allowance, non_statutory_allowance, ot_hours, ot_amount, commission_amount, unpaid_leave_days')
    .eq('period_month', lastPeriod)

  if (readErr) throw new Error(`Failed to read prior period: ${readErr.message}`)
  if (!prior || prior.length === 0) return { copied: 0 }

  let copied = 0
  for (const r of prior) {
    const { error } = await supabase
      .from('hr_monthly_payroll')
      .update({
        basic_salary: r.basic_salary,
        statutory_allowance: r.statutory_allowance,
        non_statutory_allowance: r.non_statutory_allowance,
        ot_hours: r.ot_hours,
        ot_amount: r.ot_amount,
        commission_amount: r.commission_amount,
        unpaid_leave_days: r.unpaid_leave_days,
      })
      .eq('staff_id', r.staff_id)
      .eq('period_month', period)
      .eq('status', 'draft')
    if (!error) copied++
  }

  revalidatePath(`/hr-costing/payroll/${period}`)
  return { copied }
}
