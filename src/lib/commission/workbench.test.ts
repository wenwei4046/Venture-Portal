import { describe, expect, it } from 'vitest'
import { computeCommissionRun, round2 } from './engine'
import { splitOrdersByShares } from './shares'
import type { EngineInput, Rank, SalesOrder } from './types'
import { allocateCommissionAmount, buildCommissionWorkbench, type CommissionWorkbench } from './workbench'

const rank = (rankKey: string, productRate: number, sortOrder: number, extra: Partial<Rank> = {}): Rank => ({
  rankKey, productRate, sortOrder, titleId: rankKey, titleLabel: `${rankKey} title`, label: `${productRate * 100}%`,
  canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, ...extra,
})

function sale(id: string, amount = 1_000, extra: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id, orderNo: `SO-${id}`, staffId: 'agent', periodMonth: '2026-08-01',
    orderDate: '2026-08-12', eventDate: '2026-08-12', orderTotal: amount, paidAmount: amount,
    lines: [
      { id: `${id}-goods`, itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: amount, costAmount: amount * 0.6 },
      { id: `${id}-kpi`, itemGroup: 'ACC', productCode: 'PILLOW', brandCode: 'AKEMI', qty: 1, lineAmount: 0, costAmount: 0 },
    ], ...extra,
  }
}

function input(extra: Partial<EngineInput> = {}): EngineInput {
  return {
    periodMonth: '2026-08-01',
    scheme: {
      openBillBasis: 'uplift_on_commission', overrideIncludesKpi: false,
      enableProductRevenue: true, enableKpi: true, enableOpenBill: true, enableOverride: true,
      enableMarginPenalty: true, enableMarginIncentive: true,
      itemGroups: [{ group: 'SOFA', commissionable: true }, { group: 'ACC', commissionable: true }],
      depositThresholdPct: 0.3, defaultRateMode: 'fixed',
    },
    ranks: [rank('agent', 0.05, 1), rank('leader', 0.08, 2)],
    hierarchy: [
      { staffId: 'agent', uplineStaffId: 'leader', baseRankKey: 'agent', titleId: 'agent', rateMode: 'fixed' },
      { staffId: 'leader', uplineStaffId: null, baseRankKey: 'leader', titleId: 'leader', rateMode: 'fixed' },
    ],
    orders: [sale('one'), sale('two', 2_000)],
    kpiItems: [{ productCode: 'PILLOW', kpiAmount: 20 }],
    kpiThresholds: [{ minQty: 2, bonusPct: 0.2 }],
    openBillRules: [{ rank: 1, pct: 0.5 }, { rank: 2, pct: 0.4 }, { rank: 3, pct: 0.3 }],
    openBillTags: [{ orderId: 'one', rank: 1 }],
    marginBands: [
      { brandCode: 'AKEMI', bandKey: 'reward', label: 'Reward', kind: 'incentive', marginPct: 0.36, monthlyIncentive: 1_000, commissionMultiplier: 1 },
      { brandCode: 'AKEMI', bandKey: 'penalty', label: 'Penalty', kind: 'penalty', marginPct: 0.25, monthlyIncentive: 0, commissionMultiplier: 0.5 },
    ],
    priorMonths: [], ...extra,
  }
}

function reconcile(workbench: CommissionWorkbench) {
  for (const person of workbench.people) {
    const displayed = person.personalRows.reduce((a, row) => a + row.totalCommission, 0)
      + person.overridingRows.reduce((a, row) => a + row.totalCommission, 0) + person.monthlyGroupIncentive
    expect(round2(displayed), person.staffId).toBe(person.totalCommission)
    expect(person.reconciliationDifference, person.staffId).toBe(0)
  }
  expect(round2(workbench.people.reduce((a, person) => a + person.totalCommission, 0))).toBe(workbench.result.totalCommission)
  for (const agent of workbench.kpi) {
    expect(round2(agent.perItem.reduce((total, item) => total + item.base, 0))).toBe(agent.base)
    expect(round2(agent.perItem.reduce((total, item) => total + item.bonus, 0))).toBe(agent.bonus)
    expect(round2(agent.perItem.reduce((total, item) => total + item.total, 0))).toBe(agent.total)
  }
}

