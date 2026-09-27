import { describe, expect, it } from 'vitest'
import { computeCommissionRun, round2 } from './engine'
import { splitOrdersByShares } from './shares'
import type { EngineInput, Rank, SalesOrder } from './types'
import { allocateCommissionAmount, buildCommissionWorkbench, type CommissionWorkbench } from './workbench'

const rank = (rankKey: string, productRate: number, sortOrder: number, extra: Partial<Rank> = {}): Rank => ({
  rankKey, productRate, sortOrder, titleId: rankKey, titleLabel: `${rankKey} title`, label: `${productRate * 100}%`,
  canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, ...extra,
})

// Every bill carries a KPI pillow at RM 20 (2026-09-27): its RM 20 comes off
// the bill's sales and is paid flat as KPI, so a 1,000 bill earns its rate on 980.
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
      + person.monthlyDirectorPay
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
      productRevenue: 980, productCommission: 49, kpiQty: 1, kpiBase: 20, kpiBonus: 4,
      marginIncentive: 331.08, marginAllocationBasis: 'eligible_goods_revenue',
      openBillBonus: 24.5, totalCommission: 428.58,
    })
    expect(anthony.personalRows[1].marginIncentive).toBe(668.92)
    expect(anthony.totalCommission).toBe(1220.5)
    expect(board.overridingRows.map(row => [row.downlineName, row.downlineTitle, row.downlineRank, row.overrideRate, row.overrideAmount]))
      .toEqual([['Anthony', 'Revenue Specialist', '5%', 0.03, 29.4], ['Anthony', 'Revenue Specialist', '5%', 0.03, 59.4]])
    expect(board.kpi.find(row => row.staffId === 'agent')).toMatchObject({ qty: 2, base: 40, bonus: 8, total: 48, thresholdPct: 0.2 })
    expect(board.totalCommission).toBe(1309.3)
    reconcile(board)
  })

  it('excluding and restoring a bill recalculates the monthly threshold, downline override, and open-bill payout', () => {
    const source = input()
    const before = JSON.stringify(source)
    const excluded = buildCommissionWorkbench(source, { excludedOrderIds: ['one'] })
    expect(excluded.personalRows.find(row => row.orderId === 'one')).toMatchObject({
      status: 'excluded', productRevenue: 980, orderTotal: 1000, totalCommission: 0, kpiBase: 0,
    })
    expect(excluded.kpi.find(row => row.staffId === 'agent')).toMatchObject({ qty: 1, base: 20, bonus: 0 })
    expect(excluded.overridingRows.map(row => row.orderId)).toEqual(['two'])
    expect(excluded.people.find(person => person.staffId === 'agent')?.totalCommission).toBe(1119)
    const restored = buildCommissionWorkbench(source, { excludedOrderIds: [] })
    expect(restored.totalCommission).toBe(1309.3)
    expect(JSON.stringify(source)).toBe(before)
    reconcile(excluded)
    reconcile(restored)
  })

  it('allocates open-bill on the actual selected order and never treats deposit-pending or previously released bills as payable', () => {
    const source = input({ orders: [sale('one'), sale('two', 2000), sale('pending', 1000, { paidAmount: 20 }), sale('released', 1000, { alreadyReleased: true })] })
    const board = buildCommissionWorkbench(source, { openBillTags: [{ orderId: 'two', rank: 2 }, { orderId: 'pending', rank: 1 }] })
    expect(board.personalRows.find(row => row.orderId === 'one')?.openBillBonus).toBe(0)
    expect(board.personalRows.find(row => row.orderId === 'two')).toMatchObject({ openBillBonus: 39.6, openBillRate: 0.4, openBillRank: 2 })
    expect(board.personalRows.find(row => row.orderId === 'pending')).toMatchObject({ status: 'deposit_pending', totalCommission: 0 })
    expect(board.personalRows.find(row => row.orderId === 'released')).toMatchObject({ status: 'already_released', totalCommission: 0 })
    expect(board.overridingRows.map(row => row.orderId)).toEqual(['one', 'two'])
    expect(board.kpi.find(row => row.staffId === 'agent')?.qty).toBe(2)
    reconcile(board)
  })

  it('uses engine margin penalties for personal/open-bill/override, while KPI stays unpenalised', () => {
    const order = sale('one', 1000, { manualMarginPct: 0.2 })
    const board = buildCommissionWorkbench(input({ orders: [order] }))
    expect(board.personalRows[0]).toMatchObject({ productCommission: 24.5, openBillBonus: 12.25, kpiBase: 20, penaltyWithheld: 36.75, marginPct: 0.2, marginCost: 784, marginSource: 'manual' })
    expect(board.overridingRows[0]).toMatchObject({ overrideBasis: 490, overrideRate: 0.03, overrideAmount: 14.7 })
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
    // 600 ÷ 0.8 = 750 of team cost against the bill's 980 of main sales.
    expect(costed.personalRows[0]).toMatchObject({ marginPct: expect.closeTo(230 / 980, 10), marginCost: 750, penaltyMultiplier: 0.5, marginIncentive: 0 })
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
    expect(without.overridingRows[0].overrideBasis).toBe(1180) // 1,200 less the pillow's 20
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
    expect(board.personalRows.map(row => row.openBillBonus)).toEqual([12.25, 19.6]) // 490 each
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
      { itemKey: 'sku:BOLSTER', source: 'sku', productCode: 'BOLSTER', productName: 'Bolster', qty: 1, heldQty: 0, excludedQty: 0, payableQty: 1, unitAmount: 0.02, base: 0.02, bonus: 0, total: 0.02 },
      { itemKey: 'sku:PILLOW', source: 'sku', productCode: 'PILLOW', productName: 'PILLOW', qty: 1, heldQty: 0, excludedQty: 0, payableQty: 1, unitAmount: 0.03, base: 0.03, bonus: 0.01, total: 0.04 },
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
    expect(board.overridingRows.find(row => row.orderId === 'return')?.overrideAmount).toBe(-2.4) // −80 of 2,860
    reconcile(board)
  })
})

