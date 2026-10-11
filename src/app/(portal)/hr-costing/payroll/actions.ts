'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import {
  resolveCommissionWrite,
  type DerivedCommissionRow,
} from '@/lib/commission/derived-commission'
import { assertPeriodOpen } from '@/lib/period-lock'
import { postPayrollBatchAccrualJVs } from '@/lib/payroll-accrual'
import { isTopupKind, type TopupKind } from '@/lib/payroll-lifecycle'
import { seedPayrollRows } from '@/lib/payroll-period'
import {
  isStatutoryField,
  payrollRowWrite,
  STATUTORY_OVERRIDE_COLUMNS,
  type PayrollEditField,
  type PayrollStatutoryField,
  type PayrollTaxMode,
  type StatutoryOverrideColumn,
} from '@/lib/payroll-grid'

// ─── The unified Payroll (2026-09-27) ───────────────────────────────────────
// A person's pay moves draft → completed → submitted → paid. HR completes
// staff here; a salesperson completes when closed on Comm Cal, a Director
// when Director Salary is Completed. Submit to Finance sends everybody
// Completed as one BATCH (its own funding request, its own accrual JVs) and
// can be pressed again for the next group; Resubmit unlocks somebody already
// sent so a second batch can pay the difference; Total Close ends the month.
// Every rule lives in the payroll_* database functions — these wrap them.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])-01$/

function assertPeriod(period: unknown): asserts period is string {
  if (typeof period !== 'string' || !PERIOD.test(period)) throw new Error('A payroll month is its first day, e.g. 2026-09-01')
}

function assertIds(ids: unknown, what: string): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error(`Tick somebody to ${what}.`)
  if (ids.length > 500 || ids.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('Refresh the page and try again — the selection did not come through.')
  }
}

function revalidatePayroll(period: string) {
  revalidatePath(`/hr-costing/payroll/${period}`)
  revalidatePath('/hr-costing/payroll')
  revalidatePath('/hr-costing/payment')
  revalidatePath('/director-salary')
  revalidatePath('/payments/payroll-requests')
  revalidatePath('/billing')
  revalidatePath('/dashboard')
}

/** Tick → Complete: the figures are checked and wait for the next batch. */
export async function completePayrollRows(period: string, ids: string[]): Promise<{ completed: number; unchanged: number }> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  assertPeriod(period)
  assertIds(ids, 'complete')
  const supabase = await createClient()
  await assertPeriodOpen(supabase, period)
  const { data, error } = await supabase.rpc('payroll_complete_rows', { p_period: period, p_row_ids: ids })
  if (error) throw new Error(error.message)
  revalidatePayroll(period)
  const result = (data ?? {}) as { completed?: number; unchanged?: number }
  return { completed: Number(result.completed ?? 0), unchanged: Number(result.unchanged ?? 0) }
}

/** Completed but not yet sent: back to an editable draft. */
export async function unlockPayrollRows(period: string, ids: string[]): Promise<{ unlocked: number }> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  assertPeriod(period)
  assertIds(ids, 'unlock')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payroll_uncomplete_rows', { p_period: period, p_row_ids: ids })
  if (error) throw new Error(error.message)
  revalidatePayroll(period)
  return { unlocked: Number(data ?? 0) }
}

export interface SubmittedBatch {
  batchId: string
  batchNo: number
  people: number
  total: number
  /** Accrual JVs posted, by segment ("hr", "director", …). */
  accruals: string[]
}

/**
 * Submit to Finance: everybody Completed, as one batch. The page sends what
 * it showed (headcount and CTC); the database refuses if that moved since.
 * The batch's accrual JVs are posted here (per batch, idempotent), dated to
 * the payroll month — a top-up batch books only its difference.
 */