describe('commission workbench ledger', () => {
  it('shows one personal row per order with base + KPI uplift + allocated monthly margin, and each downline order', () => {
    const source = input()
    const board = buildCommissionWorkbench(source, {
      people: [{ staffId: 'agent', name: 'Anthony', titleLabel: 'Revenue Specialist' }, { staffId: 'leader', name: 'Alex' }],
      orders: [{ orderId: 'one', venue: 'Arena', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL' }],
    })
    expect(board.result).toEqual(computeCommissionRun(source))
    const anthony = board.people.find(person => person.staffId === 'agent')!
    expect(anthony.personalRows).toHaveLength(2)
    expect(anthony.personalRows[0]).toMatchObject({
      staffName: 'Anthony', venue: 'Arena', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL',
      productCommission: 50, kpiQty: 1, kpiBase: 20, kpiBonus: 4,
      marginIncentive: 333.33, marginAllocationBasis: 'eligible_goods_revenue',
      openBillBonus: 25, totalCommission: 432.33,
    })
    expect(anthony.personalRows[1].marginIncentive).toBe(666.67)
    expect(anthony.totalCommission).toBe(1223)
    expect(board.overridingRows.map(row => [row.downlineName, row.downlineTitle, row.downlineRank, row.overrideRate, row.overrideAmount]))
      .toEqual([['Anthony', 'Revenue Specialist', '5%', 0.03, 30], ['Anthony', 'Revenue Specialist', '5%', 0.03, 60]])
    expect(board.kpi.find(row => row.staffId === 'agent')).toMatchObject({ qty: 2, base: 40, bonus: 8, total: 48, thresholdPct: 0.2 })
    expect(board.totalCommission).toBe(1313)
    reconcile(board)
  })

  it('excluding and restoring a bill recalculates the monthly threshold, downline override, and open-bill payout', () => {
    const source = input()
    const before = JSON.stringify(source)
    const excluded = buildCommissionWorkbench(source, { excludedOrderIds: ['one'] })
    expect(excluded.personalRows.find(row => row.orderId === 'one')).toMatchObject({
      status: 'excluded', productRevenue: 1000, orderTotal: 1000, totalCommission: 0, kpiBase: 0,
    })
    expect(excluded.kpi.find(row => row.staffId === 'agent')).toMatchObject({ qty: 1, base: 20, bonus: 0 })
    expect(excluded.overridingRows.map(row => row.orderId)).toEqual(['two'])
    expect(excluded.people.find(person => person.staffId === 'agent')?.totalCommission).toBe(1120)
    const restored = buildCommissionWorkbench(source, { excludedOrderIds: [] })
    expect(restored.totalCommission).toBe(1313)
    expect(JSON.stringify(source)).toBe(before)
    reconcile(excluded)
    reconcile(restored)
  })

  it('allocates open-bill on the actual selected order and never treats deposit-pending or previously released bills as payable', () => {
    const source = input({ orders: [sale('one'), sale('two', 2000), sale('pending', 1000, { paidAmount: 20 }), sale('released', 1000, { alreadyReleased: true })] })
    const board = buildCommissionWorkbench(source, { openBillTags: [{ orderId: 'two', rank: 2 }, { orderId: 'pending', rank: 1 }] })
    expect(board.personalRows.find(row => row.orderId === 'one')?.openBillBonus).toBe(0)
    expect(board.personalRows.find(row => row.orderId === 'two')).toMatchObject({ openBillBonus: 40, openBillRate: 0.4, openBillRank: 2 })
    expect(board.personalRows.find(row => row.orderId === 'pending')).toMatchObject({ status: 'deposit_pending', totalCommission: 0 })
    expect(board.personalRows.find(row => row.orderId === 'released')).toMatchObject({ status: 'already_released', totalCommission: 0 })
    expect(board.overridingRows.map(row => row.orderId)).toEqual(['one', 'two'])
    expect(board.kpi.find(row => row.staffId === 'agent')?.qty).toBe(2)
    reconcile(board)
  })

  it('uses engine margin penalties for personal/open-bill/override, while KPI stays unpenalised', () => {
    const order = sale('one', 1000, { manualMarginPct: 0.2 })
    const board = buildCommissionWorkbench(input({ orders: [order] }))
    expect(board.personalRows[0]).toMatchObject({ productCommission: 25, openBillBonus: 12.5, kpiBase: 20, penaltyWithheld: 37.5, marginPct: 0.2, marginCost: 800, marginSource: 'manual' })
    expect(board.overridingRows[0]).toMatchObject({ overrideBasis: 500, overrideRate: 0.03, overrideAmount: 15 })
    reconcile(board)
  })

  it('does not create a margin from incomplete costs and uses the configured Revenue Team cost divisor', () => {
    const missing = sale('one')
    delete missing.lines[0].costAmount
    const unknown = buildCommissionWorkbench(input({ orders: [missing] }))
    expect(unknown.personalRows[0]).toMatchObject({ marginPct: null, marginCost: null, marginIncentive: 0, penaltyMultiplier: 1 })
    const source = input({ orders: [sale('one')] })
    source.scheme.costDivisor = 0.8
    const costed = buildCommissionWorkbench(source)
    expect(costed.personalRows[0]).toMatchObject({ marginPct: 0.25, marginCost: 750, penaltyMultiplier: 0.5, marginIncentive: 0 })
    reconcile(unknown)
    reconcile(costed)
  })

  it('conserves cents when monthly KPI, margin, and overriding amounts cannot evenly divide among orders', () => {
    const source = input({
      orders: ['one', 'two', 'three'].map(id => sale(id, 0.11)),
      kpiItems: [{ productCode: 'PILLOW', kpiAmount: 0.01 }], openBillTags: [],
      marginBands: [{ brandCode: 'AKEMI', bandKey: 'reward', label: 'Reward', kind: 'incentive', marginPct: 0, monthlyIncentive: 0.01, commissionMultiplier: 1 }],
    })
    const board = buildCommissionWorkbench(source)
    expect(board.personalRows.map(row => row.kpiBonus)).toEqual([0.01, 0, 0])
    expect(board.personalRows.map(row => row.marginIncentive)).toEqual([0.01, 0, 0])
    expect(board.overridingRows.map(row => row.overrideAmount)).toEqual([0.01, 0, 0])
    reconcile(board)
  })

  it('includes KPI revenue in the override base only when the scheme enables it', () => {
    const order = sale('one')
    order.lines[1].lineAmount = 200
    const source = input({ orders: [order] })
    const without = buildCommissionWorkbench(source)
    source.scheme.overrideIncludesKpi = true
    const withKpi = buildCommissionWorkbench(source)
    expect(without.overridingRows[0].overrideBasis).toBe(1000)
    expect(withKpi.overridingRows[0].overrideBasis).toBe(1200)
    expect(withKpi.overridingRows[0].overrideAmount).toBe(36)
    reconcile(withKpi)
  })

  it('preserves shared-bill original IDs and excludes/restores every holder and upline together', () => {
    const source = input()
    source.orders = splitOrdersByShares([sale('one')], [{ orderId: 'one', staffId: 'leader', pct: 0.5 }])
    const board = buildCommissionWorkbench(source)
    expect(board.personalRows.map(row => row.originalOrderId)).toEqual(['one', 'one'])
    expect(board.personalRows.map(row => row.orderTotal)).toEqual([500, 500])
    expect(new Set(board.personalRows.map(row => row.key)).size).toBe(2)
    expect(board.personalRows.map(row => row.openBillBonus)).toEqual([12.5, 20])
    const excluded = buildCommissionWorkbench(source, { excludedOrderIds: ['one'] })
    expect(excluded.totalCommission).toBe(0)
    expect(excluded.personalRows.every(row => row.status === 'excluded')).toBe(true)
    expect(excluded.overridingRows).toHaveLength(0)
    reconcile(board)
    reconcile(excluded)
  })

  it('keeps fixed monthly group incentives separate and excludes non-cash subsidy from the commission total', () => {
    const source = input({ orders: [sale('one')] })
    source.scheme = { ...source.scheme, enableKpi: false, enableOpenBill: false, enableMarginIncentive: false, enableGroupIncentive: true, groupSalesDepth: 2, overrideDepth: 2 }
    source.ranks.push(rank('package', 0, 3, { groupSalesThreshold: 1000, groupIncentiveAmount: 6000, groupSubsidyCap: 2000 }))
    source.hierarchy[1].baseRankKey = 'package'
    source.hierarchy[1].titleId = 'package'
    const board = buildCommissionWorkbench(source)
    const leader = board.people.find(person => person.staffId === 'leader')!
    expect(leader).toMatchObject({ personalTotal: 0, overrideTotal: 0, monthlyGroupIncentive: 6000, totalCommission: 6000 })
    expect(leader.statement?.groupSubsidyCap).toBe(2000)
    expect(leader.overridingRows).toHaveLength(0)
    reconcile(board)
  })

  it('counts configured KPI sales when KPI pay is disabled, without inventing an expense', () => {
    const source = input({ orders: [sale('one'), sale('pending', 1000, { paidAmount: 0 })] })
    source.scheme.enableKpi = false
    const board = buildCommissionWorkbench(source)
    expect(board.kpi.find(agent => agent.staffId === 'agent')).toMatchObject({
      soldQty: 2, heldQty: 1, qty: 0, base: 0, bonus: 0, total: 0,
      perItem: [{ productCode: 'PILLOW', qty: 2, heldQty: 1, payableQty: 0, unitAmount: 20, total: 0 }],
    })
    expect(board.result).toEqual(computeCommissionRun(source))
    reconcile(board)
  })

  it('separates sold, held, temporarily excluded, and payable KPI quantity', () => {
    const source = input({ orders: [sale('one'), sale('pending', 1000, { paidAmount: 0 }), sale('excluded'), sale('released', 1000, { alreadyReleased: true })] })
    const board = buildCommissionWorkbench(source, { excludedOrderIds: ['excluded'] })
    expect(board.kpi.find(agent => agent.staffId === 'agent')).toMatchObject({
      soldQty: 4, heldQty: 1, excludedQty: 1, qty: 1, base: 20, bonus: 0, total: 20,
      perItem: [{ productCode: 'PILLOW', qty: 4, heldQty: 1, excludedQty: 1, payableQty: 1, total: 20 }],
    })
    reconcile(board)
  })

  it('splits actual KPI expense across product codes, preserving threshold bonus cents and shared sold quantities', () => {
    const order = sale('one')
    order.lines.push({ id: 'second-kpi', productCode: ' bolster ', productName: 'Bolster', itemGroup: 'ACC', brandCode: 'AKEMI', qty: 1, lineAmount: 0, costAmount: 0 })
    const source = input({ orders: [order], kpiItems: [{ productCode: 'PILLOW', kpiAmount: 0.03 }, { productCode: 'BOLSTER', kpiAmount: 0.02 }] })
    const board = buildCommissionWorkbench(source)
    expect(board.kpi.find(agent => agent.staffId === 'agent')?.perItem).toEqual([
      { productCode: 'BOLSTER', productName: 'Bolster', qty: 1, heldQty: 0, excludedQty: 0, payableQty: 1, unitAmount: 0.02, base: 0.02, bonus: 0, total: 0.02 },
      { productCode: 'PILLOW', productName: 'PILLOW', qty: 1, heldQty: 0, excludedQty: 0, payableQty: 1, unitAmount: 0.03, base: 0.03, bonus: 0.01, total: 0.04 },
    ])
    source.orders = splitOrdersByShares([order], [{ orderId: 'one', staffId: 'leader', pct: 1 / 3 }])
    const shared = buildCommissionWorkbench(source)
    expect(shared.kpi.reduce((qty, agent) => qty + agent.soldQty, 0)).toBe(2)
    reconcile(board)
    reconcile(shared)
  })

  it('reconciles signed sales and KPI returns with positive monthly totals', () => {
    const refund = sale('return', -100)
    refund.lines[1].qty = -1
    const source = input({ orders: [sale('one'), sale('two'), sale('three'), refund] })
    const board = buildCommissionWorkbench(source)
    expect(board.kpi.find(agent => agent.staffId === 'agent')).toMatchObject({ soldQty: 2, qty: 2, base: 40, bonus: 8, total: 48 })
    expect(board.personalRows.find(row => row.orderId === 'return')).toMatchObject({ kpiBase: -20, kpiBonus: -4 })
    expect(board.overridingRows.find(row => row.orderId === 'return')?.overrideAmount).toBe(-3)
    reconcile(board)
  })
})

describe('commission display allocation', () => {
  it('assigns residual cents deterministically and supports refunds', () => {
    expect(allocateCommissionAmount(0.07, [1, 1, 1])).toEqual([0.03, 0.02, 0.02])
    expect(allocateCommissionAmount(3, [200, -100])).toEqual([6, -3])
    expect(allocateCommissionAmount(0, [1, 1])).toEqual([0, 0])
    expect(allocateCommissionAmount(2, [0, 1])).toEqual([0, 2])
  })

  it('refuses to silently lose a non-zero engine amount when its allocation basis is absent or cancels to zero', () => {
    expect(() => allocateCommissionAmount(1, [])).toThrow('non-zero source basis')
    expect(() => allocateCommissionAmount(1, [100, -100])).toThrow('non-zero source basis')
  })
})
