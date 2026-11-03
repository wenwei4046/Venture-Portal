import { describe, expect, it } from 'vitest'
import { computeCommissionRun } from './engine'
import type { CommissionScheme, EngineInput, EngineResult, HierarchyNode, Rank, SalesOrder } from './types'

const rank = (rankKey: string, productRate: number, sortOrder: number, extra: Partial<Rank> = {}): Rank => ({
  rankKey,
  productRate,
  sortOrder,
  titleId: rankKey,
  titleLabel: rankKey.toUpperCase(),
  label: rankKey.toUpperCase(),
  canRecruit: true,
  groupSalesThreshold: null,
  personalSalesThreshold: null,
  consecutiveMonths: null,
  ...extra,
})

const RANKS: Rank[] = [
  rank('rs', 0.03, 10, { canRecruit: false }),
  rank('ta', 0.035, 20, { personalSalesThreshold: 200_000, consecutiveMonths: 2 }),
  rank('tl', 0.04, 30, { groupSalesThreshold: 800_000 }),
  rank('stl', 0, 40, { groupSalesThreshold: 1_000_000, groupIncentiveAmount: 6_000, groupSubsidyCap: 2_000 }),
]

const PERCENTAGE_SCHEME: CommissionScheme = {
  overrideIncludesKpi: false,
  enableProductRevenue: true,
  enableKpi: false,
  enableOverride: true,
  enableMarginPenalty: false,
  enableMarginIncentive: false,
  itemGroups: [{ group: 'RENOVATION', commissionable: true }],
  depositThresholdPct: null,
  defaultRateMode: 'variable',
}

const IR_SCHEME: CommissionScheme = {
  ...PERCENTAGE_SCHEME,
  groupSalesDepth: 2,
  overrideDepth: 2,
  enableGroupIncentive: true,
}

const member = (
  staffId: string,
  uplineStaffId: string | null,
  baseRankKey: string,
  rateMode: 'fixed' | 'variable' = 'variable',
): HierarchyNode => ({ staffId, uplineStaffId, baseRankKey, titleId: baseRankKey, rateMode })

const sale = (staffId: string, amount: number, periodMonth = '2026-09-01'): SalesOrder => ({
  id: `${periodMonth}-${staffId}`,
  orderNo: `${periodMonth}-${staffId}`,
  staffId,
  orderDate: periodMonth,
  periodMonth,
  eventDate: periodMonth,
  orderTotal: amount,
  paidAmount: amount,
  lines: [{ id: `${periodMonth}-${staffId}-line`, itemGroup: 'RENOVATION', productCode: 'WORKS', qty: 1, lineAmount: amount }],
})

function run(extra: Partial<EngineInput> = {}) {
  return computeCommissionRun({
    periodMonth: '2026-09-01',
    scheme: IR_SCHEME,
    ranks: RANKS,
    orders: [],
    kpiItems: [],
    kpiThresholds: [],
    marginBands: [],
    hierarchy: [],
    priorMonths: [],
    ...extra,
  })
}

function statement(result: EngineResult, staffId: string) {
  const found = result.statements.find(s => s.staffId === staffId)
  if (!found) throw new Error(`Missing statement for ${staffId}`)
  return found
}