export async function submitPayrollBatch(period: string, expectedPeople: number, expectedTotal: number): Promise<SubmittedBatch> {
  const user = await requireActionOn('/hr-costing/payroll', 'hr_costing', 'create')
  assertPeriod(period)
  if (!Number.isInteger(expectedPeople) || expectedPeople < 1 || !Number.isFinite(expectedTotal)) {
    throw new Error('Refresh the page and try again — the batch preview did not come through.')
  }
  const supabase = await createClient()
  await assertPeriodOpen(supabase, period)

  const { data: batchId, error } = await supabase.rpc('payroll_submit_batch', {
    p_period: period,
    p_expected_people: expectedPeople,
    p_expected_total: Math.round(expectedTotal * 100) / 100,
  })
  if (error) throw new Error(error.message)
  if (!batchId) throw new Error('Submit failed: no batch came back')

  const { data: batch, error: readError } = await supabase
    .from('payroll_batches')
    .select('batch_no, people, total_amount')
    .eq('id', batchId as string)
    .single()
  if (readError) throw new Error(`Submitted, but the batch could not be read back: ${readError.message}`)

  // The money has gone to Finance; a JV problem must not pretend otherwise.
  let accruals: string[] = []
  try {
    const posted = await postPayrollBatchAccrualJVs(supabase as unknown as SupabaseClient, {
      periodMonth: period,
      batchId: batchId as string,
      userId: user.id,
    })
    accruals = posted.posted
  } catch (err) {
    revalidatePayroll(period)
    throw new Error(
      `Batch #${batch.batch_no} went to Finance, but its accrual JVs did not post: ${err instanceof Error ? err.message : String(err)}. ` +
      'Ask Finance to post them, or press Retry accruals on the batch.',
    )
  }

  revalidatePayroll(period)
  return { batchId: batchId as string, batchNo: batch.batch_no, people: batch.people, total: Number(batch.total_amount), accruals }
}

/** A batch whose accrual JVs failed to post: try again (idempotent). */
export async function retryPayrollBatchAccruals(period: string, batchId: string): Promise<string[]> {
  const user = await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  assertPeriod(period)
  if (!UUID.test(batchId)) throw new Error('Which batch?')
  const supabase = await createClient()
  const posted = await postPayrollBatchAccrualJVs(supabase as unknown as SupabaseClient, { periodMonth: period, batchId, userId: user.id })
  revalidatePayroll(period)
  return posted.posted
}

/**
 * Resubmit or Second payroll (right-click on somebody already sent): unlock
 * them for another payment. Their amounts may then only go up; Complete and
 * Submit again and the next batch carries the difference. The kind is what
 * the payment is FOR — a correction, or a planned second payment (a
 * sub-department that pays on the 15th) — recorded so it can be traced.
 */
export async function resubmitPayrollRow(
  period: string,
  scope: 'staff' | 'directors',
  rowId: string,
  kind: TopupKind = 'resubmit',
): Promise<void> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'create')
  assertPeriod(period)
  if ((scope !== 'staff' && scope !== 'directors') || !UUID.test(rowId)) throw new Error('Which person?')
  if (!isTopupKind(kind)) throw new Error('Resubmit or Second payroll?')
  const supabase = await createClient()
  await assertPeriodOpen(supabase, period)
  const { error } = await supabase.rpc('payroll_open_topup', { p_scope: scope, p_row_id: rowId, p_kind: kind })
  if (error) throw new Error(error.message)
  revalidatePayroll(period)
}

/** Put an unlocked row back as it was sent — only while nothing changed. */
export async function cancelPayrollResubmit(period: string, scope: 'staff' | 'directors', rowId: string): Promise<void> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  assertPeriod(period)
  if ((scope !== 'staff' && scope !== 'directors') || !UUID.test(rowId)) throw new Error('Which person?')
  const supabase = await createClient()
  const { error } = await supabase.rpc('payroll_cancel_topup', { p_scope: scope, p_row_id: rowId })
  if (error) throw new Error(error.message)
  revalidatePayroll(period)
}

/** Total Close: the month can no longer change. */
export async function closePayrollMonth(period: string): Promise<void> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  assertPeriod(period)
  const supabase = await createClient()
  const { error } = await supabase.rpc('payroll_close_month', { p_period: period })
  if (error) throw new Error(error.message)
  revalidatePayroll(period)
}

/** The Principal's way back into a closed month (audited, with a reason). */
export async function reopenPayrollMonth(period: string, reason: string): Promise<void> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  assertPeriod(period)
  const why = typeof reason === 'string' ? reason.trim() : ''
  if (!why) throw new Error('Say why the month is being reopened.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('payroll_reopen_month', { p_period: period, p_reason: why.slice(0, 500) })
  if (error) throw new Error(error.message)
  revalidatePayroll(period)
}

