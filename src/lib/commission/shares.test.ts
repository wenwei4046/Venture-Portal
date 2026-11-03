import { describe, it, expect } from 'vitest'
import { computeCommissionRun } from './engine'
import { releasedOrders } from './run-payload'
import { ownerPart, splitOrdersByShares } from './shares'
import type { CommissionScheme, EngineInput, Rank, SalesOrder } from './types'

/**
 * The user's own example (2026-09-24): an 8% owner shares a RM 10,000 bill
 * 50/50 with a 5% member who sits in a DIFFERENT team. The owner is paid 8% of
 * 5,000, the member 5% of 5,000, and the member's upline earns override on the
 * member's 5,000.
 */
const RANKS: Rank[] = [
  { rankKey: 'rs_5', titleId: 't5', titleLabel: 'RS', label: 'RS 5%', productRate: 0.05, canRecruit: false, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 10 },
  { rankKey: 'ta_8', titleId: 't8', titleLabel: 'STA', label: 'STA 8%', productRate: 0.08, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 40 },
  { rankKey: 'tl_9', titleId: 't9', titleLabel: 'TL', label: 'TL 9%', productRate: 0.09, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 50 },
]

const SCHEME: CommissionScheme = {
  overrideIncludesKpi: false,
  enableProductRevenue: true,
  enableKpi: false,
  enableOverride: true,
  enableMarginPenalty: false,
  enableMarginIncentive: false,
  itemGroups: [{ group: 'MATTRESS', commissionable: true }, { group: 'TRANS', commissionable: false }],
  depositThresholdPct: 0.3,
  defaultRateMode: 'fixed',
}

function bill(over: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'o1',
    orderNo: 'HC-SO-1',
    staffId: 'owner',
    orderDate: '2026-08-15',
    periodMonth: '2026-08-01',
    eventDate: '2026-08-15',
    orderTotal: 10_100,
    paidAmount: 5_050,
    lines: [
      { id: 'l1', itemGroup: 'MATTRESS', productCode: 'AK-1', qty: 1, lineAmount: 10_000, brandCode: 'AKEMI', costAmount: 6_000 },
      { id: 'l2', itemGroup: 'TRANS', productCode: 'TRANS', qty: 1, lineAmount: 100 },
    ],
    ...over,
  }
}

function input(orders: SalesOrder[]): EngineInput {
  return {
    periodMonth: '2026-08-01',
    scheme: SCHEME,
    ranks: RANKS,
    orders,
    kpiItems: [],
    kpiThresholds: [],
    marginBands: [],
    hierarchy: [
      { staffId: 'owner', uplineStaffId: null, baseRankKey: 'ta_8', rateMode: 'fixed' },
      { staffId: 'member', uplineStaffId: 'leader', baseRankKey: 'rs_5', rateMode: 'fixed' },
      { staffId: 'leader', uplineStaffId: null, baseRankKey: 'tl_9', rateMode: 'fixed' },
    ],
    priorMonths: [],
  }
}