describe('IR group packages in the commission run', () => {
  it.each([4, 5, 6])('pays all %i expanded direct groups with repeated own sales and no duplicate actual revenue', directCount => {
    const directs = Array.from({ length: directCount }, (_, i) => `direct-${i + 1}`)
    const result = run({
      hierarchy: [member('leader', null, 'stl'), ...directs.map(id => member(id, 'leader', 'rs'))],
      orders: [sale('leader', 200_000), ...directs.map(id => sale(id, 800_000))],
    })
    const leader = statement(result, 'leader')

    expect(result.warnings).toEqual([])
    expect(leader.groupRevenue).toBe(200_000 + directCount * 800_000)
    expect(leader.groupBreakdown?.map(group => group.leaderPersonalRevenue)).toEqual(directs.map(() => 200_000))
    expect(leader.groupBreakdown?.map(group => group.totalRevenue)).toEqual(directs.map(() => 1_000_000))
    expect(leader.groupIncentive).toBe(directCount * 6_000)
    expect(leader.groupSubsidyCap).toBe(directCount * 2_000)
    expect(leader.totalCommission).toBe(directCount * 6_000)
    expect(leader.productRate).toBe(0)
    expect(leader.productCommission).toBe(0)
    expect(leader.overrideCommission).toBe(0)
    expect(leader.lines.filter(line => line.component === 'group_incentive').map(line => line.sourceStaffId)).toEqual(directs)
    expect(leader.fullSpec).toBe(false)
  })

  it('pays a qualifying fourth group when the original three and fifth miss, without pooling surplus', () => {
    const directs = ['a', 'b', 'c', 'd', 'e']
    const result = run({
      hierarchy: [member('leader', null, 'stl'), ...directs.map(id => member(id, 'leader', 'rs'))],
      orders: [sale('leader', 200_000), sale('d', 2_800_000), sale('e', 799_999.99)],
    })
    const leader = statement(result, 'leader')

    expect(result.warnings).toEqual([])
    expect(leader.groupBreakdown?.map(group => group.qualifies)).toEqual([false, false, false, true, false])
    expect(leader.groupIncentive).toBe(6_000)
    expect(leader.groupSubsidyCap).toBe(2_000)
    expect(leader.totalCommission).toBe(6_000)
    expect(leader.productCommission).toBe(0)
    expect(leader.overrideCommission).toBe(0)
    expect(leader.fullSpec).toBe(false)
  })

  it.each(['variable', 'fixed'] as const)('recalculates an expanded %s team monthly and restores 4%% when every group misses', rateMode => {
    const directs = ['a', 'b', 'c', 'd', 'e']
    const hierarchy = [member('leader', null, 'stl', rateMode), ...directs.map(id => member(id, 'leader', 'rs'))]
    const qualified = run({ hierarchy, orders: [sale('leader', 200_000), ...directs.map(id => sale(id, 800_000))] })
    expect(statement(qualified, 'leader').totalCommission).toBe(30_000)

    const missed = run({
      periodMonth: '2026-10-01',
      hierarchy,
      orders: [sale('leader', 100_000, '2026-10-01'), ...directs.map(id => sale(id, 100_000, '2026-10-01'))],
      priorMonths: [{ periodMonth: '2026-09-01', personalRevenue: { leader: 200_000, ...Object.fromEntries(directs.map(id => [id, 800_000])) } }],
    })
    const leader = statement(missed, 'leader')

    expect(missed.warnings).toEqual([])
    expect(leader.effectiveRankKey).toBe('tl')
    expect(leader.groupBreakdown?.map(group => group.qualifies)).toEqual(directs.map(() => false))
    expect(leader.productRate).toBe(0.04)
    expect(leader.productCommission).toBe(4_000)
    expect(leader.overrideCommission).toBe(5_000)
    expect(leader.groupIncentive).toBe(0)
    expect(leader.groupSubsidyCap).toBe(0)
    expect(leader.totalCommission).toBe(9_000)
  })

  it('pays two fixed packages on own 200k plus each direct 800k, without percentage pay or subsidy in cash', () => {
    const result = run({
      hierarchy: [member('leader', null, 'stl'), member('a', 'leader', 'rs'), member('b', 'leader', 'rs')],
      orders: [sale('leader', 200_000), sale('a', 800_000), sale('b', 800_000)],
    })
    const leader = statement(result, 'leader')

    expect(result.warnings).toEqual([])
    expect(leader.effectiveRankKey).toBe('stl')
    expect(leader.productRevenue).toBe(200_000)
    expect(leader.groupRevenue).toBe(1_800_000)
    expect(leader.productRate).toBe(0)
    expect(leader.productCommission).toBe(0)
    expect(leader.overrideCommission).toBe(0)
    expect(leader.groupIncentive).toBe(12_000)
    expect(leader.groupSubsidyCap).toBe(4_000)
    expect(leader.totalCommission).toBe(12_000)
    expect(leader.groupBreakdown?.map(group => group.totalRevenue)).toEqual([1_000_000, 1_000_000])
    expect(leader.lines.filter(line => line.component === 'group_incentive').map(line => line.amount)).toEqual([6_000, 6_000])
    for (const s of result.statements) {
      expect(s.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(s.totalCommission)
    }
    expect(result.totalCommission).toBe(result.statements.reduce((sum, s) => sum + s.totalCommission, 0))
  })

  it('can qualify a TA directly for STL with one qualifying RS line and no grandchildren', () => {
    const result = run({
      hierarchy: [member('leader', null, 'ta'), member('direct', 'leader', 'rs')],
      orders: [sale('leader', 200_000), sale('direct', 800_000)],
    })
    const leader = statement(result, 'leader')

    expect(result.warnings).toEqual([])
    expect(leader.effectiveRankKey).toBe('stl')
    expect(leader.promotesToTitleId).toBe('stl')
    expect(leader.groupIncentive).toBe(6_000)
    expect(leader.totalCommission).toBe(6_000)
    expect(leader.fullSpec).toBe(false)
  })

  it.each(['variable', 'fixed'] as const)('reverts a persisted %s STL rank and title to TL 4% in a later month with no qualifying group', rateMode => {
    const hierarchy = [member('leader', null, 'stl', rateMode), member('direct', 'leader', 'rs')]
    const qualified = run({ hierarchy, orders: [sale('leader', 200_000), sale('direct', 800_000)] })
    expect(statement(qualified, 'leader').totalCommission).toBe(6_000)

    const missed = run({
      periodMonth: '2026-10-01',
      hierarchy,
      orders: [sale('leader', 100_000, '2026-10-01'), sale('direct', 100_000, '2026-10-01')],
      priorMonths: [{ periodMonth: '2026-09-01', personalRevenue: { leader: 200_000, direct: 800_000 } }],
    })
    const leader = statement(missed, 'leader')

    expect(leader.effectiveRankKey).toBe('tl')
    expect(leader.productRate).toBe(0.04)
    expect(leader.productCommission).toBe(4_000)
    expect(leader.overrideCommission).toBe(1_000)
    expect(leader.groupIncentive).toBe(0)
    expect(leader.groupSubsidyCap).toBe(0)
    expect(leader.totalCommission).toBe(5_000)
    expect(leader.promotesToTitleId).toBeNull()
  })

  it('awards one fixed package at 1.5M or 3M instead of multiplying by target multiples', () => {
    const result = run({
      hierarchy: [member('leader', null, 'stl'), member('a', 'leader', 'rs'), member('b', 'leader', 'rs')],
      orders: [sale('leader', 200_000), sale('a', 1_300_000), sale('b', 2_800_000)],
    })
    const leader = statement(result, 'leader')

    expect(leader.groupBreakdown?.map(group => group.totalRevenue)).toEqual([1_500_000, 3_000_000])
    expect(leader.groupIncentive).toBe(12_000)
    expect(leader.groupSubsidyCap).toBe(4_000)
  })

  it('excludes the third generation from ordinary targets and each package target', () => {
    const result = run({
      hierarchy: [member('leader', null, 'tl'), member('direct', 'leader', 'ta'), member('child', 'direct', 'ta'), member('deep', 'child', 'rs')],
      orders: [sale('leader', 200_000), sale('direct', 300_000), sale('child', 499_999.99), sale('deep', 900_000)],
    })
    const leader = statement(result, 'leader')

    expect(leader.groupRevenue).toBe(999_999.99)
    expect(leader.groupBreakdown?.[0].totalRevenue).toBe(999_999.99)
    expect(leader.groupIncentive).toBe(0)
    expect(leader.effectiveRankKey).toBe('tl')
  })

  it('warns and pays no package when its per-group target is missing', () => {
    const result = run({
      ranks: RANKS.map(r => r.rankKey === 'stl' ? { ...r, groupSalesThreshold: null } : r),
      hierarchy: [member('leader', null, 'stl'), member('direct', 'leader', 'rs')],
      orders: [sale('leader', 200_000), sale('direct', 800_000)],
    })

    expect(result.warnings.join(' ')).toMatch(/positive per-group sales target/)
    expect(statement(result, 'leader').groupIncentive).toBe(0)
  })

  it('does not promote a percentage member into an unpaid package while the package switch is off', () => {
    const result = run({
      scheme: { ...IR_SCHEME, enableGroupIncentive: false },
      hierarchy: [member('leader', null, 'tl'), member('direct', 'leader', 'rs')],
      orders: [sale('leader', 200_000), sale('direct', 800_000)],
    })
    const leader = statement(result, 'leader')

    expect(leader.effectiveRankKey).toBe('tl')
    expect(leader.productCommission).toBe(8_000)
    expect(leader.overrideCommission).toBe(8_000)
    expect(leader.groupIncentive).toBe(0)
    expect(leader.groupSubsidyCap).toBe(0)
    expect(leader.promotesToTitleId).toBeNull()
  })

  it('warns when a member already holds a package rank whose component is off', () => {
    const result = run({
      scheme: { ...IR_SCHEME, enableGroupIncentive: false },
      hierarchy: [member('leader', null, 'stl'), member('direct', 'leader', 'rs')],
      orders: [sale('leader', 200_000), sale('direct', 800_000)],
    })

    expect(result.warnings.join(' ')).toMatch(/group incentives are switched off/)
    expect(statement(result, 'leader').groupIncentive).toBe(0)
    expect(statement(result, 'leader').groupSubsidyCap).toBe(0)
  })
})

describe('IR two-layer percentage overrides', () => {
  it('does not transfer a package recipient\'s foregone percentage to another upline', () => {
    const result = run({
      hierarchy: [member('boss', null, 'tl', 'fixed'), member('leader', 'boss', 'stl'), member('direct', 'leader', 'rs', 'fixed')],
      orders: [sale('boss', 100_000), sale('leader', 200_000), sale('direct', 800_000)],
    })

    expect(statement(result, 'leader').groupIncentive).toBe(6_000)
    expect(statement(result, 'leader').productCommission).toBe(0)
    expect(statement(result, 'leader').overrideCommission).toBe(0)
    expect(statement(result, 'boss').productCommission).toBe(4_000)
    expect(statement(result, 'boss').overrideCommission).toBe(0)
    expect(statement(result, 'direct').productCommission).toBe(24_000)
  })

  it('pays TL 4% above TA 3.5% above RS 3% as compressed differences on the RS sale', () => {
    const result = run({
      hierarchy: [member('tl', null, 'tl', 'fixed'), member('ta', 'tl', 'ta', 'fixed'), member('rs', 'ta', 'rs', 'fixed')],
      orders: [sale('rs', 10_000)],
    })

    expect(statement(result, 'rs').productCommission).toBe(300)
    expect(statement(result, 'ta').overrideCommission).toBe(50)
    expect(statement(result, 'tl').overrideCommission).toBe(50)
    expect(result.totalCommission).toBe(400)
  })

  it('counts actual reporting layers, including an equal-rate layer, and excludes the third ancestor', () => {
    const result = run({
      hierarchy: [member('tl', null, 'tl', 'fixed'), member('upper', 'tl', 'ta', 'fixed'), member('lower', 'upper', 'ta', 'fixed'), member('rs', 'lower', 'rs', 'fixed')],
      orders: [sale('tl', 100), sale('rs', 10_000)],
    })

    expect(statement(result, 'lower').overrideCommission).toBe(50)
    expect(statement(result, 'upper').overrideCommission).toBe(0)
    expect(statement(result, 'tl').overrideCommission).toBe(0)
    expect(statement(result, 'tl').groupRevenue).toBe(100)
  })
})

describe('Fair compatibility when IR options are absent', () => {
  it('retains whole-tree group sales and unlimited differential overrides', () => {
    const result = run({
      scheme: PERCENTAGE_SCHEME,
      ranks: [rank('rs', 0.05, 10), rank('ta', 0.07, 20), rank('tl', 0.09, 30), rank('stl', 0.10, 40)],
      hierarchy: [member('stl', null, 'stl', 'fixed'), member('tl', 'stl', 'tl', 'fixed'), member('ta', 'tl', 'ta', 'fixed'), member('rs', 'ta', 'rs', 'fixed')],
      orders: [sale('rs', 10_000)],
    })

    expect(statement(result, 'ta').overrideCommission).toBe(200)
    expect(statement(result, 'tl').overrideCommission).toBe(200)
    expect(statement(result, 'stl').overrideCommission).toBe(100)
    expect(statement(result, 'stl').groupRevenue).toBe(10_000)
    expect(result.totalCommission).toBe(1_000)
  })

  it('still climbs only one rung through Fair\'s earned personal-sales gate', () => {
    const result = run({
      scheme: PERCENTAGE_SCHEME,
      ranks: [
        rank('rs', 0.05, 10),
        rank('srs', 0.06, 20, { personalSalesThreshold: 100_000, consecutiveMonths: 2 }),
        rank('ta', 0.07, 30, { groupSalesThreshold: 300_000 }),
      ],
      hierarchy: [member('seller', null, 'rs')],
      orders: [sale('seller', 300_000)],
      priorMonths: [{ periodMonth: '2026-08-01', personalRevenue: { seller: 100_000 } }],
    })

    expect(statement(result, 'seller').effectiveRankKey).toBe('srs')
    expect(statement(result, 'seller').productCommission).toBe(18_000)
    expect(statement(result, 'seller').promotesToTitleId).toBe('srs')
  })
})
