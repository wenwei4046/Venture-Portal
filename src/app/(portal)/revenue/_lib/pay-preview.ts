import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPayRow, type PayRow, type TaxMode } from '@/lib/revenue-pay'
import { normalisePayLine, payLineTotals, type PayLine } from '@/lib/revenue-pay-lines'
import { fetchAllRows } from '@/lib/paginate'
import { loadPayBeforeRun } from './pay-preview-before-run'

/**
 * The month's pay board: every salesperson in the run, from the commission the
 * engine worked out to the money that reaches their account.
 *
 * Two sources, deliberately kept apart. The COMMISSION and its parts come from
 * the run's statements — the snapshot the engine committed to, never
 * recomputed here. The SALARY inputs come from `revenue_pay_preview`, which
 * reads the payroll row's basic and allowances as the payroll trigger does
 * (before the row exists, the staff master's basic and no allowance — what the
 * close writes) and the statutory schedules with the trigger's own lookups.
 * The arithmetic joining them is `lib/revenue-pay.ts`.
 *
 * Before payroll exists this is a PREVIEW. Once it exists the board shows the
 * payroll row beside it and says so when the two disagree, which is the only
 * honest thing to do: HR may have keyed something, or the run may have been
 * recomputed since it was synced.
 */

export interface PayBoardRow extends PayRow {
  /** From the run's statement, or nulls when the run paid them nothing. */
  components: {
    rankKey: string | null
    productRate: number
    productRevenue: number
    groupRevenue: number
    deferredRevenue: number
    productCommission: number
    kpiCommission: number
    openBillBonus: number
    overrideCommission: number
    marginIncentive: number
    groupIncentive: number
    marginPenaltyWithheld: number
    marginPct: number | null
  } | null
}

export interface PayBoard {
  runStatus: string | null
  runId: string | null
  rows: PayBoardRow[]
  /** People the month's orders name who the run left out entirely. */
  missing: number
}

export interface PreviewRow {
  staff_id: string
  employee_name: string
  employee_code: string | null
  designation: string | null
  employment_type: string
  basic_salary: number | string
  statutory_allowance: number | string
  non_statutory_allowance: number | string
  ot_amount: number | string
  deduction_amount: number | string
  skbbk_amount: number | string
  unpaid_leave_days: number | string
  days_worked: number
  days_in_month: number
  tax_mode: string
  withholding_rate: number | string
  statutory_wages: number | string
  epf_er: number | string
  epf_ee: number | string
  socso_er: number | string
  socso_ee: number | string
  eis_er: number | string
  eis_ee: number | string
  pcb: number | string
  commission_here: number | string
  commission_elsewhere: number | string
  payroll_exists: boolean
  payroll_status: string | null
  payroll_source: string | null
  payroll_commission: number | string | null
  payroll_adjustment: number | string | null
  payroll_gross: number | string | null
  payroll_net: number | string | null
}

interface StatementRow {
  staff_id: string
  rank_key: string | null
  product_rate: number | string
  product_revenue: number | string
  group_revenue: number | string
  deferred_revenue: number | string
  product_commission: number | string
  kpi_commission: number | string
  open_bill_bonus: number | string
  override_commission: number | string
  margin_incentive: number | string
  group_incentive: number | string
  margin_penalty_withheld: number | string
  margin_pct: number | string | null
}

function taxMode(v: string): TaxMode {
  return v === 'withholding' || v === 'none' ? v : 'pcb'
}

/**
 * The month's pay lines, everybody's (2026-09-27, `revenue_pay_lines`) — what
 * HR added on Comm Cal, a few dozen rows at most. Read only once
 * `revenue_pay_preview` has let the caller see individual pay; the table's own
 * policy is the same gate.
 */
export async function loadPayLines(supabase: SupabaseClient, period: string): Promise<Map<string, PayLine[]>> {
  const rows = await fetchAllRows<unknown>((from, to) => supabase
    .from('revenue_pay_lines')
    .select('id, staff_id, kind, description, amount, version, sort_order, created_at, claim_id')
    .eq('period_month', period)
    .order('staff_id')
    .order('sort_order')
    .order('created_at')
    .order('id')
    .range(from, to))
  const byPerson = new Map<string, PayLine[]>()
  for (const raw of rows) {
    const { staffId, ...line } = normalisePayLine(raw)
    byPerson.set(staffId, [...(byPerson.get(staffId) ?? []), line])
  }
  return byPerson
}

/** A person's pay-line totals, as the pay arithmetic takes them. */
function payLineInput(lines: readonly PayLine[] = []) {
  const { earnings, deductions } = payLineTotals(lines)
  return { payLineEarnings: earnings, payLineDeductions: deductions }
}

