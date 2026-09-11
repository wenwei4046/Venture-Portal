/** The commissioned basic is funded from commission, not an extra earning. */
export interface RevenuePayrollSplitInput {
  grossCommission: number
  /** The actual basic payout for the period, after pro-rata. */
  basicPay: number
  epfEr: number
  epfEe: number
}

export interface RevenuePayrollSplit {
  basicPay: number
  commissionBalance: number
  /** Basic + commission balance, before SOCSO/EIS, tax and other deductions. */
  totalPayBeforeOtherDeductions: number
  /** Kept visible for correction; a negative balance is never silently floored. */
  shortfall: number
}

export function computeRevenuePayrollSplit(input: RevenuePayrollSplitInput): RevenuePayrollSplit {
  const grossCommission = cents(input.grossCommission)
  const basicPay = cents(input.basicPay)
  const epfEr = cents(input.epfEr)
  const epfEe = cents(input.epfEe)
  const balance = grossCommission - basicPay - epfEr - epfEe

  return {
    basicPay: basicPay / 100,
    commissionBalance: balance / 100,
    totalPayBeforeOtherDeductions: (basicPay + balance) / 100,
    shortfall: Math.max(0, -balance) / 100,
  }
}

export interface RevenuePayrollRow {
  commission_amount: number
  basic_salary: number
  prorata_days_worked: number
  prorata_days_in_month: number
  epf_er: number
  epf_ee: number
}

/** Mirrors the payroll trigger's six-decimal pro-rata ratio. */
export function calculateRevenuePayrollSplit(row: RevenuePayrollRow): RevenuePayrollSplit {
  const ratio = row.prorata_days_in_month > 0
    ? Math.round(row.prorata_days_worked / row.prorata_days_in_month * 1_000_000) / 1_000_000
    : 0
  return computeRevenuePayrollSplit({
    grossCommission: row.commission_amount,
    basicPay: row.basic_salary * ratio,
    epfEr: row.epf_er,
    epfEe: row.epf_ee,
  })
}

function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Payroll amounts must be finite numbers')
  return Math.round((value + Number.EPSILON) * 100)
}