/** A batch whose funding request was cancelled: file it again, for the same amount. */
export async function refilePayrollBatchRequest(period: string, batchId: string): Promise<void> {
  const user = await requireActionOn('/hr-costing/payroll', 'hr_costing', 'create')
  assertPeriod(period)
  if (!UUID.test(batchId)) throw new Error('Which batch?')
  const supabase = await createClient()
  const { data: batch, error: readError } = await supabase
    .from('payroll_batches')
    .select('id, run_id, status, total_amount, batch_no')
    .eq('id', batchId)
    .maybeSingle()
  if (readError) throw new Error(`Could not read the batch: ${readError.message}`)
  if (!batch || batch.status !== 'submitted') throw new Error('That batch is no longer with Finance — refresh the page.')
  const amount = Number(batch.total_amount)
  if (!(amount > 0)) throw new Error(`Batch #${batch.batch_no} carries no money — there is nothing to fund.`)
  const { error } = await supabase.from('payroll_payment_requests').insert({
    payroll_run_id: batch.run_id,
    batch_id: batch.id,
    period_month: period,
    requested_by: user.id,
    amount,
    target_pool: 'dept_pool_hr',
    status: 'submitted',
  })
  if (error) {
    if (error.code === '23505') throw new Error(`Batch #${batch.batch_no} already has a live funding request.`)
    throw new Error(`Could not file the request: ${error.message}`)
  }
  revalidatePayroll(period)
}

/**
 * One row's save: the inputs, and any statutory figure HR typed (2026-09-30)
 * — `epf_ee`, `pcb`, `epf_er` and the rest, each going to its override column.
 */
export type PayrollRowUpdate = Partial<Record<PayrollEditField, number>>

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
 * The tax mode of each row's person, for the saves that type a PCB: PCB is
 * only somebody's on PCB — withholding tax and "none" compute it as 0.
 */
async function taxModesOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, PayrollTaxMode>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase
    .from('hr_monthly_payroll')
    .select('id, hr_staff_costs!inner (tax_mode)')
    .in('id', ids)
  if (error) throw new Error(`Could not check who is on PCB: ${error.message}`)
  return new Map(
    ((data ?? []) as unknown as Array<{
      id: string
      hr_staff_costs: { tax_mode: PayrollTaxMode } | { tax_mode: PayrollTaxMode }[]
    }>).map(r => {
      const staff = Array.isArray(r.hr_staff_costs) ? r.hr_staff_costs[0] : r.hr_staff_costs
      return [r.id, staff?.tax_mode ?? 'pcb']
    }),
  )
}

/**
 * Every save of a payroll row goes through here — the row's Save, the
 * header's Save and the payslip's statutory editor — so they cannot disagree:
 * draft rows only, a derived commission refused, and a typed statutory figure
 * written to its override column (`payrollRowWrite`), stamped with who typed
 * it. The compute trigger listens to those columns and settles the row.
 * Partial failure keeps going and is reported back, row by row.
 */
