// src/lib/fund-source-dates.ts
// Pure date helpers for fund sources. As of 2026-05-13 the field
// fund_sources.repayment_date means "the date the first installment is due",
// NOT the full-repayment date. The full-repayment date is derived from the
// first-installment date plus the repayment period (lock_in_months): there
// are `lock_in_months` monthly installments, the first on repayment_date,
// the last on repayment_date + (lock_in_months - 1) months.

import dayjs from 'dayjs'

export function expectedFullRepaymentDate(
  firstInstallmentDate: string,
  lockInMonths: number,
): string {
  const n = Math.max(1, Math.floor(lockInMonths))
  return dayjs(firstInstallmentDate).add(n - 1, 'month').format('YYYY-MM-DD')
}

export function monthsBetween(fromIso: string, toIso: string): number {
  return dayjs(toIso).diff(dayjs(fromIso), 'month')
}
