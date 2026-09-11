/** The commissioned basic is funded from commission, not an extra earning. */
export interface RevenuePayrollSplitInput {
  grossCommission: number
  /** Gross basic after pro-rata, before employee deductions. */
  basicPay: number
  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
  pcb: number
  withholdingTax?: number
  otherEarnings?: number
  /** Other deductions, including no-pay RM deductions and SKBBK. */
  otherDeductions?: number
}

export interface RevenuePayrollSplit {
  /** Net basic: gross basic less all EE contributions and PCB. */
  basicPay: number
  basicGross: number
  commissionBalance: number
  totalPayout: number
  /** @deprecated Use totalPayout; v2 includes all employee deductions. */
  totalPayBeforeOtherDeductions: number
  /** Kept visible for correction; a negative balance is never silently floored. */
  shortfall: number
  basicShortfall: number
}

export function computeRevenuePayrollSplit(input: RevenuePayrollSplitInput): RevenuePayrollSplit {
  const grossCommission = cents(input.grossCommission)
  const basicGross = cents(input.basicPay)
  const employer = cents(input.epfEr) + cents(input.socsoEr) + cents(input.eisEr)
  const employee = cents(input.epfEe) + cents(input.socsoEe) + cents(input.eisEe) + cents(input.pcb)
  const basicNet = basicGross - employee
  const totalPayout = grossCommission + cents(input.otherEarnings ?? 0) - employer - employee
    - cents(input.withholdingTax ?? 0) - cents(input.otherDeductions ?? 0)
  return splitResult(basicGross, basicNet, totalPayout - basicNet)
}

export interface RevenuePayrollRow {
  commission_amount: number
  commission_synced_amount?: number | null
  commission_adjustment_amount?: number
  commission_adjustment_reason?: string | null
  basic_salary: number
  prorata_days_worked: number
  prorata_days_in_month: number
  epf_er: number
  epf_ee: number
  socso_er: number
  socso_ee: number
  eis_er: number
  eis_ee: number
  pcb: number
  statutory_allowance?: number
  non_statutory_allowance?: number
  ot_amount?: number
  deduction_amount?: number
  skbbk_amount?: number
  withholding_tax?: number
  payout_split_version?: number | null
  basic_pay_net?: number | null
  commission_balance?: number | null
}

/** Mirrors the payroll trigger's six-decimal pro-rata ratio. */
export function calculateRevenuePayrollSplit(row: RevenuePayrollRow): RevenuePayrollSplit {
  const ratio = row.prorata_days_in_month > 0
    ? Math.round(row.prorata_days_worked / row.prorata_days_in_month * 1_000_000) / 1_000_000
    : 0
  const basicGross = row.basic_salary * ratio
  if (row.payout_split_version !== 2) {
    const basic = cents(basicGross)
    const balance = row.commission_balance == null
      ? cents(row.commission_amount) - basic - cents(row.epf_er) - cents(row.epf_ee)
      : cents(row.commission_balance)
    return splitResult(basic, basic, balance)
  }
  // Saved components are the authoritative payment snapshot.
  if (row.basic_pay_net != null && row.commission_balance != null) {
    return splitResult(cents(basicGross), cents(row.basic_pay_net), cents(row.commission_balance))
  }
  return computeRevenuePayrollSplit({
    grossCommission: row.commission_amount,
    basicPay: basicGross,
    epfEr: row.epf_er,
    epfEe: row.epf_ee,
    socsoEr: row.socso_er,
    socsoEe: row.socso_ee,
    eisEr: row.eis_er,
    eisEe: row.eis_ee,
    pcb: row.pcb,
    withholdingTax: row.withholding_tax,
    otherEarnings: round4((row.statutory_allowance ?? 0) * ratio)
      + round4((row.ot_amount ?? 0) * ratio) + (row.non_statutory_allowance ?? 0),
    otherDeductions: (row.deduction_amount ?? 0) + (row.skbbk_amount ?? 0),
  })
}

function splitResult(basicGross: number, basicNet: number, balance: number): RevenuePayrollSplit {
  return {
    basicGross: basicGross / 100,
    basicPay: basicNet / 100,
    commissionBalance: balance / 100,
    totalPayout: (basicNet + balance) / 100,
    totalPayBeforeOtherDeductions: (basicNet + balance) / 100,
    shortfall: Math.max(0, -balance) / 100,
    basicShortfall: Math.max(0, -basicNet) / 100,
  }
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Payroll amounts must be finite numbers')
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * 100)
  return value < 0 ? -rounded : rounded
}
