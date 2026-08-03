'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'

/**
 * HR submits the month's payroll straight to Finance — NO Principal approval.
 * Wraps submit_payroll_to_principal RPC (name kept for compatibility; since
 * migration 278 it lands the run directly in status='approved' so Finance's
 * billing view + payment-request flow unlock immediately).
 */
export async function submitToFinance(period: string): Promise<void> {
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
  revalidatePath('/billing')
  revalidatePath('/dashboard')
  redirect(`/hr-costing/payroll/${period}`)
}

/**
 * HR pulls a submitted (auto-approved) run back to draft for edits — the
 * replacement for the removed Principal reject path. Wraps reopen_payroll_run
 * RPC (migration 278): flips the run to 'rejected' with the marker reason
 * 'Reopened by HR for edits' and hr_monthly_payroll rows back to 'draft'.
 * Blocked once a payment request is in flight.
 */
export async function reopenPayroll(period: string): Promise<void> {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  await assertPeriodOpen(supabase, period)

  const { error } = await supabase.rpc('reopen_payroll_run', {
    p_period: period,
    p_user_id: user.id,
  })

  if (error) throw new Error(`Reopen failed: ${error.message}`)

  revalidatePath('/hr-costing/payroll')
  revalidatePath('/billing')
  revalidatePath('/dashboard')
  redirect(`/hr-costing/payroll/${period}`)
}

