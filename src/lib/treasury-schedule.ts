// Pure helpers for the monthly repayment schedule (this-month 应收 / 应付).
// Flat amortisation — matches the fund-source convention in
// fund-in/actions.ts#listPayableFundSources and the loan repayment data:
//   monthly principal = original / tenure   (equal principal each month)
//   monthly interest  = original × rate      (flat on the ORIGINAL, monthly rate)
// Verified against live loans, e.g. CAR 100,000 @ 0.02 × 12 → 8,333.33 + 2,000.00.

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface InstallmentInput {
  principal: number
  /** Monthly rate as a decimal, e.g. 0.02 = 2%/month. */
  effectiveRate: number
  tenureMonths: number
  /** Total principal repaid so far (drives periods-paid / remaining). */
  principalPaid: number
}

export interface Installment {
  principalDue: number
  interestDue: number
  totalDue: number
  periodsPaid: number
  remainingPeriods: number
}

export function loanMonthlyInstallment(i: InstallmentInput): Installment {
  const tenure = Math.max(1, i.tenureMonths)
  const principalDue = r2(i.principal / tenure)
  const interestDue = r2(i.principal * i.effectiveRate)
  const periodsPaid = principalDue > 0 ? Math.round(i.principalPaid / principalDue) : 0
  return {
    principalDue,
    interestDue,
    totalDue: r2(principalDue + interestDue),
    periodsPaid,
    remainingPeriods: Math.max(0, tenure - periodsPaid),
  }
}

/** A loan has NO confirmed repayment plan when its repayment_terms is empty or
 *  flags the schedule as undecided ("未定") / no method ("无还款方式" /
 *  "原表无还款方式"). Such loans go to the "no fixed term" table, not the
 *  this-month 应收 schedule. */
export function isLoanUnscheduled(repaymentTerms: string | null | undefined): boolean {
  const t = (repaymentTerms ?? '').trim()
  if (!t) return true
  return t.includes('未定') || t.includes('无还款方式')
}

export interface ScheduleTotals {
  principal: number
  interest: number
  total: number
}

/** Sum principal / interest / total across a set of installment rows. */
export function sumSchedule(
  rows: Array<{ principalDue: number; interestDue: number; totalDue: number }>,
): ScheduleTotals {
  return rows.reduce<ScheduleTotals>(
    (acc, r) => ({
      principal: r2(acc.principal + r.principalDue),
      interest: r2(acc.interest + r.interestDue),
      total: r2(acc.total + r.totalDue),
    }),
    { principal: 0, interest: 0, total: 0 },
  )
}
