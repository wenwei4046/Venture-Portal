// Counterparty statement (user 2026-08-06: "我要有一个新的report 或statement
// 关于这个公司我还要还多少和我还要收多少 … 类似银行会给的一个statement").
// One row per counterparty: what HOUZS Venture still COLLECTS from them (loans
// lent out) vs still OWES them (fund sources taken in), principal and interest
// in separate columns, plus a bank-statement style per-position breakdown with
// the projected payoff month (几时还完).
//
// Interest conventions — same maths as /repayment-schedule and Loan Monitor:
//   flat      remaining interest to finish = remaining periods × (原额 × 月息)
//   compound  利滚利 accrued-unpaid to date = compounded balance − outstanding
//   no-term   no projectable schedule — counts 0 in the totals; the monthly
//             interest shows per row as a reference figure
//
// Payoff month (几时还完), flat only:
//   on/ahead of the agreed schedule → contractual finish (start + tenure − 1)
//   behind schedule → current month + remaining − 1 (one catch-up a month)

import { remainingPeriods, resolveFirstDueYM } from '@/lib/loan-monitor'
import { compoundInterestState } from '@/lib/treasury-schedule'

const r2 = (n: number) => Math.round(n * 100) / 100

export function addMonthsYM(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

function diffMonths(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split('-').map(Number)
  const [ty, tm] = toYM.split('-').map(Number)
  return ty * 12 + tm - (fy * 12 + fm)
}

export type StatementSide = 'collect' | 'repay'
export type PositionKind = 'flat' | 'compound' | 'no_term'

export interface PositionInput {
  id: string
  side: StatementSide
  counterparty: string
  principal: number
  /** Monthly rate as decimal, e.g. 0.02 = 2%/month. */
  monthlyRate: number
  /** Loan tenure / fund-source lock-in, months. Null or 0 → no fixed term. */
  tenureMonths: number | null
  compounding: boolean
  /** Repayment terms undecided (未定/无还款方式) — loans only. */
  unscheduled: boolean
  /** Disbursement (loans) / effective date (fund sources), YYYY-MM-DD. */
  startDate: string | null
  /** Agreed 还款起始月 override, YYYY-MM. */
  startMonth: string | null
  /** Principal repaid so far (from the outstanding views). */
  principalPaid: number
  /** Principal still owed (from the outstanding views). */
  outstanding: number
  /** Total repaid (all types) per calendar month — compounding roll-forward. */
  paymentsByMonth: Record<string, number>
  /** 最低还息单 (2026-09-04) — the deal requires each month's interest paid. */
  minPayInterest?: boolean
  source?: string | null
}

export interface PositionRow {
  id: string
  side: StatementSide
  counterparty: string
  kind: PositionKind
  principal: number
  monthlyRate: number
  tenureMonths: number | null
  principalPaid: number
  principalOutstanding: number
  /** flat: remaining-to-finish · compound: accrued-unpaid · no_term: 0. */
  interestOutstanding: number
  /** 原额 × 月息 — the reference figure for no-term rows. */
  monthlyInterest: number
  remainingPeriods: number | null
  /** Projected payoff 'YYYY-MM'; null = 未定. */
  finishYM: string | null
  /** First installment month (agreed start, else start date + 1). */
  startYM: string | null
  /** 最低还息单 — statement notes "每月最低应还利息 = monthlyInterest". */
  minPayInterest: boolean
  source?: string | null
}

export function buildPositionRow(p: PositionInput, currentYM: string): PositionRow | null {
  if (p.outstanding <= 0.005) return null
  const monthlyInterest = r2(p.principal * p.monthlyRate)
  const startYM = resolveFirstDueYM(p.startMonth, p.startDate)
  const base = {
    id: p.id,
    side: p.side,
    counterparty: p.counterparty,
    principal: p.principal,
    monthlyRate: p.monthlyRate,
    tenureMonths: p.tenureMonths,
    principalPaid: r2(p.principalPaid),
    principalOutstanding: r2(p.outstanding),
    monthlyInterest,
    startYM,
    minPayInterest: p.minPayInterest === true,
    source: p.source ?? null,
  }

  if (p.compounding) {
    // Accrual starts the month the money moved — same as /repayment-schedule.
    const accrualStart = (p.startDate ?? '').slice(0, 7) || currentYM
    const cs = compoundInterestState({
      principal: p.principal,
      monthlyRate: p.monthlyRate,
      startYM: accrualStart,
      currentYM,
      paymentsByMonth: p.paymentsByMonth,
    })
    return {
      ...base,
      kind: 'compound',
      interestOutstanding: r2(Math.max(0, cs.balance - p.outstanding)),
      remainingPeriods: null,
      finishYM: null,
    }
  }

  const tenure = p.tenureMonths ?? 0
  if (p.unscheduled || tenure <= 0) {
    return { ...base, kind: 'no_term', interestOutstanding: 0, remainingPeriods: null, finishYM: null }
  }

  const remaining = remainingPeriods(p.principal, tenure, p.principalPaid)
  let finishYM: string | null = null
  if (remaining <= 0) {
    // Rounding tail: principal counted as fully installment-paid but a few sen
    // remain on the view — settles with the next payment.
    finishYM = currentYM
  } else if (startYM) {
    const contractual = addMonthsYM(startYM, tenure - 1)
    const periodsDone = tenure - remaining
    const scheduledSoFar = startYM <= currentYM ? diffMonths(startYM, currentYM) + 1 : 0
    finishYM =
      periodsDone >= scheduledSoFar - 1 // this month's installment may still be in flight
        ? contractual
        : addMonthsYM(currentYM, remaining - 1)
    if (finishYM < currentYM) finishYM = addMonthsYM(currentYM, remaining - 1)
  }
  return {
    ...base,
    kind: 'flat',
    interestOutstanding: r2(Math.max(0, remaining) * monthlyInterest),
    remainingPeriods: Math.max(0, remaining),
    finishYM,
  }
}

export interface CounterpartyRow {
  counterparty: string
  collectPrincipal: number
  collectInterest: number
  repayPrincipal: number
  repayInterest: number
  /** (要收本金+利息) − (要还本金+利息); positive = net collect. */
  net: number
  items: PositionRow[]
}

export interface StatementTotals {
  collectPrincipal: number
  collectInterest: number
  repayPrincipal: number
  repayInterest: number
  net: number
}

export function groupStatement(rows: PositionRow[]): {
  rows: CounterpartyRow[]
  totals: StatementTotals
} {
  const byCp = new Map<string, CounterpartyRow>()
  for (const r of rows) {
    const g = byCp.get(r.counterparty) ?? {
      counterparty: r.counterparty,
      collectPrincipal: 0,
      collectInterest: 0,
      repayPrincipal: 0,
      repayInterest: 0,
      net: 0,
      items: [],
    }
    if (r.side === 'collect') {
      g.collectPrincipal = r2(g.collectPrincipal + r.principalOutstanding)
      g.collectInterest = r2(g.collectInterest + r.interestOutstanding)
    } else {
      g.repayPrincipal = r2(g.repayPrincipal + r.principalOutstanding)
      g.repayInterest = r2(g.repayInterest + r.interestOutstanding)
    }
    g.items.push(r)
    byCp.set(r.counterparty, g)
  }
  const out = [...byCp.values()].map(g => ({
    ...g,
    net: r2(g.collectPrincipal + g.collectInterest - g.repayPrincipal - g.repayInterest),
    items: g.items.sort(
      (a, b) => a.side.localeCompare(b.side) || b.principalOutstanding - a.principalOutstanding,
    ),
  }))
  out.sort(
    (a, b) =>
      b.collectPrincipal + b.collectInterest + b.repayPrincipal + b.repayInterest -
      (a.collectPrincipal + a.collectInterest + a.repayPrincipal + a.repayInterest),
  )
  const totals = out.reduce<StatementTotals>(
    (acc, g) => ({
      collectPrincipal: r2(acc.collectPrincipal + g.collectPrincipal),
      collectInterest: r2(acc.collectInterest + g.collectInterest),
      repayPrincipal: r2(acc.repayPrincipal + g.repayPrincipal),
      repayInterest: r2(acc.repayInterest + g.repayInterest),
      net: r2(acc.net + g.net),
    }),
    { collectPrincipal: 0, collectInterest: 0, repayPrincipal: 0, repayInterest: 0, net: 0 },
  )
  return { rows: out, totals }
}
