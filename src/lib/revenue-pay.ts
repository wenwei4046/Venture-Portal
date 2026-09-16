/**
 * What a month's commission actually pays a salesperson.
 *
 * THE TWIN OF `compute_hr_monthly_payroll` FOR `source = 'commission'`. The
 * trigger is what writes the payroll row, and it only runs once HR has opened
 * the month and the run has been applied. This module answers the same
 * question the moment a run is computed — so the Revenue month can show the
 * salary its commission implies, and HR can check the figure against the rules
 * that produced it before anything is written.
 *
 * It is a TWIN, not a second opinion. Every step below is the trigger's step,
 * in the trigger's order, with the trigger's rounding:
 *
 *   ratio          days worked ÷ days in month, to SIX decimals — the trigger
 *                  assigns it to NUMERIC(10,6), and a month paid on an
 *                  eight-decimal ratio would be a ringgit out by December.
 *   statutory wage prorated basic + prorated statutory allowance − the RM
 *                  deduction, floored at 0. A full-commission salesperson has
 *                  no basic and no statutory allowance, so it is 0 and every
 *                  contribution with it.
 *   gross          commission − EMPLOYER EPF/SOCSO/EIS + prorated statutory
 *                  allowance + prorated OT + non-statutory allowance − the
 *                  deduction. The employer's share is funded OUT of the
 *                  commission: that is what makes this payroll different from
 *                  a salaried one, where it sits beside the wage.
 *   tax            exactly one of PCB and Withholding. PCB is looked up on the
 *                  BASIC alone (after employee EPF) — commission does not
 *                  raise it; withholding is a flat rate on gross.
 *   net            gross less every employee contribution, the tax and SKBBK.
 *   the split      net basic is what the salary PV pays as "basic"; the rest
 *                  is the commission balance. Both come from the same net, so
 *                  they always add back to it.
 *
 * The statutory amounts are NOT computed here — they are schedule lookups, and
 * the schedules are tables in the database. `revenue_pay_preview(sub, period)`
 * reads them with the same `lookup_epf` / `lookup_socso` / `lookup_eis` /
 * `lookup_pcb` the trigger calls, and hands them in.
 */

export type TaxMode = 'pcb' | 'withholding' | 'none'

export interface RevenuePayInput {
  /** Gross commission for the month — every programme's applied share, plus any payroll adjustment. */
  commission: number
  basicSalary: number
  statutoryAllowance: number
  nonStatutoryAllowance: number
  otAmount: number
  deductionAmount: number
  skbbkAmount: number
  daysWorked: number
  daysInMonth: number
  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
  /** As looked up on the basic; ignored unless taxMode is 'pcb'. */
  pcb: number
  taxMode: TaxMode
  withholdingRate: number
}

export interface RevenuePay {
  ratio: number
  proratedBasic: number
  proratedStatutoryAllowance: number
  proratedOt: number
  statutoryWages: number
  /** EPF + SOCSO + EIS the employer pays, funded from the commission. */
  employerContributions: number
  /** EPF + SOCSO + EIS the employee pays. */
  employeeContributions: number
  pcb: number
  withholdingTax: number
  /** Everything taken off gross to reach net. */
  totalDeductions: number
  gross: number
  net: number
  /** The salary PV's "basic" line: prorated basic less the employee's own deductions. */
  basicPayNet: number
  /** The salary PV's second line. Net minus net basic, so the two always tally. */
  commissionBalance: number
  /** A negative balance, surfaced rather than floored — the commission did not cover the month. */
  shortfall: number
  /** A negative net basic: the basic could not carry its own deductions. */
  basicShortfall: number
}

/** The trigger's NUMERIC(10,6). */
export function prorataRatio(daysWorked: number, daysInMonth: number): number {
  if (!Number.isFinite(daysWorked) || !Number.isFinite(daysInMonth)) return 0
  if (daysInMonth <= 0) return 0
  return Math.round((daysWorked / daysInMonth) * 1_000_000) / 1_000_000
}