export async function loadPayBoard(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
  options: { allowWithoutRun?: boolean; previewStaffIds?: readonly string[] } = {},
): Promise<PayBoard> {
  const { data: runData, error: runError } = await supabase
    .from('comm_runs')
    .select('id, status')
    .eq('sub_department_id', subDepartmentId)
    .eq('period_month', period)
    .maybeSingle()
  if (runError) throw new Error(`Could not read the commission run: ${runError.message}`)
  const run = runData as { id: string; status: string } | null
  if (!run && !options.allowWithoutRun) return { runStatus: null, runId: null, rows: [], missing: 0 }

  const [savedPreviewData, statementData] = await Promise.all([
    fetchAllRows<PreviewRow>((from, to) => supabase.rpc('revenue_pay_preview', {
      p_sub_department_id: subDepartmentId, p_period: period,
    }).order('commission_here', { ascending: false }).order('employee_name').order('staff_id').range(from, to)),
    run ? fetchAllRows<StatementRow>((from, to) => supabase
      .from('comm_statements')
      .select(
        'staff_id, rank_key, product_rate, product_revenue, group_revenue, deferred_revenue, product_commission, kpi_commission, open_bill_bonus, override_commission, margin_incentive, group_incentive, margin_penalty_withheld, margin_pct',
      )
      .eq('run_id', run.id).order('id').range(from, to)) : Promise.resolve([]),
  ])
  // Past the individual-pay gate: the salary inputs and the month's pay lines.
  const [previewData, linesByPerson] = await Promise.all([
    !run && options.allowWithoutRun
      ? loadPayBeforeRun(supabase, subDepartmentId, period, options.previewStaffIds)
      : Promise.resolve(savedPreviewData),
    loadPayLines(supabase, period),
  ])

  const statements = new Map(
    ((statementData ?? []) as StatementRow[]).map(s => [
      s.staff_id,
      {
        rankKey: s.rank_key,
        productRate: Number(s.product_rate),
        productRevenue: Number(s.product_revenue),
        groupRevenue: Number(s.group_revenue),
        deferredRevenue: Number(s.deferred_revenue),
        productCommission: Number(s.product_commission),
        kpiCommission: Number(s.kpi_commission),
        openBillBonus: Number(s.open_bill_bonus),
        overrideCommission: Number(s.override_commission),
        marginIncentive: Number(s.margin_incentive),
        groupIncentive: Number(s.group_incentive),
        marginPenaltyWithheld: Number(s.margin_penalty_withheld),
        marginPct: s.margin_pct === null ? null : Number(s.margin_pct),
      },
    ]),
  )

  const rows: PayBoardRow[] = ((previewData ?? []) as PreviewRow[]).map(p => ({
    ...buildPayRow({
      staffId: p.staff_id,
      employeeName: p.employee_name,
      employeeCode: p.employee_code,
      designation: p.designation,
      employmentType: p.employment_type,
      commissionHere: Number(p.commission_here),
      commissionElsewhere: Number(p.commission_elsewhere),
      payrollAdjustment: Number(p.payroll_adjustment ?? 0),
      payrollExists: p.payroll_exists,
      payrollStatus: p.payroll_status,
      payrollCommission: p.payroll_commission === null ? null : Number(p.payroll_commission),
      payrollGross: p.payroll_gross === null ? null : Number(p.payroll_gross),
      payrollNet: p.payroll_net === null ? null : Number(p.payroll_net),
      input: {
        basicSalary: Number(p.basic_salary),
        statutoryAllowance: Number(p.statutory_allowance),
        nonStatutoryAllowance: Number(p.non_statutory_allowance),
        otAmount: Number(p.ot_amount),
        deductionAmount: Number(p.deduction_amount),
        skbbkAmount: Number(p.skbbk_amount),
        daysWorked: p.days_worked,
        daysInMonth: p.days_in_month,
        epfEr: Number(p.epf_er),
        epfEe: Number(p.epf_ee),
        socsoEr: Number(p.socso_er),
        socsoEe: Number(p.socso_ee),
        eisEr: Number(p.eis_er),
        eisEe: Number(p.eis_ee),
        pcb: Number(p.pcb),
        taxMode: taxMode(p.tax_mode),
        withholdingRate: Number(p.withholding_rate ?? 0),
        ...payLineInput(linesByPerson.get(p.staff_id)),
      },
      lines: linesByPerson.get(p.staff_id) ?? [],
    }),
    components: statements.get(p.staff_id) ?? null,
  }))

  return { runStatus: run?.status ?? null, runId: run?.id ?? null, rows, missing: 0 }
}
