import { describe, expect, it } from 'vitest'
import { readsNoSales } from './no-sales'

// October 2026's Fair bills as revenue_month_orders gave them (2026-10-30).
describe('readsNoSales', () => {
  it('a gift on a bill of its own: no margin, no margin revenue, a cost', () => {
    // HC-SO-2610-095: AK-CS AIRLOFT COMFY PIL ×2 at RM 0, cost 150 → the team's 214.29.
    expect(readsNoSales({ marginPct: null, marginRevenue: 0, marginCost: 214.29 })).toBe(true)
  })

  it('a bill still waiting for a cost is pending, not "no sales"', () => {
    // HC-SO-2610-009: TRION (A) NO PIPING unpriced.
    expect(readsNoSales({ marginPct: null, marginRevenue: 14000, marginCost: null })).toBe(false)
    expect(readsNoSales({ marginPct: null, marginRevenue: 0, marginCost: null })).toBe(false)
  })

  it('a fee alone costs nothing — no part of the margin', () => {
    // HC-SO-2610-302: one service line at RM 0.
    expect(readsNoSales({ marginPct: null, marginRevenue: 0, marginCost: 0 })).toBe(false)
  })

  it('a bill that sells reads its margin, negative or not', () => {
    // HC-SO-2610-320: −32.2%.
    expect(readsNoSales({ marginPct: -0.32228, marginRevenue: 1680, marginCost: 2221.43 })).toBe(false)
    expect(readsNoSales({ marginPct: 0.4, marginRevenue: 1000, marginCost: 600 })).toBe(false)
  })
})