export interface PayrollRowUpdate {
  basic_salary?: number
  statutory_allowance?: number
  non_statutory_allowance?: number
  ot_hours?: number
  ot_amount?: number
  commission_amount?: number
  unpaid_leave_days?: number
  deduction_amount?: number
  skbbk_amount?: number
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
 * Batch-save every row the page-level Save button collected. Same rules as
 * updatePayrollRow (draft-only, trigger recomputes statutory) but one
 * revalidate for the whole batch. Partial failure keeps going — the error
 * reports how many saved so HR knows which rows to re-check.
 */
export async function updatePayrollRows(
  updates: { id: string; fields: PayrollRowUpdate }[],
): Promise<{ saved: number }> {
  await requireRole(['hr', 'principal'])
  if (updates.length === 0) return { saved: 0 }

  const supabase = await createClient()

  let saved = 0
  const failures: string[] = []
  for (const u of updates) {
    const { error } = await supabase
      .from('hr_monthly_payroll')
      .update(u.fields)
      .eq('id', u.id)
      .eq('status', 'draft')
    if (error) failures.push(error.message)
    else saved++
  }

  revalidatePath('/hr-costing/payroll', 'layout')

  if (failures.length > 0) {
    throw new Error(
      `Saved ${saved} of ${updates.length} rows — ${failures.length} failed: ${failures[0]}`,
    )
  }
  return { saved }
}

// ─── Override / Reset Statutory (Phase 11.2 + PCB 2026-06-04) ──────────────
//
// The compute trigger on hr_monthly_payroll only fires when one of basic_salary,
// statutory_allowance, non_statutory_allowance, ot_*, commission_amount,
// unpaid_leave_days, period_month, or staff_id is in the UPDATE clause. So we
// can update epf_*/socso_*/eis_*/pcb directly without the trigger overwriting
// us. Reset fires a no-op update on basic_salary to force the trigger to
// re-run the JADUAL lookups + recompute gross/net.

const STAFF_STAT_FIELDS = [
  'epf_er',
  'epf_ee',
  'socso_er',
  'socso_ee',
  'eis_er',
  'eis_ee',
  'pcb',
] as const
type StaffStatutoryField = (typeof STAFF_STAT_FIELDS)[number]
export type StaffStatutoryUpdate = Partial<Record<StaffStatutoryField, number>>

export async function updateStaffStatutory(
  id: string,
  fields: StaffStatutoryUpdate,
): Promise<void> {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const allowed = new Set<StaffStatutoryField>(STAFF_STAT_FIELDS)
  const writes: Record<string, number> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.has(k as StaffStatutoryField)) {
      throw new Error(`Unknown statutory field: ${k}`)
    }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${k} must be a non-negative number`)
    }
    writes[k] = Math.round(n * 100) / 100
  }
  if (Object.keys(writes).length === 0) throw new Error('No statutory fields provided')

  const { data: row, error: fetchErr } = await supabase
    .from('hr_monthly_payroll')
    .select('id, status, gross, epf_ee, socso_ee, eis_ee, pcb')
    .eq('id', id)
    .single()
  if (fetchErr || !row) throw new Error('Payroll row not found')
  if (row.status !== 'draft') throw new Error('Cannot edit statutory on a non-draft payroll row')

  // Net = gross - epf_ee - socso_ee - eis_ee - pcb. Apply the override values
  // for whichever EE fields the caller passed; existing values stand for the rest.
  const merged = { ...row, ...writes }
  const net = Math.round(
    (Number(merged.gross ?? 0) -
      Number(merged.epf_ee ?? 0) -
      Number(merged.socso_ee ?? 0) -
      Number(merged.eis_ee ?? 0) -
      Number(merged.pcb ?? 0)) * 100
  ) / 100

  const { error: updErr } = await supabase
    .from('hr_monthly_payroll')
    .update({
      ...writes,
      net,
      statutory_overridden_at: new Date().toISOString(),
      statutory_overridden_by: user.id,
    })
    .eq('id', id)
    .eq('status', 'draft')
  if (updErr) throw new Error(`Failed to update statutory: ${updErr.message}`)

  revalidatePath('/hr-costing/payroll', 'layout')
}

export async function resetStaffStatutoryToLookup(id: string): Promise<void> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  // Pull basic_salary so we can fire a no-op UPDATE that re-triggers the
  // compute_hr_monthly_payroll function. The trigger watches basic_salary,
  // so writing the same value back forces it to recompute statutory + net.
  const { data: row, error: fetchErr } = await supabase
    .from('hr_monthly_payroll')
    .select('id, status, basic_salary')
    .eq('id', id)
    .single()
  if (fetchErr || !row) throw new Error('Payroll row not found')
  if (row.status !== 'draft') throw new Error('Cannot reset statutory on a non-draft payroll row')

  const { error: updErr } = await supabase
    .from('hr_monthly_payroll')
    .update({
      basic_salary: row.basic_salary,
      statutory_overridden_at: null,
      statutory_overridden_by: null,
    })
    .eq('id', id)
    .eq('status', 'draft')
  if (updErr) throw new Error(`Failed to reset statutory: ${updErr.message}`)

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
 * Delete the ENTIRE month's payroll — every draft row for the period.
 * For wiping test/wrongly-created months before anything downstream exists.
 *
 * Blocked when a live (non-rejected) payroll_run exists: the month has been
 * submitted to Finance and its total is referenced by billing/payment flows —
 * reopen the run first, then delete. Only draft rows are removed, so any
 * submitted/paid rows (which can only exist under a live run anyway) survive.
 */
export async function deletePayrollPeriod(period: string): Promise<{ deleted: number }> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  await assertPeriodOpen(supabase, period)

  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('period_month', period)
    .neq('status', 'rejected')
    .maybeSingle()
  if (runErr) throw new Error(`Failed to check payroll run: ${runErr.message}`)
  if (run) {
    throw new Error(
      `Cannot delete this month — its payroll run is already ${run.status}. Reopen the run first, then delete.`,
    )
  }

  const { error, count } = await supabase
    .from('hr_monthly_payroll')
    .delete({ count: 'exact' })
    .eq('period_month', period)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to delete payroll month: ${error.message}`)

  revalidatePath(`/hr-costing/payroll/${period}`)
  revalidatePath('/hr-costing/payroll')
  revalidatePath('/dashboard')

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
  const user = await requireRole(['hr', 'principal'])
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
      target_pool: 'dept_pool_hr',
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
  const user = await requireRole(['hr', 'principal'])
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
  revalidatePath('/hr-costing/payment')
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
