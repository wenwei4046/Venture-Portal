import { describe, expect, it } from 'vitest'
import { commissionByBill } from './bill-commission'
import type { CommissionOrderRow } from './workbench'

function row(over: Partial<CommissionOrderRow>): CommissionOrderRow {
  return {
    key: 'k', orderId: 'o1', originalOrderId: 'o1', orderNo: 'SO-1', orderDate: '2026-08-02',
    eventDate: '2026-08-02', periodMonth: '2026-08-01', staffId: 's1', staffName: 'A',
    venue: null, eventName: null, organizer: null, location: null, brands: ['AKEMI'],
    categories: ['mattress'], upsale: false, orderTotal: 1000, commissionableValue: 1000, paidAmount: 1000, productRevenue: 1000,
    marginRevenue: 1000, marginCost: 500, marginPct: 0.5, marginSource: 'cost', status: 'eligible',
    productRate: 0.05, productCommission: 50, kpiQty: 0, kpiBase: 0, kpiBonus: 0, kpiThresholdPct: 0,
    marginIncentive: 0, marginAllocationBasis: null, openBillRank: null, openBillRate: 0,
    openBillBonus: 0, penaltyMultiplier: 1, penaltyWithheld: 0, totalCommission: 50,
    ...over,
  }
}

describe('commissionByBill', () => {
  it('adds the shared parts of one bill back together', () => {
    // A RM 1,147 bill, RM 147 of it transport, shared 50/50.
    const map = commissionByBill([
      row({ staffId: 's1', orderTotal: 573.5, commissionableValue: 500, productCommission: 25, openBillBonus: 10, totalCommission: 35 }),
      row({ staffId: 's2', orderTotal: 573.5, commissionableValue: 500, brands: ['DUNLOP'], categories: ['sofa'], productCommission: 30, kpiBase: 5, kpiBonus: 1, totalCommission: 36 }),
    ], '2026-08-01')
    expect(map.get('o1')).toEqual({
      status: 'eligible', brands: ['AKEMI', 'DUNLOP'], categories: ['mattress', 'sofa'],
      commissionable: 1000, product: 55, kpi: 6, marginIncentive: 0, openBill: 10, total: 71,
    })
  })

  it('leaves out bills carried in from another month and upsales', () => {
    const map = commissionByBill([
      row({ orderId: 'old', originalOrderId: 'old', periodMonth: '2026-07-01' }),
      row({ orderId: 'up', originalOrderId: 'up', upsale: true }),
    ], '2026-08-01')
    expect(map.size).toBe(0)
  })
})