describe('splitOrdersByShares', () => {
  it('leaves a bill nobody shares exactly as it was', () => {
    const o = bill()
    expect(splitOrdersByShares([o], [])).toEqual([o])
    expect(splitOrdersByShares([o], [])[0]).toBe(o)
  })

  it('gives each holder a scaled copy and the owner the rest', () => {
    const parts = splitOrdersByShares([bill()], [{ orderId: 'o1', staffId: 'member', pct: 0.5 }])
    expect(parts.map(p => [p.staffId, p.orderTotal, p.paidAmount, p.lines[0].lineAmount, p.lines[0].costAmount])).toEqual([
      ['owner', 5_050, 2_525, 5_000, 3_000],
      ['member', 5_050, 2_525, 5_000, 3_000],
    ])
  })

  it('adds back to the bill to the sen when the split does not divide evenly', () => {
    const parts = splitOrdersByShares(
      [bill({ orderTotal: 1_000.01, paidAmount: 500, lines: [{ id: 'l', itemGroup: 'MATTRESS', productCode: 'x', qty: 1, lineAmount: 1_000.01 }] })],
      [{ orderId: 'o1', staffId: 'a', pct: 1 / 3 }, { orderId: 'o1', staffId: 'b', pct: 1 / 3 }],
    )
    expect(parts.reduce((s, p) => s + p.lines[0].lineAmount, 0)).toBeCloseTo(1_000.01, 2)
    expect(parts.reduce((s, p) => s + p.orderTotal, 0)).toBeCloseTo(1_000.01, 2)
    expect(parts[0].staffId).toBe('owner')
  })

  it('tells every part whose bill it is and who holds the rest (2026-09-30)', () => {
    const parts = splitOrdersByShares([bill()], [{ orderId: 'o1', staffId: 'member', pct: 0.5 }])
    for (const part of parts) {
      expect(part.share).toEqual({
        ownerStaffId: 'owner',
        parts: [{ staffId: 'owner', pct: 0.5 }, { staffId: 'member', pct: 0.5 }],
        wholeTotal: 10_100,
      })
    }
    // A bill nobody shares carries nothing of the kind.
    expect(splitOrdersByShares([bill()], [])[0].share).toBeUndefined()
  })

  it('ignores a share naming the owner and shares that would leave the owner nothing', () => {
    expect(splitOrdersByShares([bill()], [{ orderId: 'o1', staffId: 'owner', pct: 0.5 }])).toHaveLength(1)
    expect(
      splitOrdersByShares([bill()], [{ orderId: 'o1', staffId: 'a', pct: 0.6 }, { orderId: 'o1', staffId: 'b', pct: 0.4 }]),
    ).toHaveLength(1)
  })
})

describe('a shared bill through the engine', () => {
  it('pays each part at its holder’s own rate, and the member’s upline overrides the member’s part', () => {
    const orders = splitOrdersByShares([bill()], [{ orderId: 'o1', staffId: 'member', pct: 0.5 }])
    const result = computeCommissionRun(input(orders))
    const by = new Map(result.statements.map(s => [s.staffId, s]))

    expect(by.get('owner')!.productRevenue).toBe(5_000)
    expect(by.get('owner')!.productCommission).toBe(400) // 8% × 5,000
    expect(by.get('member')!.productRevenue).toBe(5_000)
    expect(by.get('member')!.productCommission).toBe(250) // 5% × 5,000
    expect(by.get('leader')!.overrideCommission).toBe(200) // (9% − 5%) × 5,000
  })

  it('holds every part when the whole bill is short of its deposit', () => {
    const orders = splitOrdersByShares([bill({ paidAmount: 1_000 })], [{ orderId: 'o1', staffId: 'member', pct: 0.5 }])
    const by = new Map(computeCommissionRun(input(orders)).statements.map(s => [s.staffId, s]))
    expect(by.get('owner')!.productRevenue).toBe(0)
    expect(by.get('member')!.productRevenue).toBe(0)
    expect(by.get('member')!.deferredRevenue).toBe(5_000)
  })
})

describe('ownerPart', () => {
  it('keeps what nobody else holds', () => {
    expect(ownerPart([])).toBe(1)
    expect(ownerPart([{ pct: 0.5 }])).toBe(0.5)
    expect(ownerPart([{ pct: 0.3 }, { pct: 0.2 }])).toBeCloseTo(0.5)
  })
})

describe('releasedOrders with a shared bill', () => {
  it('releases the bill once, in the owner’s name, with the whole bill’s revenue', () => {
    const orders = splitOrdersByShares([bill()], [{ orderId: 'o1', staffId: 'member', pct: 0.5 }])
    const inp = input(orders)
    const rel = releasedOrders(inp, computeCommissionRun(inp))
    expect(rel).toEqual([
      { order_id: 'o1', order_no: 'HC-SO-1', staff_id: 'owner', order_period_month: '2026-08-01', product_revenue: 10_000 },
    ])
  })
})
