'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import {
  resolveCommissionWrite,
  type DerivedCommissionRow,
} from '@/lib/commission/derived-commission'
import { assertPeriodOpen } from '@/lib/period-lock'
import { postPayrollAccrualJVs } from '@/lib/payroll-accrual'
import { seedPayrollRows } from '@/lib/payroll-period'

/**
 * HR submits the month's payroll straight to Finance — NO Principal approval.
 * Wraps submit_payroll_to_principal RPC (name kept for compatibility; since
 * migration 278 it lands the run directly in status='approved' so Finance's
 * billing view + payment-request flow unlock immediately).
 */
export async function submitToFinance(period: string): Promise<void> {
  const user = await requirePermission('hr_costing')
  const supabase = await createClient()

  // Period-lock gate — RPC assumes caller already checked.
  await assertPeriodOpen(supabase, period)

  const { data, error } = await supabase.rpc('submit_payroll_to_principal', {
    p_period: period,
    p_user_id: user.id,
  })

  if (error) throw new Error(`Submit failed: ${error.message}`)
  if (!data) throw new Error('Submit failed: no run id returned')

  // Post the per-segment staff accrual JVs HERE (2026-09-03): since mig 278
  // the run lands directly in 'approved', so the Principal-approval page —
  // which used to carry this call — never fires for the direct-submit path.
  // August's staff accruals were missed entirely that way and had to be
  // backfilled by hand (JE-202608-0580..0584). Idempotent per (period,
  // segment); a genuine amount conflict with an existing JV fails LOUD, same
  // as on the approval path — reverse the stale JV, then resubmit.
  await postPayrollAccrualJVs(supabase as unknown as SupabaseClient, {
    periodMonth: period,
    kind: 'staff',
    runId: data as string,
    userId: user.id,
  })

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
  const user = await requirePermission('hr_costing')
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

async function assertDraftRowsOpen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<void> {
  const uniqueIds = [...new Set(ids)]
  const { data, error } = await supabase.from('hr_monthly_payroll')
    .select('id, status, period_month').in('id', uniqueIds)
  if (error) throw new Error(`Could not check payroll rows: ${error.message}`)
  if (data?.length !== uniqueIds.length) throw new Error('Payroll row not found. Refresh before saving.')
  if (data.some(row => row.status !== 'draft')) throw new Error('Only draft payroll can be edited. Refresh before saving.')
  for (const period of new Set(data.map(row => row.period_month))) await assertPeriodOpen(supabase, period)
}

/**
 * Commission is not HR's to type for a Revenue salesperson — the commission run
 * owns that field. Looks up who is on commission payroll and hands each row to
 * `resolveCommissionWrite`, which decides between passing it, dropping an
 * unchanged value, and refusing an edit that would actually move the number.
 *
 * The grid renders the same cell read-only. This is the half a crafted request
 * cannot get past.
 */
async function stripDerivedCommission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: { id: string; fields: PayrollRowUpdate }[],
): Promise<{ id: string; fields: PayrollRowUpdate }[]> {
  const withCommission = rows.filter(r => r.fields.commission_amount !== undefined)
  if (withCommission.length === 0) return rows

  const { data, error } = await supabase
    .from('hr_monthly_payroll')
    .select('id, source, commission_amount, hr_staff_costs!inner (employee_name, departments (payroll_source))')
    .in('id', withCommission.map(r => r.id))
  if (error) throw new Error(`Could not check commission ownership: ${error.message}`)

  const derived = new Map<string, DerivedCommissionRow>(
    ((data ?? []) as unknown as Array<{
      id: string
      source: string
      commission_amount: number | string
      hr_staff_costs: {
        employee_name: string
        departments: { payroll_source: string } | { payroll_source: string }[]
      }
    }>).map(r => {
      // PostgREST returns an embedded one-to-one as an object or, when it
      // cannot prove the relationship is singular, a one-element array.
      const dept = Array.isArray(r.hr_staff_costs.departments)
        ? r.hr_staff_costs.departments[0]
        : r.hr_staff_costs.departments
      return [
        r.id,
        {
          isDerived: r.source === 'commission' || dept?.payroll_source === 'commission',
          stored: Number(r.commission_amount),
          name: r.hr_staff_costs.employee_name,
        },
      ]
    }),
  )

  return rows.map(r => ({
    id: r.id,
    fields: resolveCommissionWrite(r.fields, derived.get(r.id)),
  }))
}

/**
 * Update one payroll row. The DB trigger recomputes pro-rata + statutory + gross/net.
 * Only allowed while status='draft'.
 */