// A Revenue Director (2026-09-27): own bills at the rung rate, the Directors
// tab's amounts as a monthly line, and nothing that is not theirs.
describe('a Revenue Director on the ledger', () => {
  const directorInput = () => input({
    ranks: [rank('agent', 0.05, 1), rank('leader', 0.08, 2), rank('rd_12', 0.12, 3, { titleId: 'title-rd', titleLabel: 'Revenue Director', label: 'Rank SS' })],
    orders: [sale('one'), sale('mine', 2_000, { staffId: 'director' })],
    departmentHeadIds: ['director'],
    directors: [{ staffId: 'director', rankKey: 'rd_12', fixedAmount: 38_000, salesThreshold: 2_900, incentiveAmount: 5_000 }],
    monthCommissionableValue: 3_000,
  })

  it('shows their bills at 12%, the fixed amount and incentive beside them, and adds up', () => {
    const workbench = buildCommissionWorkbench(directorInput(), { people: [{ staffId: 'director', name: 'KRIS' }] })
    reconcile(workbench)
    const kris = workbench.people.find(person => person.staffId === 'director')!
    expect(kris.titleLabel).toBe('Revenue Director')
    expect(kris.rankLabel).toBe('Rank SS')
    expect(kris.productRate).toBe(0.12)
    // RM 2,000 less the RM 20 KPI pillow, at 12%; no KPI allowance, no Open Bill.
    expect(kris.personalRows.map(row => [row.orderNo, row.productCommission, row.kpiBase, row.totalCommission])).toEqual([['SO-mine', 237.6, 0, 237.6]])
    expect(kris.monthlyDirectorPay).toBe(43_000)
    expect(kris.overrideTotal).toBe(0)
    expect(kris.totalCommission).toBe(43_237.6)
  })

  it('leaves the incentive out in a month below the threshold', () => {
    const workbench = buildCommissionWorkbench({ ...directorInput(), monthCommissionableValue: 2_899.99 })
    reconcile(workbench)
    expect(workbench.people.find(person => person.staffId === 'director')!.monthlyDirectorPay).toBe(38_000)
  })
})

