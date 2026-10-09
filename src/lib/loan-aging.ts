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

export interface InstallmentArgs {
  principal: number
  monthlyRate: number
  tenureMonths: number
  /** First installment month, normally disbursement/effective month + 1. */
  firstDueYM: string
  asOfYM: string
  /** Total repaid to date (all payment types pooled). */
  totalPaid: number
}

/** An installment due by asOfYM with something still unpaid on it. */
export interface UnpaidInstallment {
  ym: string
  unpaid: number
}

/** The installments due up to asOfYM that are not fully paid, the payments
 *  allocated FIFO — the rows both agings bucket (2026-10-09: split out of
 *  buildInstallmentAging so the days aging reads the very same ones). */
export function unpaidInstallments(args: InstallmentArgs): UnpaidInstallment[] {
  const { principal, monthlyRate, tenureMonths, firstDueYM, asOfYM, totalPaid } = args
  const out: UnpaidInstallment[] = []
  if (tenureMonths <= 0 || principal <= 0) return out

  const installment = r2(principal / tenureMonths + principal * monthlyRate)
  let paidLeft = totalPaid
  for (let k = 0; k < tenureMonths; k++) {
    const dueYM = addMonths(firstDueYM, k)
    if (monthsBetween(dueYM, asOfYM) < 0) break // future installments — not due yet, not aged
    const applied = Math.min(paidLeft, installment)
    paidLeft = r2(paidLeft - applied)
    const unpaid = r2(installment - applied)
    if (unpaid > 0) out.push({ ym: dueYM, unpaid })
  }
  return out
}

/** Unpaid installments bucketed by how many months past due they are as of asOfYM. */
export function agingByMonths(unpaid: UnpaidInstallment[], asOfYM: string): AgingBuckets {
  const out = { ...EMPTY_BUCKETS }
  for (const u of unpaid) {
    const age = monthsBetween(u.ym, asOfYM)
    if (age <= 0) out.current = r2(out.current + u.unpaid)
    else if (age === 1) out.m1 = r2(out.m1 + u.unpaid)
    else if (age === 2) out.m2 = r2(out.m2 + u.unpaid)
    else out.m3 = r2(out.m3 + u.unpaid)
  }
  out.total = r2(out.current + out.m1 + out.m2 + out.m3)
  return out
}

export function buildInstallmentAging(args: InstallmentArgs): AgingBuckets {
  return agingByMonths(unpaidInstallments(args), args.asOfYM)
}

// ─── By days late (2026-10-09, the Finance revamp handoff) ──────────────────
// The same unpaid installments, each aged from its own due day: the deal's
// day of the month (the disbursement / effective date's), or the month's last
// day when the month is shorter. Not due yet · 1–30 · 31–90 · over 90 days.

export interface DayAgingBuckets {
  notDue: number
  d30: number
  d90: number
  d90plus: number
  total: number
}

export const EMPTY_DAY_BUCKETS: DayAgingBuckets = { notDue: 0, d30: 0, d90: 0, d90plus: 0, total: 0 }

/** YYYY-MM-DD of an installment month's due day. */
export function dueDateIn(ym: string, dueDay: number): string {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${ym}-${String(Math.min(Math.max(1, dueDay), last)).padStart(2, '0')}`
}

export function agingByDays(unpaid: UnpaidInstallment[], dueDay: number, today: string): DayAgingBuckets {
  const out = { ...EMPTY_DAY_BUCKETS }
  const t = Date.parse(`${today}T00:00:00Z`)
  for (const u of unpaid) {
    const late = Math.round((t - Date.parse(`${dueDateIn(u.ym, dueDay)}T00:00:00Z`)) / 86_400_000)
    if (late <= 0) out.notDue = r2(out.notDue + u.unpaid)
    else if (late <= 30) out.d30 = r2(out.d30 + u.unpaid)
    else if (late <= 90) out.d90 = r2(out.d90 + u.unpaid)
    else out.d90plus = r2(out.d90plus + u.unpaid)
  }
  out.total = r2(out.notDue + out.d30 + out.d90 + out.d90plus)
  return out
}

export function sumDayBuckets(rows: DayAgingBuckets[]): DayAgingBuckets {
  const out = { ...EMPTY_DAY_BUCKETS }
  for (const b of rows) {
    out.notDue = r2(out.notDue + b.notDue)
    out.d30 = r2(out.d30 + b.d30)
    out.d90 = r2(out.d90 + b.d90)
    out.d90plus = r2(out.d90plus + b.d90plus)
    out.total = r2(out.total + b.total)
  }
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