export async function updatePayrollRow(
  id: string,
  fields: PayrollRowUpdate,
): Promise<void> {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  await assertDraftRowsOpen(supabase, [id])
  const [row] = await stripDerivedCommission(supabase, [{ id, fields }])

  const { data, error } = await supabase
    .from('hr_monthly_payroll')
    .update(row.fields)
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to update payroll row: ${error.message}`)
  if (!data) throw new Error('Payroll changed while saving. Refresh before retrying.')

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
  await requirePermission('hr_costing')
  if (updates.length === 0) return { saved: 0 }

  const supabase = await createClient()
  await assertDraftRowsOpen(supabase, updates.map(row => row.id))
  const cleaned = await stripDerivedCommission(supabase, updates)

  let saved = 0
  const failures: string[] = []
  for (const u of cleaned) {
    const { data, error } = await supabase
      .from('hr_monthly_payroll')
      .update(u.fields)
      .eq('id', u.id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle()
    if (error) failures.push(error.message)
    else if (!data) failures.push('Payroll changed while saving. Refresh before retrying.')
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
  const user = await requirePermission('hr_costing')
  const supabase = await createClient()

  await assertDraftRowsOpen(supabase, [id])
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
    .select('id, source, status, gross, epf_er, epf_ee, socso_ee, eis_ee, pcb, withholding_tax, skbbk_amount')
    .eq('id', id)
    .single()
  if (fetchErr || !row) throw new Error('Payroll row not found')
  if (row.status !== 'draft') throw new Error('Cannot edit statutory on a non-draft payroll row')

  // Net = gross - epf_ee - socso_ee - eis_ee - pcb - withholding tax. Apply the
  // override values for whichever EE fields the caller passed; existing values
  // stand for the rest. Withholding Tax is never one of them — it is not an
  // overridable statutory field — but it must stay in the formula or overriding
  // any statutory on a Revenue salesperson would quietly hand back their tax.
  const merged = { ...row, ...writes }
  const gross = Number(row.gross)
  const net = Math.round(
    (gross -
      Number(merged.epf_ee ?? 0) -
      Number(merged.socso_ee ?? 0) -
      Number(merged.eis_ee ?? 0) -
      Number(merged.pcb ?? 0) -
      Number(row.withholding_tax ?? 0) -
      Number(row.skbbk_amount ?? 0)) * 100
  ) / 100

  const { data: updatedRow, error: updErr } = await supabase
    .from('hr_monthly_payroll')
    .update({
      ...writes,
      // Revenue's trigger owns its net-basic/commission reconciliation.
      ...(row.source === 'commission'
        ? (writes.pcb !== undefined ? { pcb_override_amount: writes.pcb } : {})
        : { gross, net }),
      statutory_overridden_at: new Date().toISOString(),
      statutory_overridden_by: user.id,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (updErr) throw new Error(`Failed to update statutory: ${updErr.message}`)
  if (!updatedRow) throw new Error('Payroll changed while saving. Refresh before retrying.')

  revalidatePath('/hr-costing/payroll', 'layout')
}

export async function resetStaffStatutoryToLookup(id: string): Promise<void> {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  await assertDraftRowsOpen(supabase, [id])
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

  const { data: resetRow, error: updErr } = await supabase
    .from('hr_monthly_payroll')
    .update({
      basic_salary: row.basic_salary,
      pcb_override_amount: null,
      statutory_overridden_at: null,
      statutory_overridden_by: null,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (updErr) throw new Error(`Failed to reset statutory: ${updErr.message}`)
  if (!resetRow) throw new Error('Payroll changed while resetting. Refresh before retrying.')

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
  await requirePermission('hr_costing')
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
  await requirePermission('hr_costing')
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
    .neq('source', 'commission')

  if (error) throw new Error(`Failed to delete payroll month: ${error.message}`)

  revalidatePath(`/hr-costing/payroll/${period}`)
  revalidatePath('/hr-costing/payroll')
  revalidatePath('/dashboard')

  return { deleted: count ?? 0 }
}

/**
 * Create rows for every active staff in the given period.
 * Idempotent — relies on uq_monthly_payroll_staff_period to skip existing.
 * Same behavior as migration 126 backfill, now callable from the UI — except
 * that variable pay (a director, since 2026-09-11) is left out: their figure
 * is keyed on the Director Salary page, which submits to Finance on its own.
 * `seedPayrollRows` in lib/payroll-period.ts owns that rule.
 */
export async function createPayrollPeriod(period: string): Promise<{ created: number }> {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  await assertPeriodOpen(supabase, period)
  const { data: staff, error: staffErr } = await supabase
    .from('hr_staff_costs')
    .select('id, basic_salary, allowances, employment_type, departments(payroll_source)')
    .eq('status', 'active')

  if (staffErr) throw new Error(`Failed to read staff: ${staffErr.message}`)
  if (!staff || staff.length === 0) return { created: 0 }

  // Upsert: insert if not exists, ignore if exists
  const rows = seedPayrollRows(
    staff.map(s => ({
      id: s.id,
      basic_salary: s.basic_salary,
      allowances: s.allowances,
      employment_type: s.employment_type,
      payroll_source: s.departments?.payroll_source ?? null,
    })),
    period,
  )
  if (rows.length === 0) return { created: 0 }

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
  const user = await requirePermission('hr_costing')
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
  const user = await requirePermission('hr_costing')
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
  await requirePermission('hr_costing')
  const supabase = await createClient()
  await assertPeriodOpen(supabase, period)

  const periodDate = new Date(period + 'T00:00:00Z')
  const lastMonth = new Date(periodDate)
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1)
  const lastPeriod = lastMonth.toISOString().slice(0, 10)

  const { data: prior, error: readErr } = await supabase
    .from('hr_monthly_payroll')
    .select('staff_id, basic_salary, statutory_allowance, non_statutory_allowance, ot_hours, ot_amount, commission_amount, unpaid_leave_days, hr_staff_costs(departments(payroll_source))')
    .eq('period_month', lastPeriod)
    .neq('source', 'commission')

  if (readErr) throw new Error(`Failed to read prior period: ${readErr.message}`)
  if (!prior || prior.length === 0) return { copied: 0 }

  let copied = 0
  for (const r of prior) {
    if (r.hr_staff_costs?.departments?.payroll_source === 'commission') continue
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
      .neq('source', 'commission')
    if (!error) copied++
  }

  revalidatePath(`/hr-costing/payroll/${period}`)
  return { copied }
}
