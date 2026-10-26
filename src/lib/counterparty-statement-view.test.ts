import { describe, expect, it } from 'vitest'
import { buildPositionRow, groupStatement, type PositionInput, type PositionRow } from './counterparty-statement'
import {
  dayText,
  leftText,
  monthlyReference,
  orderPositions,
  payoffMonth,
  rateText,
  shownCounterparties,
  sideTotals,
  termsText,
  totalDueOf,
  totalInterestOf,
} from './counterparty-statement-view'

// 2026-10-26 — the Company Statement as the six rounds of samples left it: a position reads Date · Terms · Original ·
// Total interest ‖ Principal due · Interest due · Total due · Left · Payoff, newest first.

const base: PositionInput = {
  id: 'x',
  side: 'collect',
  counterparty: 'The Cont',
  principal: 60000,
  monthlyRate: 0.04,
  tenureMonths: 6,
  compounding: false,
  unscheduled: false,
  startDate: '2025-09-02',
  startMonth: null,
  principalPaid: 50000,
  outstanding: 10000,
  paymentsByMonth: {},
}
const row = (over: Partial<PositionInput> = {}) => buildPositionRow({ ...base, ...over }, '2026-10') as PositionRow

describe('how a position reads', () => {
  it('says the rate and the term, an agreed first month only when it is not the one after the date', () => {
    expect(rateText(0.04)).toBe('4%/mo')
    expect(rateText(0.005556)).toBe('0.556%/mo')
    expect(termsText(row())).toBe('4%/mo · 6 mo')
    // HC's Conts 60k: lent 2 Sep 2025, its installments from May 2026.
    expect(termsText(row({ startMonth: '2026-05' }))).toBe('4%/mo · 6 mo · from May 2026')
    expect(termsText(row({ compounding: true }))).toBe('4%/mo · compounding')
    expect(termsText(row({ tenureMonths: null, startMonth: '2026-05' }))).toBe('4%/mo · no fixed term')
  })

  it('dates the deal by the day it moved', () => {
    expect(dayText('2025-09-02')).toBe('02 Sep 2025')
    expect(row().startDate).toBe('2025-09-02')
  })

  it('gives a fixed-term deal its installments left and payoff month; a deal with no schedule neither', () => {
    const flat = row()
    expect(leftText(flat)).toBe('1 of 6')
    expect(payoffMonth(flat)).toBe('Oct 2026')
    expect(totalInterestOf(flat)).toBe(14400) // 6 × 2,400
    expect(totalDueOf(flat)).toBe(12400) // 10,000 + 1 × 2,400
    const open = row({ tenureMonths: null })
    expect(leftText(open)).toBeNull()
    expect(payoffMonth(open)).toBeNull()
    expect(totalInterestOf(open)).toBeNull()
  })

  it('shows a no-fixed-term deal its interest a month, never in a total', () => {
    const open = row({ tenureMonths: null, outstanding: 60000, principalPaid: 0 })
    expect(open.interestOutstanding).toBe(0)
    expect(monthlyReference(open)).toBe(2400)
    expect(monthlyReference(row({ tenureMonths: null, monthlyRate: 0 }))).toBeNull()
    expect(monthlyReference(row())).toBeNull()
    expect(sideTotals([open]).interest).toBe(0)
  })
})

describe("a side's positions and totals", () => {
  it('lists the newest deal first, an undated one last', () => {
    const items = [row({ id: 'a', startDate: '2025-09-02' }), row({ id: 'b', startDate: null }), row({ id: 'c', startDate: '2026-07-08' })]
    expect(orderPositions(items).map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('sums the original, the whole interest and what is still due', () => {
    const t = sideTotals([row(), row({ id: 'y', principal: 58000, principalPaid: 48333.35, outstanding: 9666.65 })])
    expect(t).toEqual({ count: 2, original: 118000, totalInterest: 28320, principal: 19666.65, interest: 4720, total: 24386.65 })
  })
})

describe('the counterparties on screen', () => {
  const cont = row()
  const hc = row({ id: 'h', side: 'repay', counterparty: 'HOUZS Century', principal: 220000, tenureMonths: null, outstanding: 220000, principalPaid: 0, monthlyRate: 0.02 })
  const dc = row({ id: 'd', counterparty: 'Dream Crafter', principal: 2995.26, monthlyRate: 0, tenureMonths: 1, outstanding: 2995.26, principalPaid: 0, startDate: '2026-05-20' })
  const { rows } = groupStatement([cont, hc, dc])

  it('sorts by size as the statement always did, or by net, a side or name', () => {
    expect(shownCounterparties(rows, {}).map((g) => g.counterparty)).toEqual(['HOUZS Century', 'The Cont', 'Dream Crafter'])
    expect(shownCounterparties(rows, { sort: 'net' }).map((g) => g.counterparty)).toEqual(['The Cont', 'Dream Crafter', 'HOUZS Century'])
    expect(shownCounterparties(rows, { sort: 'name' }).map((g) => g.counterparty)).toEqual(['Dream Crafter', 'HOUZS Century', 'The Cont'])
  })

  it('shows those with something on the side asked for, and those the search names', () => {
    expect(shownCounterparties(rows, { show: 'repay' }).map((g) => g.counterparty)).toEqual(['HOUZS Century'])
    expect(shownCounterparties(rows, { show: 'collect', sort: 'collect' }).map((g) => g.counterparty)).toEqual(['The Cont', 'Dream Crafter'])
    expect(shownCounterparties(rows, { needle: ' dream ' }).map((g) => g.counterparty)).toEqual(['Dream Crafter'])
  })
})
