/**
 * Revenue Director pay (user, 2026-09-27) — the arithmetic both ends share.
 *
 * A director (a title that heads the department) holds no membership and
 * earns no override. Each sub-department pays them, per director (Rules ›
 * Directors):
 *
 *   - a FIXED amount every month — their base commission; the Revenue payroll
 *     carves their basic out of it like anybody's commission;
 *   - an INCENTIVE once the month's Commissionable value — Comm Cal's card —
 *     reaches the threshold ("if the total sales order revenue reaches a
 *     threshold of 2 million, then that triggers an incentive");
 *   - their own bills at the rate of their title's rung on the ladder, and
 *     nothing else ("如果自己有做 sales，就只拿自己的 rate 罢了").
 *
 * The threshold is read on the SAME figure as the card, so the page, the close
 * the server recomputes, and the ledger all agree about whether it was met.
 */

import type { DirectorTerms } from './types'

/**
 * Comm Cal's "Commissionable value" card: the month's live bills (every one
 * not cancelled, matched to a salesperson or not) at their commissionable
 * sales — the lines in groups the scheme pays on.
 */
export function monthCommissionableValue(
  orders: readonly { cancelled: boolean; marginRevenue: number }[],
): number {
  return Math.round(orders.filter(o => !o.cancelled).reduce((a, o) => a + o.marginRevenue, 0) * 100) / 100
}

/** Is the incentive paid this month? Half a sen of rounding never decides it. */
export function directorIncentiveEarned(
  terms: Pick<DirectorTerms, 'salesThreshold' | 'incentiveAmount'>,
  monthValue: number | null | undefined,
): boolean {
  if (terms.incentiveAmount <= 0 || terms.salesThreshold === null || terms.salesThreshold <= 0) return false
  if (monthValue === null || monthValue === undefined) return false
  return monthValue + 0.005 >= terms.salesThreshold
}

/** Whether a director's incentive needs the month's figure at all. */
export function needsMonthValue(directors: readonly Pick<DirectorTerms, 'salesThreshold' | 'incentiveAmount'>[]): boolean {
  return directors.some(d => d.incentiveAmount > 0 && d.salesThreshold !== null && d.salesThreshold > 0)
}

export interface DirectorPayFigures {
  fixedAmount: number
  salesThreshold: number | null
  incentiveAmount: number
}

const toSen = (n: number) => Math.round(n * 100) / 100

/**
 * One row of Rules › Directors as typed — blanks allowed — checked into what
 * `comm_director_pay` stores. Refuses what the table would refuse, in words:
 * a negative amount, a threshold of nothing, an incentive with no threshold.
 */
export function checkDirectorPay(raw: {
  fixedAmount: number | null
  salesThreshold: number | null
  incentiveAmount: number | null
}): DirectorPayFigures {
  const fixedAmount = raw.fixedAmount ?? 0
  const incentiveAmount = raw.incentiveAmount ?? 0
  const salesThreshold = raw.salesThreshold
  for (const [label, value] of [['The fixed amount', fixedAmount], ['The incentive', incentiveAmount]] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cannot be below zero`)
    if (toSen(value) !== value) throw new Error(`${label} is money — to the sen`)
  }
  if (salesThreshold !== null) {
    if (!Number.isFinite(salesThreshold) || salesThreshold <= 0) throw new Error('The threshold is the Commissionable value that pays the incentive — more than zero, or leave it blank')
    if (toSen(salesThreshold) !== salesThreshold) throw new Error('The threshold is money — to the sen')
  }
  if (incentiveAmount > 0 && salesThreshold === null) {
    throw new Error('An incentive needs the Commissionable value it is paid at — fill in the threshold')
  }
  return { fixedAmount, salesThreshold, incentiveAmount }
}