describe('what on a bill earns commission (2026-09-26)', () => {
  // A Kuching bill: the goods, a KPI pillow, and the transport the ERP folds
  // into the total. The two figures the ledger shows are the whole bill and
  // the part that earns — the difference is what earns nothing.
  const kuching = () => sale('kuching', 1_000, {
    orderTotal: 1_247, paidAmount: 1_247,
    lines: [
      { id: 'k-goods', itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: 1_000, costAmount: 600 },
      { id: 'k-pillow', itemGroup: 'ACC', productCode: 'PILLOW', brandCode: 'AKEMI', qty: 1, lineAmount: 100, costAmount: 40 },
      { id: 'k-transport', itemGroup: 'SERVICE', productCode: 'TRANSPORTATION CHARGES', qty: 1, lineAmount: 147, costAmount: 0 },
    ],
  })
  const scheme = { ...input().scheme, itemGroups: [...input().scheme.itemGroups, { group: 'SERVICE', commissionable: false }] }

  it('leaves out transport and any group the scheme does not pay on, and keeps KPI items — they earn too, as KPI', () => {
    const odd = sale('odd', 500, {
      orderTotal: 560,
      lines: [
        { id: 'o-goods', itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: 500, costAmount: 300 },
        { id: 'o-unknown', itemGroup: 'UNGROUPED', productCode: 'MISC', qty: 1, lineAmount: 60 },
      ],
    })
    const board = buildCommissionWorkbench(input({ scheme, orders: [kuching(), odd], openBillTags: [] }))
    expect(board.personalRows.find(row => row.orderId === 'kuching')).toMatchObject({
      orderTotal: 1_247, commissionableValue: 1_100, productRevenue: 1_080, // the pillow's 20 is KPI
    })
    expect(board.personalRows.find(row => row.orderId === 'odd')).toMatchObject({ orderTotal: 560, commissionableValue: 500 })
  })

  it('with KPI switched off a KPI item is judged by its group, like the engine judges it', () => {
    const board = buildCommissionWorkbench(input({ scheme: { ...scheme, enableKpi: false }, orders: [kuching()], openBillTags: [] }))
    expect(board.personalRows[0]).toMatchObject({ commissionableValue: 1_100, productRevenue: 1_100 })
  })

  it("an upsale earns whole, and a shared bill's parts add back to the bill", () => {
    const up = sale('up', 700, {
      upsale: true,
      lines: [{ id: 'up-line', itemGroup: 'UPSALE', productCode: 'UPSALE', qty: 1, lineAmount: 700, upsale: true }],
    })
    const shared = splitOrdersByShares([kuching()], [{ orderId: 'kuching', staffId: 'leader', pct: 0.5 }])
    const board = buildCommissionWorkbench(input({ scheme, orders: [...shared, up], openBillTags: [] }))
    expect(board.personalRows.find(row => row.orderId === 'up')?.commissionableValue).toBe(700)
    const parts = board.personalRows.filter(row => row.orderId === 'kuching')
    expect(parts).toHaveLength(2)
    expect(round2(parts.reduce((a, row) => a + row.commissionableValue, 0))).toBe(1_100)
    expect(round2(parts.reduce((a, row) => a + row.orderTotal, 0))).toBe(1_247)
  })
})

describe('a KPI special on a bed frame (2026-09-27)', () => {
  it("summarises it by the special, and takes its amount off the bill's sales", () => {
    const order = sale('bf', 10_000, {
      lines: [
        { id: 'bf-goods', itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: 10_000, costAmount: 6_500 },
        { id: 'bf-frame', itemGroup: 'BEDFRAME', productCode: 'TRION (A)-(K)', qty: 1, lineAmount: 0, costAmount: 0, specials: ['HB Straight'] },
      ],
    })
    const source = input({
      orders: [order], openBillTags: [],
      scheme: { ...input().scheme, itemGroups: [...input().scheme.itemGroups, { group: 'BEDFRAME', commissionable: true }] },
      kpiItems: [{ source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', kpiAmount: 200 }],
    })
    const board = buildCommissionWorkbench(source)
    expect(board.personalRows[0]).toMatchObject({ productRevenue: 9_800, productCommission: 490, kpiBase: 200, commissionableValue: 10_000 })
    expect(board.kpi.find(agent => agent.staffId === 'agent')?.perItem).toMatchObject([
      { itemKey: 'option:bedframe_specials:hb straight', source: 'option', productCode: 'HB Straight', qty: 1, base: 200 },
    ])
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