async function writePayrollRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  updates: { id: string; fields: PayrollRowUpdate }[],
): Promise<{ saved: number; failures: string[] }> {
  await assertDraftRowsOpen(supabase, updates.map(row => row.id))
  const cleaned = await stripDerivedCommission(supabase, updates)
  const taxModes = await taxModesOf(supabase, cleaned.filter(u => u.fields.pcb !== undefined).map(u => u.id))

  let saved = 0
  const failures: string[] = []
  for (const u of cleaned) {
    let write: ReturnType<typeof payrollRowWrite>
    try {
      write = payrollRowWrite(u.fields, taxModes.get(u.id) ?? null)
    } catch (err) {
      failures.push(err instanceof Error ? err.message : 'That figure could not be saved')
      continue
    }
    const columns = write.typed
      ? { ...write.columns, statutory_overridden_at: new Date().toISOString(), statutory_overridden_by: userId }
      : write.columns
    if (Object.keys(columns).length === 0) {
      saved++
      continue
    }
    const { data, error } = await supabase
      .from('hr_monthly_payroll')
      .update(columns)
      .eq('id', u.id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle()
    if (error) failures.push(error.message)
    else if (!data) failures.push('Payroll changed while saving. Refresh before retrying.')
    else saved++
  }
  return { saved, failures }
}

/**
 * Update one payroll row. The DB trigger recomputes pro-rata, every statutory
 * figure nobody typed, gross and net. Only allowed while status='draft'.
 */
export async function updatePayrollRow(
  id: string,
  fields: PayrollRowUpdate,
): Promise<void> {
  const user = await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  const supabase = await createClient()

  const { failures } = await writePayrollRows(supabase, user.id, [{ id, fields }])
  if (failures.length > 0) throw new Error(failures[0])

  revalidatePath('/hr-costing/payroll', 'layout')
}

/**
 * Batch-save every row the page-level Save button collected. Same rules as
 * updatePayrollRow but one revalidate for the whole batch. Partial failure
 * keeps going — the error reports how many saved so HR knows which rows to
 * re-check.
 */
export async function updatePayrollRows(
  updates: { id: string; fields: PayrollRowUpdate }[],
): Promise<{ saved: number }> {
  const user = await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  if (updates.length === 0) return { saved: 0 }

  const supabase = await createClient()
  const { saved, failures } = await writePayrollRows(supabase, user.id, updates)

  revalidatePath('/hr-costing/payroll', 'layout')

  if (failures.length > 0) {
    throw new Error(
      `Saved ${saved} of ${updates.length} rows — ${failures.length} failed: ${failures[0]}`,
    )
  }
  return { saved }
}

// ─── Typed statutory, and Reset to JADUAL (2026-09-30) ──────────────────────
//
// A typed EPF / SOCSO / EIS (either side) or PCB is kept in the row's own
// *_override_amount column. The compute trigger listens to those columns and
// applies them over the JADUAL lookup every time it runs, so a typed figure
// survives later edits to Basic, OT or unpaid leave, and gross, net and the
// Revenue split always follow it. Reset clears every override; the trigger
// then takes all seven back from JADUAL. Until 2026-09-30 an override was
// written onto the figure itself and lasted only until the next input edit.

export type StaffStatutoryUpdate = Partial<Record<PayrollStatutoryField, number>>

/** The payslip's click-to-edit statutory line: the grid's write, one field at a time. */
export async function updateStaffStatutory(
  id: string,
  fields: StaffStatutoryUpdate,
): Promise<void> {
  const user = await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  const keys = Object.keys(fields ?? {})
  if (keys.length === 0) throw new Error('No statutory fields provided')
  const unknown = keys.find(k => !isStatutoryField(k))
  if (unknown) throw new Error(`Unknown statutory field: ${unknown}`)

  const supabase = await createClient()
  const { failures } = await writePayrollRows(supabase, user.id, [{ id, fields }])
  if (failures.length > 0) throw new Error(failures[0])

  revalidatePath('/hr-costing/payroll', 'layout')
}

/** Reset to JADUAL: every typed statutory figure on the row goes; the lookup takes them back. */
export async function resetStaffStatutoryToLookup(id: string): Promise<void> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  const supabase = await createClient()

  await assertDraftRowsOpen(supabase, [id])
  const cleared = Object.fromEntries(STATUTORY_OVERRIDE_COLUMNS.map(column => [column, null])) as Record<
    StatutoryOverrideColumn,
    null
  >
  const { data: resetRow, error: updErr } = await supabase
    .from('hr_monthly_payroll')
    .update({
      ...cleared,
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
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  if (ids.length === 0) return { deleted: 0 }

  const supabase = await createClient()
  await assertPeriodOpen(supabase, period)

  // A draft under Resubmit has already been paid once — it cannot go.
  const { error, count } = await supabase
    .from('hr_monthly_payroll')
    .delete({ count: 'exact' })
    .in('id', ids)
    .eq('status', 'draft')
    .is('topup_opened_at', null)
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
 * Blocked once anybody of the month has gone to Finance (a batch stands):
 * from then on rows leave one at a time, and only while still drafts.
 */
export async function deletePayrollPeriod(period: string): Promise<{ deleted: number }> {
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  const supabase = await createClient()

  await assertPeriodOpen(supabase, period)

  const { count: standing, error: batchErr } = await supabase
    .from('payroll_batches')
    .select('id', { count: 'exact', head: true })
    .eq('period_month', period)
    .eq('status', 'submitted')
  if (batchErr) throw new Error(`Failed to check the month's batches: ${batchErr.message}`)
  if ((standing ?? 0) > 0) {
    throw new Error(
      'Cannot delete this month — some of it is already with Finance. Remove draft rows one at a time instead.',
    )
  }

  const { error, count } = await supabase
    .from('hr_monthly_payroll')
    .delete({ count: 'exact' })
    .eq('period_month', period)
    .eq('status', 'draft')
    .is('topup_opened_at', null)
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
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'create')
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
 * HR withdraws a batch's still-submitted funding request before Finance has
 * generated a PV (misfiled, wrong day). The batch stays with Finance, marked
 * "No funding request" until it is filed again. RLS enforces ownership.
 */
export async function cancelPayrollPaymentRequest(
  requestId: string,
  reason: string,
): Promise<void> {
  const user = await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
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
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
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
      .is('topup_opened_at', null)
      .neq('source', 'commission')
    if (!error) copied++
  }

  revalidatePath(`/hr-costing/payroll/${period}`)
  return { copied }
}
