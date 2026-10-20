import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, fetchByKeys } from '@/lib/paginate'
import type { PreviewRow } from './pay-preview'

type Num = number | string | null

interface StaffRow {
  id: string
  employee_name: string
  employee_code: string | null
  designation: string | null
  employment_type: string
  basic_salary: Num
  hire_date: string | null
  resignation_date: string | null
  epf_category: string
  socso_category: string
  pcb_category: string
  children_count: number
  is_epf_exempt: boolean
  tax_mode: string
  withholding_rate: Num
}

interface PayrollRow {
  staff_id: string
  status: string
  source: string
  basic_salary: Num
  statutory_allowance: Num
  non_statutory_allowance: Num
  unpaid_leave_days: Num
  ot_amount: Num
  deduction_amount: Num
  skbbk_amount: Num
  commission_amount: Num
  commission_adjustment_amount: Num
  gross: Num
  net: Num
}

interface Contribution { employer: Num; employee: Num }
const zero: Contribution = { employer: 0, employee: 0 }
const num = (value: Num | undefined): number => Number(value ?? 0)
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * The salary the payroll row holds — basic, statutory and non-statutory
 * allowance — is the ROW's, as `compute_hr_monthly_payroll` reads it; before
 * the row exists, what the close will write into it (`comm_close_sync_payroll`:
 * the staff record's basic, no allowance). A Revenue Director's allowance on
 * their record is part of their director pay, never paid on top of it (user
 * 2026-10-14). `revenue_pay_preview` reads the same way.
 */
export function payrollSalary(
  staff: Pick<StaffRow, 'basic_salary'>,
  payroll?: Pick<PayrollRow, 'basic_salary' | 'statutory_allowance' | 'non_statutory_allowance'>,
) {
  return payroll
    ? {
      basic: num(payroll.basic_salary),
      statutoryAllowance: num(payroll.statutory_allowance),
      nonStatutoryAllowance: num(payroll.non_statutory_allowance),
    }
    : { basic: num(staff.basic_salary), statutoryAllowance: 0, nonStatutoryAllowance: 0 }
}

/** Same employment window and unrounded wage as revenue_pay_preview SQL. */
export function previewWageWindow(
  period: string,
  staff: Pick<StaffRow, 'hire_date' | 'resignation_date'> & { basic_salary: Num; allowances: Num },
  payroll?: Pick<PayrollRow, 'unpaid_leave_days' | 'deduction_amount'>,
) {
  const [year, month] = period.split('-').map(Number)
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const daysInMonth = new Date(`${end}T00:00:00Z`).getUTCDate()
  const start = staff.hire_date && staff.hire_date > period ? staff.hire_date : period
  const last = staff.resignation_date && staff.resignation_date < end ? staff.resignation_date : end
  const employedDays = start > last ? 0 : (Date.parse(last) - Date.parse(start)) / 86_400_000 + 1
  // PostgreSQL NUMERIC -> INTEGER rounds rather than truncates fractional leave.
  const daysWorked = Math.round(Math.max(employedDays - num(payroll?.unpaid_leave_days), 0))
  const statutoryWages = Math.max(
    (num(staff.basic_salary) + num(staff.allowances)) * daysWorked / daysInMonth - num(payroll?.deduction_amount), 0,
  )
  return { daysInMonth, daysWorked, statutoryWages, basicForPcb: round2(num(staff.basic_salary) * daysWorked / daysInMonth) }
}

export type StatutoryLookup = (name: string, args: Record<string, unknown>) => Promise<unknown>

/**
 * The statutory schedule RPCs, read once per identical call: many
 * full-commission team members share a zero wage, and salaried people often
 * share the same band.
 */
export function statutoryLookup(supabase: SupabaseClient): StatutoryLookup {
  const lookups = new Map<string, Promise<unknown>>()
  return (name, args) => {
    const key = JSON.stringify([name, args])
    if (!lookups.has(key)) {
      lookups.set(key, (async () => {
        const { data, error } = await supabase.rpc(name, args)
        if (error) throw new Error(`Could not read ${name}: ${error.message}`)
        return data
      })())
    }
    return lookups.get(key)!
  }
}

/** One person's EPF / SOCSO / EIS, both shares, and PCB, as the schedules give them. */
export interface ScheduleStatutory {
  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
  pcb: number
}

/**
 * The schedules' contributions on a person's statutory wage for the month,
 * and the PCB on their basic after employee EPF — the lookups
 * `compute_hr_monthly_payroll` makes, dated the month as revenue_pay_preview
 * dates them. No wage, no contribution and no call.
 */
export async function scheduleStatutory(
  lookup: StatutoryLookup,
  person: Pick<StaffRow, 'epf_category' | 'socso_category' | 'pcb_category' | 'children_count' | 'is_epf_exempt' | 'tax_mode'>,
  window: { statutoryWages: number; basicForPcb: number },
  period: string,
): Promise<ScheduleStatutory> {
  async function contribution(name: string, args: Record<string, unknown>): Promise<Contribution> {
    const result = await lookup(name, args)
    return (Array.isArray(result) ? result[0] : result) as Contribution ?? zero
  }
  const args = { p_wages: window.statutoryWages, p_period: period }
  const [epf, socso, eis] = await Promise.all([
    window.statutoryWages > 0 && !person.is_epf_exempt
      ? contribution('lookup_epf', { ...args, p_part: person.epf_category }) : zero,
    window.statutoryWages > 0 ? contribution('lookup_socso', { ...args, p_category: person.socso_category }) : zero,
    window.statutoryWages > 0 ? contribution('lookup_eis', args) : zero,
  ])
  const pcb = person.tax_mode === 'pcb' ? num(await lookup('lookup_pcb', {
    p_income: Math.max(window.basicForPcb - num(epf.employee), 0),
    p_category: person.pcb_category, p_children: person.children_count, p_period: period,
  }) as Num) : 0
  return {
    epfEr: num(epf.employer), epfEe: num(epf.employee), socsoEr: num(socso.employer), socsoEe: num(socso.employee),
    eisEr: num(eis.employer), eisEe: num(eis.employee), pcb,
  }
}

/**
 * The existing pay RPC starts from saved statements. Before the first run,
 * read the effective team and supply its exact same salary inputs using the
 * existing statutory lookup RPCs. Call only AFTER revenue_pay_preview has
 * succeeded: that function enforces the individual salary HR/Principal gate.
 * Nothing in this path creates payroll or saves a commission run.
 */
export async function loadPayBeforeRun(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
  previewStaffIds: readonly string[] = [],
): Promise<PreviewRow[]> {
  const [year, month] = period.split('-').map(Number)
  const asAt = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const members = await fetchAllRows<{ staff_id: string }>((from, to) => supabase.from('comm_hierarchy')
    .select('staff_id, comm_schemes!inner (sub_department_id, is_active, effective_to)')
    .eq('comm_schemes.sub_department_id', subDepartmentId).eq('comm_schemes.is_active', true)
    .is('comm_schemes.effective_to', null).lte('effective_from', asAt)
    .or(`effective_to.is.null,effective_to.gte.${asAt}`).order('id').range(from, to))
  const staffIds = [...new Set([...members.map(member => member.staff_id), ...previewStaffIds])]
  const [staff, payroll, elsewhere] = await Promise.all([
    fetchByKeys<StaffRow, string>(staffIds, async chunk => ({
      data: await fetchAllRows<StaffRow>((from, to) => supabase.from('hr_staff_costs')
        .select('id, employee_name, employee_code, designation, employment_type, basic_salary, hire_date, resignation_date, epf_category, socso_category, pcb_category, children_count, is_epf_exempt, tax_mode, withholding_rate')
        .in('id', chunk).order('id').range(from, to)), error: null,
    })),
    fetchByKeys<PayrollRow, string>(staffIds, async chunk => ({
      data: await fetchAllRows<PayrollRow>((from, to) => supabase.from('hr_monthly_payroll')
        .select('staff_id, status, source, basic_salary, statutory_allowance, non_statutory_allowance, unpaid_leave_days, ot_amount, deduction_amount, skbbk_amount, commission_amount, commission_adjustment_amount, gross, net')
        .eq('period_month', period).in('staff_id', chunk).order('id').range(from, to)), error: null,
    })),
    fetchByKeys<{ staff_id: string; total_commission: Num }, string>(staffIds, async chunk => ({
      data: await fetchAllRows<{ staff_id: string; total_commission: Num }>((from, to) => supabase.from('comm_statements')
        .select('staff_id, total_commission, comm_runs!inner (period_month, sub_department_id, status)')
        .in('staff_id', chunk).eq('comm_runs.period_month', period)
        .neq('comm_runs.sub_department_id', subDepartmentId).in('comm_runs.status', ['applied', 'locked'])
        .order('id').range(from, to)), error: null,
    })),
  ])
  const payrollByPerson = new Map(payroll.map(row => [row.staff_id, row]))
  const elsewhereByPerson = new Map<string, number>()
  for (const row of elsewhere) elsewhereByPerson.set(row.staff_id, (elsewhereByPerson.get(row.staff_id) ?? 0) + num(row.total_commission))

  const lookup = statutoryLookup(supabase)

  const preview = await Promise.all(staff.map(async person => {
    const pay = payrollByPerson.get(person.id)
    const salary = payrollSalary(person, pay)
    const window = previewWageWindow(period, { ...person, basic_salary: salary.basic, allowances: salary.statutoryAllowance }, pay)
    const statutory = await scheduleStatutory(lookup, person, window, period)
    return {
      staff_id: person.id, employee_name: person.employee_name, employee_code: person.employee_code,
      designation: person.designation, employment_type: person.employment_type,
      basic_salary: salary.basic, statutory_allowance: salary.statutoryAllowance,
      non_statutory_allowance: salary.nonStatutoryAllowance, ot_amount: num(pay?.ot_amount),
      deduction_amount: num(pay?.deduction_amount), skbbk_amount: num(pay?.skbbk_amount), unpaid_leave_days: num(pay?.unpaid_leave_days),
      days_worked: window.daysWorked, days_in_month: window.daysInMonth,
      tax_mode: person.tax_mode, withholding_rate: num(person.withholding_rate), statutory_wages: round2(window.statutoryWages),
      epf_er: statutory.epfEr, epf_ee: statutory.epfEe, socso_er: statutory.socsoEr, socso_ee: statutory.socsoEe,
      eis_er: statutory.eisEr, eis_ee: statutory.eisEe, pcb: statutory.pcb,
      commission_here: 0, commission_elsewhere: elsewhereByPerson.get(person.id) ?? 0,
      payroll_exists: Boolean(pay), payroll_status: pay?.status ?? null, payroll_source: pay?.source ?? null,
      payroll_commission: pay?.commission_amount ?? null, payroll_adjustment: num(pay?.commission_adjustment_amount),
      payroll_gross: pay?.gross ?? null, payroll_net: pay?.net ?? null,
    }
  }))
  return preview.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
}
