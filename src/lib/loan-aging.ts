// Loan / fund-source repayment AGING (user request 2026-07-24).
//
// Flat-amortisation convention (same as the Repayment Schedule page):
// installment k (k = 1..tenure) falls due in the k-th month AFTER the
// disbursement/effective month, amount = principal/tenure + principal×rate.
// Payments are pooled (repayments are not tagged to an installment), so they
// are allocated FIFO — oldest due installment first. Whatever remains unpaid
// is bucketed by how many months past due it is, as of `asOfYM`:
//   current = due this month · m1 = 1 month late · m2 = 2 · m3 = 3+.
// Compounding / no-fixed-term positions have no due dates — they are listed
// in a separate (not aged) section by the caller.

const r2 = (n: number) => Math.round(n * 100) / 100

export interface AgingBuckets {
  current: number
  m1: number
  m2: number
  m3: number
  total: number
}

export const EMPTY_BUCKETS: AgingBuckets = { current: 0, m1: 0, m2: 0, m3: 0, total: 0 }

/** Whole months from fromYM to toYM ('YYYY-MM'); negative if toYM earlier. */
export function monthsBetween(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split('-').map(Number)
  const [ty, tm] = toYM.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function buildInstallmentAging(args: {
  principal: number
  monthlyRate: number
  tenureMonths: number
  /** First installment month, normally disbursement/effective month + 1. */
  firstDueYM: string
  asOfYM: string
  /** Total repaid to date (all payment types pooled). */
  totalPaid: number
}): AgingBuckets {
  const { principal, monthlyRate, tenureMonths, firstDueYM, asOfYM, totalPaid } = args
  const out = { ...EMPTY_BUCKETS }
  if (tenureMonths <= 0 || principal <= 0) return out

  const installment = r2(principal / tenureMonths + principal * monthlyRate)
  let paidLeft = totalPaid
  for (let k = 0; k < tenureMonths; k++) {
    const dueYM = addMonths(firstDueYM, k)
    const age = monthsBetween(dueYM, asOfYM)
    if (age < 0) break // future installments — not due yet, not aged
    const applied = Math.min(paidLeft, installment)
    paidLeft = r2(paidLeft - applied)
    const unpaid = r2(installment - applied)
    if (unpaid <= 0) continue
    if (age === 0) out.current = r2(out.current + unpaid)
    else if (age === 1) out.m1 = r2(out.m1 + unpaid)
    else if (age === 2) out.m2 = r2(out.m2 + unpaid)
    else out.m3 = r2(out.m3 + unpaid)
  }
  out.total = r2(out.current + out.m1 + out.m2 + out.m3)
  return out
}

export function sumBuckets(rows: AgingBuckets[]): AgingBuckets {
  const out = { ...EMPTY_BUCKETS }
  for (const b of rows) {
    out.current = r2(out.current + b.current)
    out.m1 = r2(out.m1 + b.m1)
    out.m2 = r2(out.m2 + b.m2)
    out.m3 = r2(out.m3 + b.m3)
    out.total = r2(out.total + b.total)
  }
  return out
}
