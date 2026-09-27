import { describe, expect, it } from 'vitest'
import { unpricedBills, unpricedByStaff } from './unpriced'
import { splitOrdersByShares } from './shares'
import type { EngineInput, SalesOrder } from './types'

function bill(id: string, lines: Array<[group: string, amount: number]>, paid: number, extra: Partial<SalesOrder> = {}): SalesOrder {
  const total = lines.reduce((a, [, amount]) => a + amount, 0)
  return {
    id, orderNo: `HC-SO-${id}`, staffId: 'stanley', periodMonth: '2026-09-01',
    orderDate: '2026-09-20', eventDate: '2026-09-20', orderTotal: total, paidAmount: paid,
    lines: lines.map(([itemGroup, lineAmount], i) => ({ id: `${id}-${i}`, itemGroup, productCode: `${itemGroup}-${i}`, qty: 1, lineAmount })),
    ...extra,
  }
}

function input(orders: SalesOrder[]): Pick<EngineInput, 'orders' | 'scheme'> {
  return {
    orders,
    scheme: {
      openBillBasis: 'uplift_on_commission', overrideIncludesKpi: false,
      enableProductRevenue: true, enableKpi: false, enableOpenBill: false, enableOverride: true,
      enableMarginPenalty: false, enableMarginIncentive: false,
      itemGroups: [
        { group: 'mattress', commissionable: true }, { group: 'bedframe', commissionable: true },
        { group: 'accessory', commissionable: true }, { group: 'service', commissionable: false },
      ],
      depositThresholdPct: 0.3, defaultRateMode: 'fixed',
    },
  }
}

describe('bills paid on but priced RM 0', () => {
  it('finds a bill whose goods are all RM 0 while the customer has paid (HC-SO-2609-114)', () => {
    const found = unpricedBills(input([
      bill('2609-114', [['mattress', 0], ['bedframe', 0], ['accessory', 0]], 2_839),
      bill('priced', [['mattress', 4_139], ['bedframe', 0], ['accessory', 0]], 2_139),
    ]))
    expect(found).toEqual([{ orderId: '2609-114', orderNo: 'HC-SO-2609-114', staffId: 'stanley', orderDate: '2026-09-20', periodMonth: '2026-09-01', paidAmount: 2_839 }])
  })

  it('leaves alone a free replacement, a service-only order, a package priced on one line, and an upsale', () => {
    expect(unpricedBills(input([
      bill('replacement', [['mattress', 0]], 0),
      bill('disposal', [['service', 0]], 300),
      bill('package', [['mattress', 5_738], ['bedframe', 0]], 3_000),
      bill('drop', [['UPSALE', -500]], -500, { upsale: true }),
    ]))).toEqual([])
  })

  it('names a shared bill once, in the owner’s name, with the whole payment', () => {
    const shared = splitOrdersByShares([bill('shared', [['mattress', 0]], 4_000)], [{ orderId: 'shared', staffId: 'lucas', pct: 0.5 }])
    const found = unpricedBills(input(shared))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ staffId: 'stanley', paidAmount: 4_000 })
  })

  it('groups them by salesperson', () => {
    const found = unpricedBills(input([
      bill('a', [['mattress', 0]], 100, { staffId: 'anthony' }),
      bill('b', [['mattress', 0]], 200, { staffId: 'anthony' }),
      bill('c', [['mattress', 0]], 300),
    ]))
    const byStaff = unpricedByStaff(found)
    expect(byStaff.get('anthony')?.map(b => b.orderNo)).toEqual(['HC-SO-a', 'HC-SO-b'])
    expect(byStaff.get('stanley')?.map(b => b.orderNo)).toEqual(['HC-SO-c'])
  })
})
