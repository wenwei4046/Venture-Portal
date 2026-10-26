// The Company Statement on screen (2026-10-26, six rounds of samples with the user —
// mockups/company-statement-mockup.html): how a position reads in its counterparty's table, each side's totals, and
// the counterparties' order. The figures are lib/counterparty-statement's; this only says them.
//
//   a position   Date · Terms · Original · Total interest ‖ Principal due · Interest due · Total due · Left · Payoff
//                (the user: Original after the terms, "倒反回来"; Payoff as the installments left and the month —
//                "Payoff 用 A 分两栏"; newest first — "顺序用 A 日期新到旧")
//   no schedule  (no fixed term, compounding) — Left "—", Payoff "No fixed date"; a no-fixed-term deal's monthly
//                interest sits in Interest due as "2,400.00/mo", not in the totals (as before)

import { addMonthsYM, type CounterpartyRow, type PositionRow } from '@/lib/counterparty-statement'

const r2 = (n: number) => Math.round(n * 100) / 100
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM' → "Oct 2026". */
export const monthText = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
/** 'YYYY-MM-DD' → "08 Jul 2026". */
export const dayText = (date: string) => `${date.slice(8, 10)} ${MON[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
/** 0.04 → "4%/mo", 0.005556 → "0.556%/mo". */
export const rateText = (rate: number) => `${Number((rate * 100).toFixed(3))}%/mo`

/** The deal's terms: its rate and term; a fixed-term deal whose agreed first month is not the one after its date says so. */
export function termsText(item: PositionRow): string {
  const term = item.kind === 'flat' ? `${item.tenureMonths} mo` : item.kind === 'compound' ? 'compounding' : 'no fixed term'
  const base = `${rateText(item.monthlyRate)} · ${term}`
  if (item.kind === 'flat' && item.startYM && item.startDate && item.startYM !== addMonthsYM(item.startDate.slice(0, 7), 1)) {
    return `${base} · from ${monthText(item.startYM)}`
  }
  return base
}

/** The installments left of the term — "1 of 6"; none for a deal with no schedule. */
export const leftText = (item: PositionRow): string | null =>
  item.kind === 'flat' ? `${item.remainingPeriods ?? 0} of ${item.tenureMonths}` : null

/** The month a fixed-term deal is paid off by — "Oct 2026"; null = no fixed date. */
export const payoffMonth = (item: PositionRow): string | null =>
  item.kind === 'flat' && item.finishYM ? monthText(item.finishYM) : null

/** The whole deal's interest — fixed-term deals only (a changed deal's plan, segment by segment). */
export const totalInterestOf = (item: PositionRow): number | null =>
  item.kind === 'flat' && item.tenureMonths ? (item.planInterest ?? r2(item.tenureMonths * item.monthlyInterest)) : null

export const totalDueOf = (item: PositionRow) => r2(item.principalOutstanding + item.interestOutstanding)

/** A no-fixed-term deal's interest a month, shown where its interest due would be; not in any total. */
export const monthlyReference = (item: PositionRow): number | null =>
  item.kind === 'no_term' && item.monthlyInterest > 0.005 ? item.monthlyInterest : null

/** A side's positions, newest first (by the deal's date; undated last, the larger first). */
export function orderPositions(items: PositionRow[]): PositionRow[] {
  return [...items].sort((a, b) => {
    if (a.startDate !== b.startDate) {
      if (!a.startDate) return 1
      if (!b.startDate) return -1
      return b.startDate.localeCompare(a.startDate)
    }
    return b.principalOutstanding - a.principalOutstanding
  })
}

export interface SideTotals {
  count: number
  original: number
  totalInterest: number
  principal: number
  interest: number
  total: number
}

/** One side's totals, as its row in the counterparty's table shows them. */
export function sideTotals(items: PositionRow[]): SideTotals {
  const principal = r2(items.reduce((s, i) => s + i.principalOutstanding, 0))
  const interest = r2(items.reduce((s, i) => s + i.interestOutstanding, 0))
  return {
    count: items.length,
    original: r2(items.reduce((s, i) => s + i.principal, 0)),
    totalInterest: r2(items.reduce((s, i) => s + (totalInterestOf(i) ?? 0), 0)),
    principal,
    interest,
    total: r2(principal + interest),
  }
}

export const toCollect = (g: CounterpartyRow) => r2(g.collectPrincipal + g.collectInterest)
export const toRepay = (g: CounterpartyRow) => r2(g.repayPrincipal + g.repayInterest)

export type CounterpartySort = 'size' | 'net' | 'collect' | 'repay' | 'name'
export type CounterpartyShow = 'all' | 'collect' | 'repay'

const SORTS: Record<CounterpartySort, (a: CounterpartyRow, b: CounterpartyRow) => number> = {
  // Largest: both sides together, as the statement always listed them.
  size: (a, b) => toCollect(b) + toRepay(b) - (toCollect(a) + toRepay(a)),
  net: (a, b) => b.net - a.net,
  collect: (a, b) => toCollect(b) - toCollect(a),
  repay: (a, b) => toRepay(b) - toRepay(a),
  name: (a, b) => a.counterparty.localeCompare(b.counterparty),
}

/** The counterparties on screen: those the search names, with something on the side asked for, in the order asked for. */
export function shownCounterparties(rows: CounterpartyRow[], opts: { needle?: string; show?: CounterpartyShow; sort?: CounterpartySort }): CounterpartyRow[] {
  const needle = (opts.needle ?? '').trim().toLowerCase()
  const show = opts.show ?? 'all'
  return rows
    .filter((g) => !needle || g.counterparty.toLowerCase().includes(needle))
    .filter((g) => (show === 'collect' ? toCollect(g) > 0.005 : show === 'repay' ? toRepay(g) > 0.005 : true))
    .sort(SORTS[opts.sort ?? 'size'])
}