export function computeRevenuePay(input: RevenuePayInput): RevenuePay {
  const ratio = prorataRatio(input.daysWorked, input.daysInMonth)

  const proratedBasic = input.basicSalary * ratio
  const proratedStat = input.statutoryAllowance * ratio
  const proratedOt = input.otAmount * ratio

  const statutoryWages = Math.max(proratedBasic + proratedStat - input.deductionAmount, 0)

  const employer = round2(input.epfEr + input.socsoEr + input.eisEr)
  const employee = round2(input.epfEe + input.socsoEe + input.eisEe)

  // The trigger rounds gross only when it stores it; withholding and net are
  // both taken off the unrounded figure, so they are taken off it here too.
  const grossRaw =
    input.commission -
    input.epfEr -
    input.socsoEr -
    input.eisEr +
    proratedStat +
    proratedOt +
    input.nonStatutoryAllowance -
    input.deductionAmount

  const pcb = input.taxMode === 'pcb' ? round2(input.pcb) : 0
  const withholdingTax =
    input.taxMode === 'withholding' ? round2(Math.max(grossRaw, 0) * input.withholdingRate) : 0

  const gross = round2(grossRaw)
  const net = round2(
    grossRaw - input.epfEe - input.socsoEe - input.eisEe - pcb - withholdingTax - input.skbbkAmount,
  )

  const basicPayNet = round2(
    round2(input.basicSalary * ratio) - input.epfEe - input.socsoEe - input.eisEe - pcb,
  )
  const commissionBalance = round2(net - basicPayNet)

  return {
    ratio,
    proratedBasic: round2(proratedBasic),
    proratedStatutoryAllowance: round2(proratedStat),
    proratedOt: round2(proratedOt),
    statutoryWages: round2(statutoryWages),
    employerContributions: employer,
    employeeContributions: employee,
    pcb,
    withholdingTax,
    totalDeductions: round2(employee + pcb + withholdingTax + input.skbbkAmount),
    gross,
    net,
    basicPayNet,
    commissionBalance,
    shortfall: Math.max(0, round2(-commissionBalance)),
    basicShortfall: Math.max(0, round2(-basicPayNet)),
  }
}

/**
 * One salesperson's line on the month's pay board: what the run says they
 * earned, and what that becomes after the statutory schedules have had their
 * say.
 */
export interface PayRowSource {
  staffId: string
  employeeName: string
  employeeCode: string | null
  designation: string | null
  employmentType: string
  /** This sub-department's run. */
  commissionHere: number
  /** Other programmes that have already applied for the same month. */
  commissionElsewhere: number
  /** The Payroll-only adjustment already keyed against the month, if any. */
  payrollAdjustment: number
  payrollExists: boolean
  payrollStatus: string | null
  payrollCommission: number | null
  payrollGross: number | null
  payrollNet: number | null
  input: Omit<RevenuePayInput, 'commission'>
}

export interface PayRow extends PayRowSource {
  /** Every programme's share plus the adjustment — what payroll will hold. */
  commission: number
  pay: RevenuePay
  /** The payroll row disagrees with the preview: it was keyed or the run changed since. */
  differsFromPayroll: boolean
}

export function buildPayRow(source: PayRowSource): PayRow {
  const commission = round2(
    source.commissionHere + source.commissionElsewhere + source.payrollAdjustment,
  )
  const pay = computeRevenuePay({ ...source.input, commission })
  const differsFromPayroll =
    source.payrollExists &&
    source.payrollNet !== null &&
    Math.abs(round2(source.payrollNet) - pay.net) >= 0.01
  return { ...source, commission, pay, differsFromPayroll }
}

/** The board's own totals — what the month costs and what it pays out. */
export interface PayTotals {
  people: number
  commission: number
  gross: number
  net: number
  employerContributions: number
  employeeContributions: number
  tax: number
}

export function payTotals(rows: PayRow[]): PayTotals {
  return rows.reduce<PayTotals>(
    (a, r) => ({
      people: a.people + 1,
      commission: round2(a.commission + r.commission),
      gross: round2(a.gross + r.pay.gross),
      net: round2(a.net + r.pay.net),
      employerContributions: round2(a.employerContributions + r.pay.employerContributions),
      employeeContributions: round2(a.employeeContributions + r.pay.employeeContributions),
      tax: round2(a.tax + r.pay.pcb + r.pay.withholdingTax),
    }),
    {
      people: 0,
      commission: 0,
      gross: 0,
      net: 0,
      employerContributions: 0,
      employeeContributions: 0,
      tax: 0,
    },
  )
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
  return value < 0 ? -scaled : scaled
}
