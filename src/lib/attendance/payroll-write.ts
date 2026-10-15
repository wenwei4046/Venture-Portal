import 'server-only'
import { getUser, mayActOn, requireActionOn } from '@/lib/auth'
import { opensPage } from '@/lib/page-tabs'
import { fetchByKeys } from '@/lib/paginate'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'
import {
  payrollFields,
  payrollMarks,
  planPayroll,
  type AttendanceFact,
  type AttendancePay,
  type PayrollMark,
  type PayrollRowLite,
  type PayrollStatus,
  type PayrollStep,
  type SkipReason,
  type StaffLite,
} from './payroll'

/**
 * Month close → HQ's payroll (2026-10-15; the rules: lib/attendance/payroll.ts).
 * Written under the closer's OWN session, so the rows' policies, the payroll
 * trigger (pro-rata, statutory, gross, net) and the lifecycle guard answer as
 * they do for a save on HR › Payroll — and only for an account holding HR
 * Costing · Edit on Payroll; a row that does not exist yet is made only with
 * Create as well, as Create period asks.
 */

type Db = Awaited<ReturnType<typeof createClient>>

/** What one close sent: nothing at all when the closer may not edit payroll; `failed` when payroll could not be read. */
export interface PayrollSend {
  allowed: boolean
  written: number
  left: Array<{ staffId: string; name: string; reason: SkipReason }>
  failed?: boolean
}

const num = (v: unknown) => Number(v ?? 0)

/** The month's payroll rows, by person, and the staff records of the people asked about. */
async function readPayroll(supabase: Db, month: string, staffIds: readonly string[]) {
  const [rowsRes, recs] = await Promise.all([
    supabase
      .from('hr_monthly_payroll')
      .select('id, staff_id, status, source, basic_salary, statutory_allowance, attendance_figures')
      .eq('period_month', month),
    fetchByKeys(staffIds, chunk =>
      supabase
        .from('hr_staff_costs')
        .select('id, basic_salary, allowances, employment_type, status, departments(payroll_source)')
        .in('id', chunk),
    'attendance payroll staff'),
  ])
  if (rowsRes.error) throw new Error(`The month's payroll could not be read: ${rowsRes.error.message}`)
  const rows = new Map<string, PayrollRowLite>()
  for (const r of rowsRes.data ?? []) {
    rows.set(r.staff_id, {
      id: r.id,
      staffId: r.staff_id,
      status: r.status as PayrollStatus,
      source: r.source,
      basic: num(r.basic_salary),
      statutoryAllowance: num(r.statutory_allowance),
      attendance: (r.attendance_figures as unknown as AttendancePay | null) ?? null,
    })
  }
  const staff = new Map<string, StaffLite>()
  for (const s of recs) {
    const dept = s.departments as { payroll_source: string | null } | null
    staff.set(s.id, {
      id: s.id,
      basic_salary: num(s.basic_salary),
      allowances: num(s.allowances),
      employment_type: s.employment_type,
      payroll_source: dept?.payroll_source ?? null,
      active: s.status === 'active',
    })
  }
  return { rows, staff }
}

/** One step's write: a draft row's three columns and their figures, or the row Create period would make, with them. */
async function writeStep(supabase: Db, step: Exclude<PayrollStep, { kind: 'skip' }>): Promise<true | SkipReason> {
  const fields = { ...payrollFields(step.pay), attendance_figures: step.pay as unknown as Json }
  if (step.kind === 'update') {
    const { data, error } = await supabase
      .from('hr_monthly_payroll')
      .update(fields)
      .eq('id', step.rowId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle()
    if (error) return 'failed'
    return data ? true : 'changed'
  }
  const { error } = await supabase.from('hr_monthly_payroll').insert({ ...step.seed, ...fields })
  if (error) return error.code === '23505' ? 'changed' : 'failed'
  return true
}

/** Send a closed month's facts to HQ's payroll rows. `closedAt` is the close's own stamp (att_months.closed_at). */
export async function sendToPayroll(month: string, closedAt: string, facts: readonly AttendanceFact[]): Promise<PayrollSend> {
  if (!(await mayActOn('/hr-costing/payroll', 'hr_costing', 'edit'))) return { allowed: false, written: 0, left: [] }
  await requireActionOn('/hr-costing/payroll', 'hr_costing', 'edit')
  const mayCreate = await mayActOn('/hr-costing/payroll', 'hr_costing', 'create')
  const supabase = await createClient()
  const { rows, staff } = await readPayroll(supabase, month, facts.map(f => f.staffId))
  const steps = planPayroll(month, closedAt, facts, rows, staff, { mayCreate })

  let written = 0
  const left: PayrollSend['left'] = []
  const writes = steps.filter((s): s is Exclude<PayrollStep, { kind: 'skip' }> => s.kind !== 'skip')
  for (const s of steps) if (s.kind === 'skip') left.push({ staffId: s.staffId, name: s.name, reason: s.reason })
  // A few rows at a time: each one runs the payroll trigger and its audit row.
  for (let i = 0; i < writes.length; i += 6) {
    const chunk = writes.slice(i, i + 6)
    const outcomes = await Promise.all(chunk.map(s => writeStep(supabase, s)))
    outcomes.forEach((o, j) => {
      if (o === true) written++
      else left.push({ staffId: chunk[j].staffId, name: chunk[j].name, reason: o })
    })
  }
  return { allowed: true, written, left }
}

/**
 * Where each HQ person's payroll stands after the month's close — for a reader
 * of HR Costing whose Payroll tab is open; null for anybody else (the page then
 * says nothing about payroll beyond its own words).
 */
export async function payrollMarksFor(
  month: string,
  closedAt: string,
  people: ReadonlyArray<{ staffId: string; name: string }>,
): Promise<Array<{ staffId: string; name: string; mark: PayrollMark }> | null> {
  const user = await getUser()
  if (!user || !can(user, 'hr_costing') || !opensPage(user.tabs, '/hr-costing/payroll')) return null
  try {
    const { rows, staff } = await readPayroll(await createClient(), month, people.map(p => p.staffId))
    return payrollMarks(closedAt, people, rows, staff)
  } catch {
    return null
  }
}
