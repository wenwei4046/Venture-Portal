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

// ─── Compounding interest (利滚利) ──────────────────────────────────────────
// Month-by-month balance roll-forward: each month interest = balance × rate;
// balance += interest − (that month's repayments). An unpaid month therefore
// capitalises its interest into the balance (利滚利); a paid month shrinks it.
//判定按自然月 — 月内迟还(20号到期22号还)仍算当月已还。

function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export interface CompoundInput {
  principal: number
  /** Monthly rate as decimal, e.g. 0.02 = 2%/month. */
  monthlyRate: number
  startYM: string // 'YYYY-MM' — first month interest accrues
  currentYM: string // 'YYYY-MM' — the month we want the figure for
  /** Total repaid (principal+interest) per calendar month, keyed 'YYYY-MM'. */
  paymentsByMonth: Record<string, number>
}

export interface CompoundState {
  /** Outstanding incl. capitalised interest, at the START of currentYM. */
  balance: number
  /** Interest due for currentYM on the compounded balance. */
  thisMonthInterest: number
  /** Net change vs original principal (capitalised interest minus principal repaid). */
  netChange: number
}

export function compoundInterestState(i: CompoundInput): CompoundState {
  let balance = i.principal
  let ym = i.startYM
  let guard = 0
  while (ym < i.currentYM && guard < 1200) {
    const interest = r2(balance * i.monthlyRate)
    const paid = i.paymentsByMonth[ym] ?? 0
    balance = r2(balance + interest - paid)
    if (balance < 0) balance = 0
    ym = nextYM(ym)
    guard++
  }
  return {
    balance,
    thisMonthInterest: r2(balance * i.monthlyRate),
    netChange: r2(balance - i.principal),
  }
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
