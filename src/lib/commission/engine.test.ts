import { describe, it, expect } from 'vitest'
import {
  classifyLine,
  computeCommissionRun,
  costBasisOf,
  costDivisorFor,
  computeGroupRevenue,
  computeOverrides,
  depositRequired,
  indexItemGroups,
  indexKpiItems,
  isDepositMet,
  kpiThresholdPct,
  marginBase,
  marginIncentiveAcrossBrands,
  marginPctOf,
  monthsBefore,
  noSalesCost,
  orderProductRevenue,
  orderRevenueSplit,
  penaltyBandFor,
  resolveRank,
  type RankFigures,
} from './engine'
import type {
  CommissionScheme,
  DirectorTerms,
  EngineInput,
  HierarchyNode,
  ItemGroupRule,
  MarginBand,
  Rank,
  SalesOrder,
  Statement,
} from './types'

// ─── Fixtures — the Fair sub-department ─────────────────────────────────────

/**
 * ERP item groups seen in the July SO export. User decision 2026-08-31:
 * TRANS (transport charges) and OTHER (disposal, misc) are NOT commissionable;
 * accessories ARE.
 */
const ITEM_GROUPS: ItemGroupRule[] = [
  { group: 'MATTRESS', commissionable: true },
  { group: 'SOFA', commissionable: true },
  { group: 'BEDFRAME', commissionable: true },
  { group: 'DINING', commissionable: true },
  { group: 'ACC', commissionable: true },
  { group: 'TRANS', commissionable: false },
  { group: 'OTHER', commissionable: false },
]

/**
 * The corrected ladder (user, 2026-08-31): Revenue Specialist is 5% → 6% ONLY;
 * 7% is where Team Assistant starts. 300k of GROUP sales is what promotes a 6%
 * Specialist to Team Assistant.
 */
// Titles 1:1 with the rungs, as the live ladder is since 2026-09-03.
const T_RS = 'title-rs'
const T_SRS = 'title-srs'
const T_TA = 'title-ta'
const T_STA = 'title-sta'
const T_TL = 'title-tl'
const T_STL = 'title-stl'

const RANKS: Rank[] = [
  { rankKey: 'rs_5', titleId: T_RS, titleLabel: 'Revenue Specialist', label: 'Revenue Specialist · 5%', productRate: 0.05, canRecruit: false, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 10 },
  { rankKey: 'rs_6', titleId: T_SRS, titleLabel: 'Senior Revenue Specialist', label: 'Revenue Specialist · 6%', productRate: 0.06, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: 100_000, consecutiveMonths: 2, sortOrder: 20 },
  { rankKey: 'ta_7', titleId: T_TA, titleLabel: 'Team Assistant', label: 'Team Assistant · 7%', productRate: 0.07, canRecruit: true, groupSalesThreshold: 300_000, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 30 },
  { rankKey: 'ta_8', titleId: T_STA, titleLabel: 'Senior Team Assistant', label: 'Team Assistant · 8%', productRate: 0.08, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 40 },
  { rankKey: 'tl_9', titleId: T_TL, titleLabel: 'Team Leader', label: 'Team Leader · 9%', productRate: 0.09, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 50 },
  { rankKey: 'stl_10', titleId: T_STL, titleLabel: 'Senior Team Leader', label: 'Senior Team Leader · 10%', productRate: 0.10, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 60 },
]

/**
 * The brand ladder from the user's worked example (2026-08-31). Thresholds are
 * per brand: Akemi's incentive Tier 1 is 36% where Zanotti's is 33%.
 */
const AKEMI_BANDS: MarginBand[] = [
  { brandCode: 'AKEMI', bandKey: 'incentive_tier_2', label: 'Incentive Tier 2', kind: 'incentive', marginPct: 0.43, commissionMultiplier: 1, monthlyIncentive: 1_500 },
  { brandCode: 'AKEMI', bandKey: 'incentive_tier_1', label: 'Incentive Tier 1', kind: 'incentive', marginPct: 0.36, commissionMultiplier: 1, monthlyIncentive: 1_000 },
  { brandCode: 'AKEMI', bandKey: 'standard', label: 'Standard margin', kind: 'reference', marginPct: 0.33, commissionMultiplier: 1, monthlyIncentive: 0 },
  { brandCode: 'AKEMI', bandKey: 'low', label: 'Low margin', kind: 'reference', marginPct: 0.30, commissionMultiplier: 1, monthlyIncentive: 0 },
  { brandCode: 'AKEMI', bandKey: 'below_tier_1', label: 'Below margin Tier 1', kind: 'penalty', marginPct: 0.27, commissionMultiplier: 0.5, monthlyIncentive: 0 },
  { brandCode: 'AKEMI', bandKey: 'below_tier_2', label: 'Below margin Tier 2', kind: 'penalty', marginPct: 0.25, commissionMultiplier: 0.25, monthlyIncentive: 0 },
  { brandCode: 'AKEMI', bandKey: 'below_tier_3', label: 'Below margin Tier 3', kind: 'penalty', marginPct: 0.24, commissionMultiplier: 0, monthlyIncentive: 0 },
]

/** Zanotti clears at a lower bar — the reason bands are per brand. */
const ZANOTTI_BANDS: MarginBand[] = [
  { brandCode: 'ZANOTTI', bandKey: 'incentive_tier_2', label: 'Incentive Tier 2', kind: 'incentive', marginPct: 0.40, commissionMultiplier: 1, monthlyIncentive: 1_500 },
  { brandCode: 'ZANOTTI', bandKey: 'incentive_tier_1', label: 'Incentive Tier 1', kind: 'incentive', marginPct: 0.33, commissionMultiplier: 1, monthlyIncentive: 1_000 },
  { brandCode: 'ZANOTTI', bandKey: 'below_tier_1', label: 'Below margin Tier 1', kind: 'penalty', marginPct: 0.20, commissionMultiplier: 0.5, monthlyIncentive: 0 },
]

const MARGIN_BANDS = [...AKEMI_BANDS, ...ZANOTTI_BANDS]

const SCHEME: CommissionScheme = {
  overrideIncludesKpi: false,
  enableProductRevenue: true,
  enableKpi: true,
  enableOverride: true,
  enableMarginPenalty: true,
  enableMarginIncentive: true,
  itemGroups: ITEM_GROUPS,
  depositThresholdPct: 0.5,
  defaultRateMode: 'variable',
}

const KPI_ITEMS = [{ productCode: 'AK-CS AIRLOFT COMFY PIL', kpiAmount: 50 }]
const KPI_THRESHOLDS = [{ minQty: 10, bonusPct: 0.2 }]
function node(
  staffId: string,
  uplineStaffId: string | null,
  baseRankKey: string,
  rateMode: 'fixed' | 'variable' = 'fixed',
  titleId: string | null = null,
): HierarchyNode {
  return { staffId, uplineStaffId, baseRankKey, rateMode, titleId }
}

/** STL 10% → TL 9% → TA 7% → RS 5%, all on fixed rates. */
const CHAIN: HierarchyNode[] = [
  node('stl', null, 'stl_10'),
  node('tl', 'stl', 'tl_9'),
  node('ta', 'tl', 'ta_7'),
  node('rs', 'ta', 'rs_5'),
]

interface OrderOpts {
  date?: string
  paidAmount?: number
  orderTotal?: number
  alreadyReleased?: boolean
  periodMonth?: string
  manualMarginPct?: number
  /** The brand the bill was written under (the ERP's Branding). */
  brandCode?: string
}

function order(
  id: string,
  staffId: string,
  lines: Array<[group: string, code: string, qty: number, amount: number, cost?: number, brand?: string]>,
  opts: OrderOpts = {},
): SalesOrder {
  const date = opts.date ?? '2026-07-06'
  const total = opts.orderTotal ?? lines.reduce((a, l) => a + l[3], 0)
  return {
    id,
    orderNo: `SO-${id}`,
    staffId,
    orderDate: date,
    periodMonth: opts.periodMonth ?? `${date.slice(0, 7)}-01`,
    eventDate: date,
    orderTotal: total,
    // Default to fully paid so a test only opts into the deposit gate.
    paidAmount: opts.paidAmount ?? total,
    alreadyReleased: opts.alreadyReleased,
    manualMarginPct: opts.manualMarginPct,
    brandCode: opts.brandCode,
    lines: lines.map(([itemGroup, productCode, qty, lineAmount, costAmount, brandCode], i) => ({
      id: `${id}-L${i + 1}`,
      itemGroup,
      productCode,
      qty,
      lineAmount,
      costAmount,
      brandCode: brandCode ?? (costAmount === undefined ? undefined : 'AKEMI'),
    })),
  }
}

function run(partial: Partial<EngineInput>) {
  return computeCommissionRun({
    periodMonth: '2026-07-01',
    scheme: SCHEME,
    ranks: RANKS,
    orders: [],
    kpiItems: KPI_ITEMS,
    kpiThresholds: KPI_THRESHOLDS,
    marginBands: MARGIN_BANDS,
    hierarchy: CHAIN,
    priorMonths: [],
    ...partial,
  })
}

function find(statements: Statement[], staffId: string): Statement {
  const s = statements.find(x => x.staffId === staffId)
  if (!s) throw new Error(`no statement for ${staffId}`)
  return s
}

// ─── Item group policy ──────────────────────────────────────────────────────

describe('item group policy', () => {
  const kpiIndex = indexKpiItems(KPI_ITEMS)
  const groupIndex = indexItemGroups(ITEM_GROUPS)

  it('drops transport charges and disposal from the commission base', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'AK-BASTION MATT (K)', 1, 7083],
      ['TRANS', 'TRANSPORTATION CHARGES', 1, 1205],
      ['OTHER', 'DISPOSE', 1, 200],
    ])
    expect(orderProductRevenue(o, kpiIndex, groupIndex)).toBe(7083)
  })

  it('keeps accessories that are not configured KPI items', () => {
    const o = order('1', 'rs', [['ACC', 'AK- ESSENTIAL BOLSTER', 1, 58]])
    expect(orderProductRevenue(o, kpiIndex, groupIndex)).toBe(58)
  })

  it('classifies an unknown group as non-commissionable and warns', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M1', 1, 10_000],
        ['CARPET', 'C1', 1, 900],
      ])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productRevenue).toBe(10_000)
    expect(rs.excludedRevenue).toBe(900)
    expect(r.warnings.join(' ')).toMatch(/Item group "CARPET" is not classified/)
  })

  it('reports excluded revenue separately so the drop is visible', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M1', 1, 7083],
        ['TRANS', 'TRANSPORTATION CHARGES', 1, 1205],
      ])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productRevenue).toBe(7083)
    expect(rs.excludedRevenue).toBe(1205)
    expect(rs.productCommission).toBe(354.15) // 7,083 x 5%
  })
})

// ─── Deposit gate ───────────────────────────────────────────────────────────

describe('deposit gate', () => {
  it('computes the required deposit off the ORDER total, not the commissionable part', () => {
    // 10,000 of goods + 500 transport: the customer owes 10,500, so half is
    // 5,250 even though only 10,000 earns commission.
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000],
      ['TRANS', 'T', 1, 500],
    ], { paidAmount: 5_000 })
    expect(depositRequired(o.orderTotal, 0.5)).toBe(5_250)
    expect(isDepositMet(o, 0.5)).toBe(false)
  })

  it("matches the brief's example: 10,000 order needs 5,000 in", () => {
    const under = order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]], { paidAmount: 4_999 })
    const exact = order('2', 'rs', [['MATTRESS', 'M1', 1, 10_000]], { paidAmount: 5_000 })
    expect(isDepositMet(under, 0.5)).toBe(false)
    expect(isDepositMet(exact, 0.5)).toBe(true)
  })

  it('pays nothing at all on an under-deposited order', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M1', 1, 10_000],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0],
      ], { paidAmount: 2_000 })],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productRevenue).toBe(0)
    // The four pillows' RM 200 is KPI, not sales — what waits is 9,800.
    expect(rs.deferredRevenue).toBe(9_800)
    expect(rs.kpiCommission).toBe(0) // the free pillows wait too
    expect(rs.totalCommission).toBe(0)
  })

  it('reports the shortfall so collections can chase it', () => {
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]], { paidAmount: 2_000 })],
    })
    expect(r.deferred).toEqual([{
      staffId: 'rs',
      orderId: '1',
      orderNo: 'SO-1',
      orderDate: '2026-07-06',
      orderTotal: 10_000,
      paidAmount: 2_000,
      requiredAmount: 5_000,
      productRevenue: 10_000,
    }])
  })

  it('pays a July order inside the August run once the deposit clears', () => {
    const r = run({
      periodMonth: '2026-08-01',
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]], {
        date: '2026-07-20', paidAmount: 6_000,
      })],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(500)
    expect(rs.lines[0].note).toMatch(/carried from 2026-07/)
  })

  it('never pays an order a previous run already released', () => {
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]], { alreadyReleased: true })],
    })
    expect(r.statements.find(s => s.staffId === 'rs' && s.totalCommission > 0)).toBeUndefined()
  })

  it('disables the gate when no threshold is configured', () => {
    const r = run({
      scheme: { ...SCHEME, depositThresholdPct: null },
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]], { paidAmount: 0 })],
    })
    expect(find(r.statements, 'rs').productCommission).toBe(500)
    expect(r.deferred).toEqual([])
  })
})

// ─── Group revenue + rate resolution ────────────────────────────────────────

describe('group revenue', () => {
  it("matches the brief: 200k own + 100k + 100k downline = 400k group", () => {
    const nodes = new Map([
      ['boss', node('boss', null, 'rs_6')],
      ['a', node('a', 'boss', 'rs_5')],
      ['b', node('b', 'boss', 'rs_5')],
    ])
    const own = new Map([['boss', 200_000], ['a', 100_000], ['b', 100_000]])
    const group = computeGroupRevenue(nodes, own, [])
    expect(group.get('boss')).toBe(400_000)
    expect(group.get('a')).toBe(100_000)
  })

  it('rolls a grandchild all the way to the top', () => {
    const nodes = new Map([
      ['top', node('top', null, 'tl_9')],
      ['mid', node('mid', 'top', 'ta_7')],
      ['low', node('low', 'mid', 'rs_5')],
    ])
    const group = computeGroupRevenue(nodes, new Map([['low', 50_000]]), [])
    expect(group.get('low')).toBe(50_000)
    expect(group.get('mid')).toBe(50_000)
    expect(group.get('top')).toBe(50_000)
  })

  it('stops at a cycle rather than looping forever', () => {
    const nodes = new Map([
      ['a', node('a', 'b', 'rs_6')],
      ['b', node('b', 'a', 'rs_5')],
    ])
    const warnings: string[] = []
    const group = computeGroupRevenue(nodes, new Map([['a', 10_000]]), warnings)
    expect(group.get('b')).toBe(10_000)
    expect(warnings.join(' ')).toMatch(/cycle/i)
  })
})

/** This month's figures for one person; group defaults to personal (no downline). */
function fig(over: Partial<RankFigures> & { personalRevenue?: number; groupRevenue?: number } = {}): RankFigures {
  const personal = over.personalRevenue ?? over.groupRevenue ?? 0
  return {
    periodMonth: '2026-07-01',
    personalRevenue: personal,
    groupRevenue: over.groupRevenue ?? personal,
    priorMonths: over.priorMonths ?? [],
  }
}

describe('resolveRank — fixed vs variable', () => {
  it('variable climbs to Team Assistant when group sales clear 300k', () => {
    const r = resolveRank(node('x', null, 'rs_6', 'variable'), RANKS, fig({ groupRevenue: 400_000 }))
    expect(r.effective?.rankKey).toBe('ta_7')
    expect(r.qualifiesFor?.rankKey).toBe('ta_7')
  })

  it('variable drops back to the base rank in a month that misses the target', () => {
    const r = resolveRank(node('x', null, 'rs_6', 'variable'), RANKS, fig({ groupRevenue: 250_000 }))
    expect(r.effective?.rankKey).toBe('rs_6')
    expect(r.qualifiesFor).toBeUndefined()
  })

  it('fixed keeps the attained rank but still reports the qualification', () => {
    const r = resolveRank(node('x', null, 'rs_6', 'fixed'), RANKS, fig({ groupRevenue: 400_000 }))
    expect(r.effective?.rankKey).toBe('rs_6')
    expect(r.qualifiesFor?.rankKey).toBe('ta_7')
  })

  it('fixed keeps 7% in a month below target — the point of fixed', () => {
    const r = resolveRank(node('x', null, 'ta_7', 'fixed'), RANKS, fig({ groupRevenue: 10_000 }))
    expect(r.effective?.rankKey).toBe('ta_7')
    expect(r.effective?.productRate).toBe(0.07)
  })

  it('never drops a variable person below their attained rank', () => {
    const r = resolveRank(node('x', null, 'ta_7', 'variable'), RANKS, fig({ groupRevenue: 0 }))
    expect(r.effective?.rankKey).toBe('ta_7')
  })

  it('the ladder has no 7% Revenue Specialist', () => {
    expect(RANKS.filter(r => r.titleLabel.endsWith('Revenue Specialist')).map(r => r.productRate))
      .toEqual([0.05, 0.06])
  })
})

// ─── One rung at a time (user 2026-09-03, spec Q11) ─────────────────────────
//
//   "如果他只是单月达到 300k 的话，还是一样不能够跳过限制，他需要连续两个月达到那个
//    criteria 才能变成 Senior Revenue Specialist，而不是直接升到 Team Assistant。"

describe('the ladder is climbed one rung at a time', () => {
  const june = { periodMonth: '2026-06-01', personalRevenue: { x: 150_000, y: 90_000 } }

  it('monthsBefore walks back across a year end', () => {
    expect(monthsBefore('2026-07-01', 1)).toBe('2026-06-01')
    expect(monthsBefore('2026-01-01', 1)).toBe('2025-12-01')
    expect(monthsBefore('2026-01-01', 2)).toBe('2025-11-01')
  })

  it('a 5% Specialist who sells 300k alone in one month is still a Specialist', () => {
    // 300k clears the Team Assistant gate — but that gate is two rungs up.
    const r = resolveRank(node('x', null, 'rs_5', 'variable', T_RS), RANKS, fig({ personalRevenue: 300_000 }))
    expect(r.effective?.rankKey).toBe('rs_5')
    expect(r.qualifiesFor).toBeUndefined()
  })

  it('two months in a row of 100k make them Senior — paid 6% in the second month', () => {
    const r = resolveRank(
      node('x', null, 'rs_5', 'variable', T_RS),
      RANKS,
      fig({ personalRevenue: 120_000, priorMonths: [june] }),
    )
    expect(r.effective?.rankKey).toBe('rs_6')
    expect(r.qualifiesFor?.rankKey).toBe('rs_6')
  })

  it('a streak needs every month: 90k last month breaks it', () => {
    const r = resolveRank(node('y', null, 'rs_5', 'variable', T_RS), RANKS, fig({ personalRevenue: 200_000, priorMonths: [june] }))
    expect(r.effective?.rankKey).toBe('rs_5')
  })

  it('a month that was never run is unknown, not zero — no streak across it', () => {
    const r = resolveRank(node('x', null, 'rs_5', 'variable', T_RS), RANKS, fig({ personalRevenue: 200_000 }))
    expect(r.effective?.rankKey).toBe('rs_5')

    // A run two months back does not stand in for last month.
    const may = { periodMonth: '2026-05-01', personalRevenue: { x: 150_000 } }
    const r2 = resolveRank(node('x', null, 'rs_5', 'variable', T_RS), RANKS, fig({ personalRevenue: 200_000, priorMonths: [may] }))
    expect(r2.effective?.rankKey).toBe('rs_5')
  })

  it('the streak is not a rolling window once earned: a Senior below 100k stays Senior', () => {
    // Title already raised to Senior Revenue Specialist; placed rank still 5%.
    const r = resolveRank(node('x', null, 'rs_5', 'variable', T_SRS), RANKS, fig({ personalRevenue: 40_000 }))
    expect(r.base?.rankKey).toBe('rs_6') // the earned floor
    expect(r.effective?.rankKey).toBe('rs_6')
  })

  it('and only then does the 300k gate apply to them', () => {
    const r = resolveRank(node('x', null, 'rs_5', 'variable', T_SRS), RANKS, fig({ groupRevenue: 320_000 }))
    expect(r.effective?.rankKey).toBe('ta_7')
  })

  it("a Team Assistant's earned rung is still 6%: 7% was a monthly target", () => {
    const r = resolveRank(node('x', null, 'rs_6', 'variable', T_TA), RANKS, fig({ groupRevenue: 200_000 }))
    expect(r.base?.rankKey).toBe('rs_6')
    expect(r.effective?.rankKey).toBe('rs_6')
  })

  it('a hand-set floor above the earned rung wins', () => {
    const r = resolveRank(node('x', null, 'tl_9', 'variable', T_SRS), RANKS, fig({ groupRevenue: 0 }))
    expect(r.effective?.rankKey).toBe('tl_9')
  })

  it('fixed mode is what the human set, whatever the title says', () => {
    const r = resolveRank(node('x', null, 'rs_5', 'fixed', T_SRS), RANKS, fig({ personalRevenue: 500_000 }))
    expect(r.effective?.rankKey).toBe('rs_5')
  })

  it('a rung with no gate cannot be climbed to by volume', () => {
    // ta_8 carries neither gate: 900k of group sales leaves a Team Assistant at 7%.
    const r = resolveRank(node('x', null, 'ta_7', 'variable', T_TA), RANKS, fig({ groupRevenue: 900_000 }))
    expect(r.effective?.rankKey).toBe('ta_7')
    expect(r.qualifiesFor).toBeUndefined()
  })

  it('end to end: the second streak month pays 6% and previews Senior Revenue Specialist', () => {
    const r = run({
      hierarchy: [node('x', null, 'rs_5', 'variable', T_RS)],
      orders: [order('1', 'x', [['MATTRESS', 'M', 1, 120_000]])],
      priorMonths: [june],
    })
    const x = find(r.statements, 'x')
    expect(x.baseRankKey).toBe('rs_5')
    expect(x.effectiveRankKey).toBe('rs_6')
    expect(x.productCommission).toBe(7_200) // 120k × 6%
    expect(x.promotesToTitleId).toBe(T_SRS)
  })

  it('end to end: the statement records the earned floor, not the placed rank', () => {
    const r = run({
      hierarchy: [node('x', null, 'rs_5', 'variable', T_SRS)],
      orders: [order('1', 'x', [['MATTRESS', 'M', 1, 50_000]])],
    })
    expect(find(r.statements, 'x').baseRankKey).toBe('rs_6')
  })
})

// ─── The title ratchet (user 2026-09-02) ────────────────────────────────────
//
//   "如果他曾经 hit 到哪一个 tier level，就 hit 到相应的那个 grade … 7 月没 hit 到
//    target，他的 percentage 就跌回去他之前的 percent，但是 title 还是一样
//    Team Assistant。Title 只会上，不会下。"

describe('title ratchet — previewed on the statement', () => {
  const orders = [
    order('1', 'boss', [['MATTRESS', 'M', 1, 200_000]]),
    order('2', 'a', [['MATTRESS', 'M', 1, 100_000]]),
    order('3', 'b', [['MATTRESS', 'M', 1, 100_000]]),
  ]

  it('June: a Senior Revenue Specialist who clears 300k is paid at 7% and due Team Assistant', () => {
    const team = [
      node('boss', null, 'rs_6', 'variable', T_SRS),
      node('a', 'boss', 'rs_5', 'fixed', T_RS),
      node('b', 'boss', 'rs_5', 'fixed', T_RS),
    ]
    const boss = find(run({ hierarchy: team, orders }).statements, 'boss')
    expect(boss.effectiveRankKey).toBe('ta_7')
    expect(boss.rankTitleId).toBe(T_TA)
    expect(boss.promotesToTitleId).toBe(T_TA)
  })

  it('July: the same person misses the target — rate drops to 6%, the title does NOT drop', () => {
    // Title already ratcheted to Team Assistant; floor rank still rs_6.
    const team = [
      node('boss', null, 'rs_6', 'variable', T_TA),
      node('a', 'boss', 'rs_5', 'fixed', T_RS),
    ]
    const lean = [
      order('1', 'boss', [['MATTRESS', 'M', 1, 100_000]]),
      order('2', 'a', [['MATTRESS', 'M', 1, 50_000]]),
    ]
    const boss = find(run({ hierarchy: team, orders: lean }).statements, 'boss')
    expect(boss.effectiveRankKey).toBe('rs_6')
    expect(boss.productRate).toBe(0.06)
    expect(boss.rankTitleId).toBe(T_SRS) // what the month paid
    expect(boss.promotesToTitleId).toBeNull() // nothing to raise — and nothing lowered
  })

  it('a fixed-rank person is never previewed for a title they were not paid', () => {
    const team = [
      node('boss', null, 'rs_6', 'fixed', T_SRS),
      node('a', 'boss', 'rs_5', 'fixed', T_RS),
      node('b', 'boss', 'rs_5', 'fixed', T_RS),
    ]
    const boss = find(run({ hierarchy: team, orders }).statements, 'boss')
    expect(boss.effectiveRankKey).toBe('rs_6')
    expect(boss.qualifiesForRankKey).toBe('ta_7') // the prompt still shows
    expect(boss.promotesToTitleId).toBeNull() // but the ratchet waits for the rank
  })

  it('somebody with no title yet is previewed for the title of the rank they are paid', () => {
    const solo = [node('s', null, 'rs_5', 'fixed', null)]
    const s = find(run({ hierarchy: solo, orders: [order('1', 's', [['MATTRESS', 'M', 1, 10_000]])] }).statements, 's')
    expect(s.promotesToTitleId).toBe(T_RS)
  })

  it('a manual placement above the held title is previewed too', () => {
    // HR moved them to the 9% floor but their title still says Team Assistant.
    const solo = [node('s', null, 'tl_9', 'fixed', T_TA)]
    const s = find(run({ hierarchy: solo, orders: [order('1', 's', [['MATTRESS', 'M', 1, 10_000]])] }).statements, 's')
    expect(s.promotesToTitleId).toBe(T_TL)
  })
})

describe('can recruit — the title decides, not the month\'s rank', () => {
  it('accepts IR Specialist peers without inventing an override between equal 3% rates', () => {
    const specialist: Rank = { ...RANKS[0], rankKey: 'rs_3', label: 'Rank C', productRate: 0.03, canRecruit: true }
    const result = run({
      scheme: { ...SCHEME, enableKpi: false,
        enableMarginPenalty: false, enableMarginIncentive: false, overrideDepth: 2 },
      ranks: [specialist],
      hierarchy: [node('boss', null, 'rs_3', 'fixed', T_RS), node('peer', 'boss', 'rs_3', 'fixed', T_RS)],
      orders: [order('ir-peer', 'peer', [['MATTRESS', 'M', 1, 10_000, 6_000]])],
    })
    expect(result.warnings).toEqual([])
    expect(find(result.statements, 'peer').productCommission).toBe(300)
    expect(find(result.statements, 'boss').overrideCommission).toBe(0)
    expect(result.totalCommission).toBe(300)
  })

  it('a Team Assistant in a month below target keeps their downline without a warning', () => {
    // Placed at 5% long ago; the title says Team Assistant, so the earned
    // floor is 6% and the placed rank no longer matters for recruiting either.
    const team: HierarchyNode[] = [
      node('boss', null, 'rs_5', 'variable', T_TA),
      node('a', 'boss', 'rs_5', 'fixed', T_RS),
    ]
    const r = run({ hierarchy: team, orders: [order('1', 'a', [['MATTRESS', 'M', 1, 10_000, 6_000]])] })
    expect(r.warnings.join(' ')).not.toMatch(/not allowed to recruit/)
    // …and the override flows to them at the earned 6%: a 1% differential.
    expect(find(r.statements, 'boss').effectiveRankKey).toBe('rs_6')
    expect(find(r.statements, 'boss').overrideCommission).toBe(100)
  })

  it('a placed-at-5% person with no title and a 5% downline is still flagged', () => {
    const team: HierarchyNode[] = [node('boss', null, 'rs_5', 'variable', null), node('a', 'boss', 'rs_5')]
    const r = run({ hierarchy: team, orders: [] })
    expect(r.warnings.join(' ')).toMatch(/not allowed to recruit/)
  })

  it('a 6% floor under a 5% TITLE still may not hold downlines', () => {
    const team: HierarchyNode[] = [
      node('boss', null, 'rs_6', 'fixed', T_RS),
      node('a', 'boss', 'rs_5', 'fixed', T_RS),
    ]
    const r = run({ hierarchy: team, orders: [] })
    expect(r.warnings.join(' ')).toMatch(/whose title \(Revenue Specialist\) is not allowed to recruit/)
  })

  it('falls back to the rank when the upline has no title yet', () => {
    const team: HierarchyNode[] = [node('boss', null, 'rs_5', 'fixed', null), node('a', 'boss', 'rs_5')]
    const r = run({ hierarchy: team, orders: [] })
    expect(r.warnings.join(' ')).toMatch(/whose rank \(Revenue Specialist · 5%\) is not allowed to recruit/)
  })
})

describe('rate mode end to end', () => {
  const team: HierarchyNode[] = [
    node('boss', null, 'rs_6', 'variable'),
    node('a', 'boss', 'rs_5'),
    node('b', 'boss', 'rs_5'),
  ]
  const orders = [
    order('1', 'boss', [['MATTRESS', 'M', 1, 200_000]]),
    order('2', 'a', [['MATTRESS', 'M', 1, 100_000]]),
    order('3', 'b', [['MATTRESS', 'M', 1, 100_000]]),
  ]

  it('a variable leader on 400k group sales is paid at 7%', () => {
    const r = run({ hierarchy: team, orders })
    const boss = find(r.statements, 'boss')
    expect(boss.groupRevenue).toBe(400_000)
    expect(boss.effectiveRankKey).toBe('ta_7')
    expect(boss.productRate).toBe(0.07)
    expect(boss.productCommission).toBe(14_000) // 200k x 7%
    expect(boss.overrideCommission).toBe(4_000) // (7-5)% x 200k of downline
    expect(r.totalCommission).toBe(28_000) // every ringgit capped at 7%
  })

  it('the same team on a fixed leader pays 6%', () => {
    const fixed = team.map(n => (n.staffId === 'boss' ? node('boss', null, 'rs_6', 'fixed') : n))
    const r = run({ hierarchy: fixed, orders })
    const boss = find(r.statements, 'boss')
    expect(boss.effectiveRankKey).toBe('rs_6')
    expect(boss.productCommission).toBe(12_000) // 200k x 6%
    expect(boss.overrideCommission).toBe(2_000) // (6-5)% x 200k
    expect(boss.qualifiesForRankKey).toBe('ta_7') // prompt to promote them
    expect(r.totalCommission).toBe(24_000)
  })

  it('a variable leader below target reverts to 6% the next month', () => {
    const lean = [
      order('1', 'boss', [['MATTRESS', 'M', 1, 100_000]]),
      order('2', 'a', [['MATTRESS', 'M', 1, 50_000]]),
    ]
    const r = run({ hierarchy: team, orders: lean })
    const boss = find(r.statements, 'boss')
    expect(boss.groupRevenue).toBe(150_000)
    expect(boss.effectiveRankKey).toBe('rs_6')
    expect(boss.productRate).toBe(0.06)
  })

  it('group sales count only revenue that passed the deposit gate', () => {
    const gated = [
      order('1', 'boss', [['MATTRESS', 'M', 1, 200_000]]),
      order('2', 'a', [['MATTRESS', 'M', 1, 100_000]]),
      order('3', 'b', [['MATTRESS', 'M', 1, 100_000]], { paidAmount: 1_000 }),
    ]
    const r = run({ hierarchy: team, orders: gated })
    const boss = find(r.statements, 'boss')
    expect(boss.groupRevenue).toBe(300_000)
    expect(boss.effectiveRankKey).toBe('ta_7') // exactly on the threshold
    expect(find(r.statements, 'b').deferredRevenue).toBe(100_000)
  })
})

// ─── KPI ────────────────────────────────────────────────────────────────────

describe('KPI items', () => {
  const kpiIndex = indexKpiItems(KPI_ITEMS)
  const groupIndex = indexItemGroups(ITEM_GROUPS)

  // 2026-09-27: the ITEM's amount comes off the bill, not its line's — the
  // ERP prices packages, so a line rarely says what the item was worth.
  it("takes the item's own amount off the bill's sales, not its line's", () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'AK-GUARDIAN MATT (Q)', 1, 2800],
      ['ACC', 'AK-CS AIRLOFT COMFY PIL', 1, 250],
    ])
    expect(orderProductRevenue(o, kpiIndex, groupIndex)).toBe(3_000) // 3,050 − 1 × 50
    expect(classifyLine(o.lines[1], groupIndex)).toBe('commissionable')
  })

  it('pays free bundled KPI items — the usual case in the ERP export', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'AK-GUARDIAN MATT (K)', 1, 6400],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0],
      ])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productRevenue).toBe(6_200) // 6,400 less the four pillows' 200
    expect(rs.kpiQty).toBe(4)
    expect(rs.kpiCommission).toBe(200)
  })

  it("matches the brief's worked example: 10 x 50 then +20%", () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M', 1, 5_000],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 10, 0],
      ])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.kpiBase).toBe(500)
    expect(rs.kpiThresholdPct).toBe(0.2)
    expect(rs.kpiCommission).toBe(600)
  })

  it('does not uplift below the rung', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M', 1, 5_000],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 9, 0],
      ])],
    })
    expect(find(r.statements, 'rs').kpiCommission).toBe(450)
  })

  it('picks the highest rung met, unsorted input included', () => {
    const ladder = [{ minQty: 25, bonusPct: 0.35 }, { minQty: 10, bonusPct: 0.2 }]
    expect(kpiThresholdPct(9, ladder)).toBe(0)
    expect(kpiThresholdPct(12, ladder)).toBe(0.2)
    expect(kpiThresholdPct(30, ladder)).toBe(0.35)
  })

  it('matches product codes case-insensitively and trimmed', () => {
    const o = order('1', 'rs', [['ACC', '  ak-cs airloft comfy pil ', 2, 500]])
    expect(orderProductRevenue(o, kpiIndex, groupIndex)).toBe(400) // 500 − 2 × 50
  })
})

// ─── KPI items a bill carries (Rules › KPI items) ────────────────────────────

describe('KPI items a bill carries — the flat allowance, 2026-09-27', () => {
  const HB_STRAIGHT = { source: 'option' as const, optionPool: 'bedframe_specials' as const, optionValue: 'HB Straight', kpiAmount: 200 }
  const bill = (lines: SalesOrder['lines'], opts: OrderOpts = {}) => {
    const o = order('1', 'ta', [], opts)
    const total = lines.reduce((a, l) => a + l.lineAmount, 0)
    return { ...o, orderTotal: opts.orderTotal ?? total, paidAmount: opts.paidAmount ?? total, lines }
  }
  const mattress = (amount: number, cost: number) =>
    ({ id: 'm', itemGroup: 'MATTRESS', productCode: 'AK-GUARDIAN MATT (K)', qty: 1, lineAmount: amount, costAmount: cost, brandCode: 'AKEMI' })
  const bedframe = (specials: string[], qty = 1) =>
    ({ id: `b${qty}`, itemGroup: 'BEDFRAME', productCode: 'TRION (A)-(K)', qty, lineAmount: 0, costAmount: 0, specials })

  // The user's own figures: RM 10,000 with HB Straight at RM 200, rate 7%.
  it('pays 9,800 × 7% and RM 200 flat, judging the margin on 9,800', () => {
    const r = run({ orders: [bill([mattress(10_000, 6_500), bedframe(['HB Straight'])])], kpiItems: [HB_STRAIGHT] })
    const ta = find(r.statements, 'ta')
    expect(ta.productRevenue).toBe(9_800)
    expect(ta.productCommission).toBe(686)
    expect(ta.kpiQty).toBe(1)
    expect(ta.kpiCommission).toBe(200)
    expect(ta.marginPct).toBeCloseTo(3_300 / 9_800, 10) // 33.7%
    expect(ta.lines.find(l => l.component === 'kpi_item')).toMatchObject({
      sourceLineId: 'b1', basisAmount: 200, qty: 1, amount: 200, rate: null,
    })
  })

  it('takes nothing off while the scheme has KPI switched off', () => {
    const r = run({
      orders: [bill([mattress(10_000, 6_500), bedframe(['HB Straight'])])],
      kpiItems: [HB_STRAIGHT],
      scheme: { ...SCHEME, enableKpi: false },
    })
    const ta = find(r.statements, 'ta')
    expect(ta.productRevenue).toBe(10_000)
    expect(ta.kpiCommission).toBe(0)
  })

  // Not a warning: every warning blocks Apply, and an exchange is no error.
  it('pays a bill whose sales cannot cover its KPI items as sales, with no KPI', () => {
    const r = run({ orders: [bill([mattress(100, 50), bedframe(['HB Straight'])])], kpiItems: [HB_STRAIGHT] })
    const ta = find(r.statements, 'ta')
    expect(ta.productRevenue).toBe(100)
    expect(ta.kpiQty).toBe(0)
    expect(ta.kpiCommission).toBe(0)
    expect(r.warnings).toEqual([])
  })

  it('counts two bed frames as two add-ons toward the quantity ladder', () => {
    const r = run({ orders: [bill([mattress(10_000, 6_500), bedframe(['HB Straight'], 2)])], kpiItems: [HB_STRAIGHT] })
    expect(find(r.statements, 'ta').kpiQty).toBe(2)
    expect(find(r.statements, 'ta').productRevenue).toBe(9_600)
  })

  it("adds the KPI part to the upline's override base only when the scheme says so", () => {
    const orders = [bill([mattress(10_000, 6_500), bedframe(['HB Straight'])])]
    const without = run({ orders, kpiItems: [HB_STRAIGHT] })
    const withKpi = run({ orders, kpiItems: [HB_STRAIGHT], scheme: { ...SCHEME, overrideIncludesKpi: true } })
    // TL 9% over TA 7%: 2% of 9,800 — or of 10,000 with the KPI part counted.
    expect(find(without.statements, 'tl').overrideCommission).toBe(196)
    expect(find(withKpi.statements, 'tl').overrideCommission).toBe(200)
  })
})

// ─── Cost ratios per SKU (Product List › Costing Setting) ───────────────────

describe('a SKU judged at its own cost ratio — 2026-09-27', () => {
  const groupIndex = indexItemGroups(ITEM_GROUPS)

  it("divides that SKU's cost by its own ratio and the rest by the default", () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'SPECIAL-SKU', 1, 10_000, 6_000],
      ['MATTRESS', 'M1', 1, 10_000, 7_000],
    ])
    const basis = costBasisOf(0.7, [{ productCode: ' special-sku ', ratio: 0.6 }])
    const base = marginBase(o.lines, indexKpiItems([]), groupIndex, basis)
    expect(base.cost).toBe(20_000) // 6,000 ÷ 0.6 + 7,000 ÷ 0.7
  })

  it('falls back to the default for a ratio that is unusable', () => {
    const basis = costBasisOf(0.7, [{ productCode: 'M1', ratio: 0 }])
    expect(costDivisorFor('M1', basis)).toBe(0.7)
    expect(costDivisorFor('M1', costBasisOf(0, []))).toBe(1)
  })

  it('carries the ratios into the run', () => {
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'SPECIAL-SKU', 1, 10_000, 6_000]])],
      scheme: { ...SCHEME, costDivisor: 0.7, costRatios: [{ productCode: 'SPECIAL-SKU', ratio: 0.6 }] },
    })
    expect(find(r.statements, 'rs').marginPct).toBeCloseTo(0, 10) // 6,000 ÷ 0.6 = 10,000
  })
})

// ─── Hierarchy override ─────────────────────────────────────────────────────

describe('hierarchy override — differential roll-up', () => {
  const result = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])] })

  it('pays each level only the difference above the level below', () => {
    expect(find(result.statements, 'rs').productCommission).toBe(500) // own 5%
    expect(find(result.statements, 'ta').overrideCommission).toBe(200) // 7 − 5
    expect(find(result.statements, 'tl').overrideCommission).toBe(200) // 9 − 7
    expect(find(result.statements, 'stl').overrideCommission).toBe(100) // 10 − 9
  })

  it('never pays out more than the top rate on any ringgit', () => {
    expect(result.totalCommission).toBe(1_000) // 10% of 10,000
  })

  it("implements the brief's '6% can override the 5%s'", () => {
    const pair: HierarchyNode[] = [node('six', null, 'rs_6'), node('five', 'six', 'rs_5')]
    const r = run({
      hierarchy: pair,
      orders: [order('1', 'five', [['MATTRESS', 'M1', 1, 20_000]])],
    })
    expect(find(r.statements, 'five').productCommission).toBe(1_000) // 5%
    expect(find(r.statements, 'six').overrideCommission).toBe(200) // 1% differential
  })

  it('compresses to zero between two people on the same rate', () => {
    const flat: HierarchyNode[] = [node('up', null, 'ta_7'), node('down', 'up', 'ta_7')]
    const r = run({ hierarchy: flat, orders: [order('1', 'down', [['MATTRESS', 'M1', 1, 20_000]])] })
    expect(find(r.statements, 'up').overrideCommission).toBe(0)
    expect(find(r.statements, 'down').totalCommission).toBe(1_400)
  })

  it('flags a downline placed under a rank that may not recruit', () => {
    const bad: HierarchyNode[] = [node('five', null, 'rs_5'), node('other', 'five', 'rs_5')]
    const r = run({ hierarchy: bad, orders: [] })
    expect(r.warnings.join(' ')).toMatch(/is not allowed to recruit/)
  })

  it('breaks a hierarchy cycle instead of looping forever', () => {
    const cyclic = new Map([['a', node('a', 'b', 'ta_7')], ['b', node('b', 'a', 'rs_5')]])
    const rates = new Map([['a', 0.07], ['b', 0.05]])
    const warnings: string[] = []
    const credits = computeOverrides(cyclic, rates, new Map([['b', 10_000]]), warnings)
    expect(credits).toHaveLength(1)
    expect(credits[0]).toMatchObject({ uplineStaffId: 'a', amount: 200 })
    expect(warnings.join(' ')).toMatch(/cycle/i)
  })

  it('warns when an upline has no active hierarchy row', () => {
    const orphan: HierarchyNode[] = [node('rs', 'ghost', 'rs_5')]
    const r = run({ hierarchy: orphan, orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])] })
    expect(r.warnings.join(' ')).toMatch(/no active hierarchy row/)
  })

  it('warns when someone holds a rank the scheme does not define', () => {
    const r = run({ hierarchy: [node('rs', null, 'rs_7')], orders: [] })
    expect(r.warnings.join(' ')).toMatch(/rank "rs_7", which is not in this scheme/)
  })
})

// ─── Per-component switches (other sub-departments) ─────────────────────────

describe('scheme component switches', () => {
  const orders = [order('1', 'ta', [
    ['MATTRESS', 'M1', 1, 10_000],
    ['ACC', 'AK-CS AIRLOFT COMFY PIL', 10, 0],
  ])]

  it('a sub-department can pay product revenue only', () => {
    const r = run({
      orders,
      scheme: { ...SCHEME, enableKpi: false, enableOverride: false },
    })
    const ta = find(r.statements, 'ta')
    expect(ta.productCommission).toBe(700)
    expect(ta.kpiCommission).toBe(0)
    expect(ta.totalCommission).toBe(700)
    expect(find(r.statements, 'tl').overrideCommission).toBe(0)
  })

  it('turning KPI off puts the pillow back into product revenue', () => {
    const r = run({
      orders: [order('1', 'ta', [['ACC', 'AK-CS AIRLOFT COMFY PIL', 2, 500]])],
      scheme: { ...SCHEME, enableKpi: false },
    })
    expect(find(r.statements, 'ta').productRevenue).toBe(500)
  })
})

// ─── Cross-cutting invariants ───────────────────────────────────────────────

describe('run invariants', () => {
  // Costs give every bill a 33% margin: above the penalty ladder, below the
  // 36% incentive bar, so this run exercises the components with no margin
  // adjustment in play.
  const result = run({
    orders: [
      // (20,000 − 11 × 50 of KPI items) × 67%: the bill is judged on its main sales.
      order('1', 'ta', [
        ['MATTRESS', 'M1', 1, 20_000, 13_031.5],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 11, 0, 0],
        ['TRANS', 'TRANSPORTATION CHARGES', 1, 800, 780],
      ]),
      order('2', 'rs', [['SOFA', 'S1', 1, 10_000, 6_700]]),
      order('3', 'rs', [['BEDFRAME', 'B1', 2, 3_333.33, 2_233.33]]),
    ],
  })

  it('every statement total equals the sum of its lines', () => {
    for (const s of result.statements) {
      const lineSum = Math.round(s.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100
      expect(lineSum).toBe(s.totalCommission)
    }
  })

  it('the run total equals the sum of statement totals', () => {
    const total = Math.round(
      result.statements.reduce((a, s) => a + s.totalCommission, 0) * 100,
    ) / 100
    expect(result.totalCommission).toBe(total)
  })

  it('sorts statements by total, descending', () => {
    const totals = result.statements.map(s => s.totalCommission)
    expect([...totals].sort((a, b) => b - a)).toEqual(totals)
  })

  it('snapshots rank, rate, mode and upline onto each statement', () => {
    const ta = find(result.statements, 'ta')
    expect(ta.baseRankKey).toBe('ta_7')
    expect(ta.effectiveRankKey).toBe('ta_7')
    expect(ta.rankTitleId).toBe(T_TA)
    expect(ta.rateMode).toBe('fixed')
    expect(ta.productRate).toBe(0.07)
    expect(ta.uplineStaffId).toBe('tl')
  })

  it('produces no warnings on a clean run', () => {
    expect(result.warnings).toEqual([])
  })

  it('carries the monthly margin without applying an adjustment at 33%', () => {
    const ta = find(result.statements, 'ta')
    expect(ta.marginPct).toBeCloseTo(0.33, 10)
    expect(ta.marginIncentive).toBe(0)
    expect(ta.marginPenaltyWithheld).toBe(0)
    expect(result.penalised).toEqual([])
  })
})

// ─── Margin: penalty and incentive ──────────────────────────────────────────

describe('margin base', () => {
  const kpiIndex = indexKpiItems(KPI_ITEMS)
  const groupIndex = indexItemGroups(ITEM_GROUPS)

  it('counts goods only — transport and disposal are pass-through', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000, 7_000],
      ['TRANS', 'TRANSPORTATION CHARGES', 1, 500, 480],
      ['OTHER', 'DISPOSE', 1, 200, 150],
    ])
    const base = marginBase(o.lines, kpiIndex, groupIndex)
    expect(base.revenue).toBe(10_000)
    expect(base.cost).toBe(7_000)
    expect(marginPctOf(base)).toBeCloseTo(0.30, 10)
  })

  // The KPI items' amount is not the main product's price (2026-09-27): it
  // leaves the revenue — while their cost, being real, stays.
  it('judges the main sales: KPI items off the revenue, their cost kept', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000, 7_300],
      ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0, 100],
    ])
    const base = marginBase(o.lines, kpiIndex, groupIndex)
    expect(base.revenue).toBe(9_800)
    expect(base.cost).toBe(7_400)
    expect(marginPctOf(base)).toBeCloseTo(2_400 / 9_800, 10)
  })

  // A bed frame's divan, leg and gap the customer pays for (user 2026-10-04):
  // out of the margin on both sides, still in the sales the rate is paid on.
  it('takes what a bed frame’s options were charged off the margin, and only off the margin', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000, 6_000],
      ['BEDFRAME', 'BF1', 1, 2_100, 1_000],
    ])
    o.lines[1].optionCharge = 100
    const base = marginBase(o.lines, kpiIndex, groupIndex)
    expect(base.revenue).toBe(12_000)
    expect(base.cost).toBe(7_000)
    expect(marginPctOf(base)).toBeCloseTo(5_000 / 12_000, 10)
    // The rate is still paid on all of it.
    expect(orderRevenueSplit(o, kpiIndex, groupIndex).main).toBe(12_100)
  })

  it('a charge on a line the scheme does not pay on is not taken off anything', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000, 6_000],
      ['OTHER', 'BF-ODD', 1, 300, 100],
    ])
    o.lines[1].optionCharge = 100
    expect(marginBase(o.lines, kpiIndex, groupIndex).revenue).toBe(10_000)
  })

  it('returns null when any line in scope has no cost', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000, 7_000],
      ['SOFA', 'S1', 1, 5_000],
    ])
    const base = marginBase(o.lines, kpiIndex, groupIndex)
    expect(base.complete).toBe(false)
    expect(marginPctOf(base)).toBeNull()
  })

  it('picks the brand with the most revenue on the bill', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 3_000, 2_000, 'ZANOTTI'],
      ['SOFA', 'S1', 1, 9_000, 6_000, 'AKEMI'],
    ])
    expect(marginBase(o.lines, kpiIndex, groupIndex).brandCode).toBe('AKEMI')
  })

  // Revenue Team cost = cost ÷ divisor (user 2026-09-12: "cost / 0.7 = revenue
  // fair department team cost"). A bill at 30% on the keyed cost is judged at
  // 0% once the RM7,000 is read as RM10,000 — the same figure the member
  // calculator shows for that cart.
  it('judges margin on the Revenue Team cost — every line cost ÷ the scheme divisor', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000, 7_000],
      ['ACC', 'AK-CS AIRLOFT COMFY PIL', 2, 0, 70],
    ])
    const base = marginBase(o.lines, kpiIndex, groupIndex, 0.7)
    expect(base.revenue).toBe(9_900) // the two pillows' 100 is KPI
    expect(base.cost).toBe(10_100)
    expect(marginPctOf(base)).toBeCloseTo(-200 / 9_900, 10)
    expect(marginBase(o.lines, kpiIndex, groupIndex, 1).cost).toBe(7_070)
    // A nonsense divisor never silently zeroes or inflates the cost.
    expect(marginBase(o.lines, kpiIndex, groupIndex, 0).cost).toBe(7_070)
  })

  it('a rider line with no brand counts in the cost but never decides the ladder', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 6_000, 3_000, 'AKEMI'],
      ['BEDFRAME', 'NB-KHJ50 (K)', 1, 9_000, 4_000],
    ])
    const base = marginBase(o.lines, kpiIndex, groupIndex)
    expect(base.brandCode).toBe('AKEMI')
    expect(base.mixedBrand).toBe(false)
    expect(base.cost).toBe(7_000)
  })

  // HC-SO-2609-011 (2026-09-27): a DUNLOP mattress, an AKEMI pillow given away.
  it('reads a gift of another brand at RM 0 as a gift, not as a second brand', () => {
    const base = marginBase(order('1', 'rs', [
      ['MATTRESS', 'DUNLOPILLO CLASSIC DREAM VALLEY MATT (Q)', 1, 4_888, 2_400, 'DUNLOP'],
      ['ACC', 'NTYR-CL MX MICR PIL', 1, 0, 40, 'AKEMI'],
    ]).lines, kpiIndex, groupIndex)
    expect(base.brandCode).toBe('DUNLOP')
    expect(base.mixedBrand).toBe(false)
    // The gift's cost still counts against the margin.
    expect(base.cost).toBe(2_440)
  })

  it('takes the bill\'s own brand over whatever its lines carry', () => {
    const base = marginBase(order('1', 'rs', [
      ['SOFA', 'Z-SOFA', 1, 3_000, 1_500, 'ZANOTTI'],
      ['BEDFRAME', 'TRION (K)', 1, 5_000, 3_300, 'AKEMI'],
    ]).lines, kpiIndex, groupIndex, 1, 'ZANOTTI')
    expect(base).toEqual({ revenue: 8_000, cost: 4_800, complete: true, brandCode: 'ZANOTTI', mixedBrand: false })
  })

  it('still calls it two brands when every branded line is a gift', () => {
    const base = marginBase(order('1', 'rs', [
      // A rider with no brand of its own carries the bill.
      ['BEDFRAME', 'NB-KHJ50 (K)', 1, 5_000],
      ['ACC', 'P1', 1, 0, 40, 'AKEMI'],
      ['ACC', 'P2', 1, 0, 40, 'DUNLOP'],
    ]).lines, kpiIndex, groupIndex)
    expect(base.mixedBrand).toBe(true)
  })
})

describe('penaltyBandFor — the most severe match wins', () => {
  it("matches the user's ladder exactly", () => {
    const at = (m: number) => penaltyBandFor(m, 'AKEMI', MARGIN_BANDS)?.bandKey ?? null
    expect(at(0.28)).toBeNull() // above every penalty band
    expect(at(0.27)).toBe('below_tier_1') // "27 and below"
    expect(at(0.26)).toBe('below_tier_1')
    expect(at(0.25)).toBe('below_tier_2')
    expect(at(0.245)).toBe('below_tier_2')
    expect(at(0.24)).toBe('below_tier_3') // "24 and below"
    expect(at(0.10)).toBe('below_tier_3')
  })

  it('reads the ladder of the bill\'s own brand', () => {
    // 22% is a Tier-1 penalty for Zanotti (bar at 20%? no — 22 > 20, so clear)
    expect(penaltyBandFor(0.22, 'ZANOTTI', MARGIN_BANDS)).toBeNull()
    expect(penaltyBandFor(0.22, 'AKEMI', MARGIN_BANDS)?.bandKey).toBe('below_tier_3')
    expect(penaltyBandFor(0.19, 'ZANOTTI', MARGIN_BANDS)?.bandKey).toBe('below_tier_1')
  })
})

describe('marginIncentiveAcrossBrands — every brand must clear the tier', () => {
  const brand = (brandCode: string, marginPct: number | null) =>
    ({ brandCode, revenue: 10_000, cost: 0, marginPct })

  it('pays nothing below Tier 1', () => {
    expect(marginIncentiveAcrossBrands([brand('AKEMI', 0.35)], MARGIN_BANDS).amount).toBe(0)
  })

  it('pays RM1,000 at Tier 1 and RM2,500 at Tier 2', () => {
    expect(marginIncentiveAcrossBrands([brand('AKEMI', 0.36)], MARGIN_BANDS).amount).toBe(1_000)
    expect(marginIncentiveAcrossBrands([brand('AKEMI', 0.43)], MARGIN_BANDS).amount).toBe(2_500)
    expect(marginIncentiveAcrossBrands([brand('AKEMI', 0.50)], MARGIN_BANDS).bandKey)
      .toBe('incentive_tier_2')
  })

  it("uses each brand's own bar — Zanotti clears Tier 1 at 33%, Akemi at 36%", () => {
    expect(marginIncentiveAcrossBrands([brand('ZANOTTI', 0.33)], MARGIN_BANDS).amount).toBe(1_000)
    expect(marginIncentiveAcrossBrands([brand('AKEMI', 0.33)], MARGIN_BANDS).amount).toBe(0)
  })

  it("matches the brief's four-weekend example", () => {
    // Three weekends of Akemi at 45% clear Tier 2, but the fourth weekend of
    // Zanotti at 35% only clears Tier 1 — so the month is a Tier 1 month.
    const r = marginIncentiveAcrossBrands(
      [brand('AKEMI', 0.45), brand('ZANOTTI', 0.35)], MARGIN_BANDS)
    expect(r.amount).toBe(1_000)
    expect(r.bandKey).toBe('incentive_tier_1')
  })

  it('drops to nothing when one brand clears no tier at all', () => {
    const r = marginIncentiveAcrossBrands(
      [brand('AKEMI', 0.45), brand('ZANOTTI', 0.30)], MARGIN_BANDS)
    expect(r.amount).toBe(0)
  })

  it('pays Tier 2 when BOTH brands clear their own Tier 2', () => {
    const r = marginIncentiveAcrossBrands(
      [brand('AKEMI', 0.44), brand('ZANOTTI', 0.41)], MARGIN_BANDS)
    expect(r.amount).toBe(2_500)
  })

  it('blocks rather than guessing when a brand has no cost data', () => {
    const r = marginIncentiveAcrossBrands(
      [brand('AKEMI', 0.45), brand('ZANOTTI', null)], MARGIN_BANDS)
    expect(r.amount).toBe(0)
    expect(r.blockedReason).toMatch(/no cost data for ZANOTTI/)
  })

  it('blocks when a brand has no ladder configured', () => {
    const r = marginIncentiveAcrossBrands(
      [brand('AKEMI', 0.45), brand('ERGOTEX', 0.45)], MARGIN_BANDS)
    expect(r.amount).toBe(0)
    expect(r.blockedReason).toMatch(/no incentive ladder configured for ERGOTEX/)
  })

  it('blocks when sales carry no brand at all', () => {
    const r = marginIncentiveAcrossBrands(
      [{ brandCode: null, revenue: 1_000, cost: 0, marginPct: 0.5 }], MARGIN_BANDS)
    expect(r.amount).toBe(0)
    expect(r.blockedReason).toMatch(/no brand/)
  })
})

describe('below-margin penalty, end to end', () => {
  // 10,000 of goods at 7,400 cost = 26% margin → Below Tier 1 → x 0.5
  const badBill = order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 7_400]])

  it('halves the bill\'s product commission', () => {
    const r = run({ orders: [badBill] })
    const rs = find(r.statements, 'rs')
    expect(rs.marginPct).toBeCloseTo(0.26, 10)
    expect(rs.productCommission).toBe(250) // 10,000 x 5% = 500, halved
    expect(rs.marginPenaltyWithheld).toBe(250)
  })

  it('does NOT scale the flat KPI allowance', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M1', 1, 10_000, 7_152],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0, 100],
      ])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginPct).toBeCloseTo(0.26, 10) // (9,800 − 7,252) ÷ 9,800
    expect(rs.productCommission).toBe(245) // 9,800 × 5%, halved
    expect(rs.kpiCommission).toBe(200) // 4 x 50, untouched
    expect(rs.totalCommission).toBe(445)
  })

  it('kills the commission outright below Tier 3', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 7_700]])] })
    expect(find(r.statements, 'rs').productCommission).toBe(0) // 23% margin
  })

  it('reports each penalised bill for the run dashboard', () => {
    const r = run({ orders: [badBill] })
    expect(r.penalised).toHaveLength(1)
    expect(r.penalised[0]).toMatchObject({
      orderNo: 'SO-1', bandKey: 'below_tier_1', multiplier: 0.5, withheld: 250,
    })
  })

  it("cuts the upline's override in the same proportion", () => {
    const r = run({ orders: [badBill] })
    // The bill is halved, so every level's share of it is halved: the 10,000
    // behaves like 5,000 all the way up the chain.
    expect(find(r.statements, 'rs').productCommission).toBe(250) // 5% of 5,000
    expect(find(r.statements, 'ta').overrideCommission).toBe(100) // (7-5)% of 5,000
    expect(find(r.statements, 'tl').overrideCommission).toBe(100) // (9-7)% of 5,000
    expect(find(r.statements, 'stl').overrideCommission).toBe(50) // (10-9)% of 5,000
    expect(r.totalCommission).toBe(500) // 10% of 5,000, never more than the top rate
  })

  it('kills the override outright when the bill is killed', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 7_700]])] })
    expect(find(r.statements, 'ta').overrideCommission).toBe(0)
    expect(r.totalCommission).toBe(0)
  })

  it('leaves a good-margin bill alone', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 6_000]])] })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(500)
    expect(rs.marginPenaltyWithheld).toBe(0)
    expect(r.penalised).toEqual([])
  })

  it('takes a hand-keyed margin over the line costs', () => {
    // Line costs say 40% (a clean bill); the human says 26%. The human wins.
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 6_000]], { manualMarginPct: 0.26 })],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(250) // halved by Below Tier 1
    expect(r.penalised[0]).toMatchObject({ marginSource: 'manual', bandKey: 'below_tier_1' })
  })

  it('works with a hand-keyed margin and NO cost data at all', () => {
    // The stop-gap while the Product List fills up.
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, undefined, 'AKEMI']], {
        manualMarginPct: 0.24,
      })],
    })
    expect(find(r.statements, 'rs').productCommission).toBe(0) // Below Tier 3
    expect(r.warnings.join(' ')).not.toMatch(/no margin/)
  })

  it('folds the hand-keyed margin into the month at the implied cost', () => {
    // 10,000 at a keyed 45% implies 5,500 of cost, so the monthly blend agrees
    // with the bill instead of drifting from it.
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, undefined, 'AKEMI']], {
        manualMarginPct: 0.45,
      })],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginCost).toBe(5_500)
    expect(rs.marginPct).toBeCloseTo(0.45, 10)
    expect(rs.marginIncentive).toBe(2_500) // Akemi Tier 2
  })

  it('skips the penalty and warns loudly when there is neither cost nor a keyed margin', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])] })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(500) // full, not penalised
    expect(rs.marginPct).toBeNull()
    expect(r.warnings.join(' ')).toMatch(/no margin/)
  })

  it('can be switched off per sub-department', () => {
    const r = run({ orders: [badBill], scheme: { ...SCHEME, enableMarginPenalty: false } })
    expect(find(r.statements, 'rs').productCommission).toBe(500)
  })
})

describe('monthly margin incentive, end to end', () => {
  it('pays RM1,000 as its own statement line at Tier 1', () => {
    // 10,000 at 6,200 cost = 38% margin
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 6_200]])] })
    const rs = find(r.statements, 'rs')
    expect(rs.marginPct).toBeCloseTo(0.38, 10)
    expect(rs.marginIncentive).toBe(1_000)
    expect(rs.totalCommission).toBe(1_500) // 500 commission + 1,000 incentive
    expect(rs.lines.filter(l => l.component === 'margin_incentive')).toHaveLength(1)
  })

  it('pays RM2,500 at Tier 2', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]])] })
    expect(find(r.statements, 'rs').marginIncentive).toBe(2_500) // 44% margin
  })

  it('is monthly — two bills average into one margin, not two incentives', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]]), // 44%
        order('2', 'rs', [['MATTRESS', 'M2', 1, 10_000, 7_000]]), // 30%
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginPct).toBeCloseTo(0.37, 10) // 20,000 rev, 12,600 cost
    expect(rs.marginIncentive).toBe(1_000) // Tier 1 only, paid once
  })

  it('can be switched off per sub-department', () => {
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]])],
      scheme: { ...SCHEME, enableMarginIncentive: false },
    })
    expect(find(r.statements, 'rs').marginIncentive).toBe(0)
  })

  it("the four-weekend case, end to end: a weak fourth brand caps the month", () => {
    const r = run({
      orders: [
        // three weekends of Akemi at 45%
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_500, 'AKEMI']]),
        order('2', 'rs', [['MATTRESS', 'M2', 1, 10_000, 5_500, 'AKEMI']]),
        order('3', 'rs', [['MATTRESS', 'M3', 1, 10_000, 5_500, 'AKEMI']]),
        // a fourth weekend of Zanotti at 35% — clears Zanotti Tier 1, not Tier 2
        order('4', 'rs', [['SOFA', 'S1', 1, 10_000, 6_500, 'ZANOTTI']]),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand.map(b => b.brandCode).sort()).toEqual(['AKEMI', 'ZANOTTI'])
    expect(rs.marginByBrand.find(b => b.brandCode === 'AKEMI')!.marginPct).toBeCloseTo(0.45, 10)
    expect(rs.marginByBrand.find(b => b.brandCode === 'ZANOTTI')!.marginPct).toBeCloseTo(0.35, 10)
    expect(rs.marginIncentive).toBe(1_000) // Tier 1, not Tier 2
    expect(rs.marginBandKey).toBe('incentive_tier_1')
  })

  it('warns when a bill crosses brands, which the ERP should never produce', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M1', 1, 6_000, 3_000, 'AKEMI'],
        ['SOFA', 'S1', 1, 4_000, 2_000, 'ZANOTTI'],
      ])],
    })
    expect(r.warnings.join(' ')).toMatch(/more than one brand/)
  })

  // User 2026-09-27: 主体是 Akemi 就跟 Akemi 的 margin ladder — the bill's own
  // brand, whatever rides on it. A Dunlopillo pillow given away on an Akemi
  // bill costs the Akemi margin; it does not make the bill Dunlopillo's.
  it('measures a bill on the ladder of the brand it was written under, riders\' cost included', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'AKEMI M1', 1, 5_000, 2_500, 'AKEMI'],
        ['ACC', 'DL-PILLOW', 1, 0, 300, 'DUNLOP'],
      ], { brandCode: 'AKEMI' })],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand).toEqual([{ brandCode: 'AKEMI', revenue: 5_000, cost: 2_800, marginPct: 0.44 }])
    expect(rs.marginIncentive).toBe(2_500) // 44% clears Akemi's 36% and 43%
    expect(r.warnings.join(' ')).not.toMatch(/more than one brand/)
  })

  // The same goods, two bills: the ladder moves with the bill's brand. A bed
  // frame that out-sells the sofa is still a rider on a Zanotti bill.
  it('lets a rider follow the bill it is sold on, even when it carries the money', () => {
    const lines: Array<[string, string, number, number, number, string]> = [
      ['SOFA', 'Z-SOFA', 1, 3_000, 1_500, 'ZANOTTI'],
      ['BEDFRAME', 'TRION (K)', 1, 5_000, 3_300, 'AKEMI'],
    ]
    const zanotti = find(run({ orders: [order('1', 'rs', lines, { brandCode: 'ZANOTTI' })] }).statements, 'rs')
    expect(zanotti.marginByBrand.map(b => b.brandCode)).toEqual(['ZANOTTI'])
    expect(zanotti.marginIncentive).toBe(2_500) // 40% clears Zanotti's 33% and 40%
    const akemi = find(run({ orders: [order('1', 'rs', lines, { brandCode: 'AKEMI' })] }).statements, 'rs')
    expect(akemi.marginIncentive).toBe(1_000) // the same 40% is only Akemi's Tier 1
  })

  // HC-SO-2609-011 and four more September bills (2026-09-27): a DUNLOP
  // mattress with an AKEMI pillow given away. The customer bought one brand.
  it('does not stop the run over a gift of another brand', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'DUNLOPILLO CLASSIC DREAM VALLEY MATT (Q)', 1, 4_888, 2_400, 'DUNLOP'],
        ['ACC', 'NTYR-CL MX MICR PIL', 1, 0, 40, 'AKEMI'],
      ])],
    })
    expect(r.warnings.join(' ')).not.toMatch(/more than one brand/)
  })

  it('asks nothing about the brand in a month that pays no margin', () => {
    const r = run({
      scheme: { ...SCHEME, enableMarginPenalty: false, enableMarginIncentive: false },
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M1', 1, 6_000, 3_000, 'AKEMI'],
        ['SOFA', 'S1', 1, 4_000, 2_000, 'ZANOTTI'],
      ])],
    })
    expect(r.warnings).toEqual([])
  })

  it('keeps the line-sum invariant with an incentive present', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]])] })
    for (const st of r.statements) {
      const lineSum = Math.round(st.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100
      expect(lineSum).toBe(st.totalCommission)
    }
  })
})

// 2026-10-30, the user on October's RM 0 gift bills: "show, no sales. but consider margin negative as well. make sure
// in the calculation of monthly". A bill of its own with nothing sold has no margin, but its goods cost what they cost.
describe('a bill with no sales, in the month', () => {
  const kpiIndex = indexKpiItems(KPI_ITEMS)
  const groupIndex = indexItemGroups(ITEM_GROUPS)
  const costBasis = costBasisOf(1, [])
  const baseOf = (o: SalesOrder) => marginBase(o.lines, kpiIndex, groupIndex, costBasis, o.brandCode ?? null)

  it('costs what its goods cost, once every one is costed', () => {
    const gift = order('2', 'rs', [['ACC', 'AK-PILLOW', 1, 0, 300]], { brandCode: 'AKEMI' })
    expect(noSalesCost(gift.lines, baseOf(gift), groupIndex)).toBe(300)
  })

  it('waits while one of its goods has no cost', () => {
    const gift = order('2', 'rs', [['ACC', 'AK-PILLOW', 1, 0, 300], ['ACC', 'AK-BOLSTER', 1, 0]], { brandCode: 'AKEMI' })
    expect(noSalesCost(gift.lines, baseOf(gift), groupIndex)).toBeNull()
  })

  it('is no part of the margin when the bill sells, or carries no goods', () => {
    const sold = order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]])
    expect(noSalesCost(sold.lines, baseOf(sold), groupIndex)).toBeUndefined()
    const transport = order('3', 'rs', [['TRANS', 'TRANSPORTATION CHARGES', 1, 150]], { brandCode: 'AKEMI' })
    expect(noSalesCost(transport.lines, baseOf(transport), groupIndex)).toBeUndefined()
  })

  it('counts against its brand in the month: the margin falls, the bill stays none', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }), // 44% alone
        order('2', 'rs', [['ACC', 'AK-PILLOW', 1, 0, 300]], { brandCode: 'AKEMI' }),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand).toEqual([{ brandCode: 'AKEMI', revenue: 10_000, cost: 5_900, marginPct: 0.41 }])
    expect(rs.marginPct).toBeCloseTo(0.41, 10)
    expect(rs.marginIncentive).toBe(1_000) // 41% is Tier 1 only; 44% alone would be Tier 2
  })

  it('holds the month while a gift on its own still waits for a cost', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }),
        order('2', 'rs', [['ACC', 'AK-PILLOW', 1, 0]], { brandCode: 'AKEMI' }),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginPct).toBeNull()
    expect(rs.marginIncentive).toBe(0)
    expect(r.warnings.join(' ')).toMatch(/no cost data for AKEMI/)
  })

  // HC-SO-2610-096 (2026-10-30): WEI PIN sold Zanotti that month and gave an Akemi item away on a bill of its own.
  it('reads a brand given away and never sold as below every tier — judged, not held', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }), // 44% alone: Tier 2
        order('2', 'rs', [['ACC', 'DL-PILLOW', 1, 0, 400, 'DUNLOP']], { brandCode: 'DUNLOP' }),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand).toContainEqual({ brandCode: 'DUNLOP', revenue: 0, cost: 400, marginPct: null, noSales: true })
    expect(rs.marginByBrand).toContainEqual({ brandCode: 'AKEMI', revenue: 10_000, cost: 5_600, marginPct: 0.44 })
    expect(rs.marginPct).toBeCloseTo(0.4, 10) // 10,000 sold, 5,600 + 400 cost
    expect(rs.marginIncentive).toBe(0)
    expect(rs.marginBandKey).toBeNull()
    expect(r.warnings).toEqual([]) // nothing missing, so nothing holds Apply
  })

  it('does not call a brand "no sales" while a gift of it still waits for a cost', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }),
        order('2', 'rs', [['ACC', 'DL-PILLOW', 1, 0, 400, 'DUNLOP']], { brandCode: 'DUNLOP' }),
        order('3', 'rs', [['ACC', 'DL-BOLSTER', 1, 0]], { brandCode: 'DUNLOP' }),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand).toContainEqual({ brandCode: 'DUNLOP', revenue: 0, cost: 400, marginPct: null })
    expect(rs.marginPct).toBeNull()
    expect(r.warnings.join(' ')).toMatch(/no cost data for DUNLOP/)
  })

  it('takes none of the month’s revenue where its KPI items and charges take more than it sold', () => {
    const frame = order('2', 'rs', [['BEDFRAME', 'TRION (K)', 1, 300, 140]], { brandCode: 'AKEMI' })
    frame.lines[0].optionCharge = 500 // the leg and divan charged 500 on a frame line of 300
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }), frame] })
    const akemi = find(r.statements, 'rs').marginByBrand.find(b => b.brandCode === 'AKEMI')!
    expect([akemi.revenue, akemi.cost]).toEqual([10_000, 5_740]) // never 9,800: a bill with no sales sells nothing
    expect(akemi.marginPct).toBeCloseTo(0.426, 10)
  })

  it('leaves a gift that costs nothing out of the month', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }),
        order('2', 'rs', [['ACC', 'DL-SAMPLE', 1, 0, 0, 'DUNLOP']], { brandCode: 'DUNLOP' }),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand).toEqual([{ brandCode: 'AKEMI', revenue: 10_000, cost: 5_600, marginPct: 0.44 }])
    expect(rs.marginIncentive).toBe(2_500)
  })

  it('leaves a bill of transport alone out of the margin', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }),
        order('2', 'rs', [['TRANS', 'TRANSPORTATION CHARGES', 1, 0]], { brandCode: 'AKEMI' }),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand).toEqual([{ brandCode: 'AKEMI', revenue: 10_000, cost: 5_600, marginPct: 0.44 }])
    expect(rs.marginIncentive).toBe(2_500)
  })

  it('pays no commission on it and takes no penalty from it', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]], { brandCode: 'AKEMI' }),
        order('2', 'rs', [['ACC', 'AK-PILLOW', 1, 0, 300]], { brandCode: 'AKEMI' }),
      ],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.lines.filter(l => l.component === 'product_revenue').map(l => l.sourceOrderId)).toEqual(['1'])
    expect(rs.penaltyWeightedRevenue).toBe(10_000)
    expect(r.warnings.join(' ')).not.toMatch(/have no margin/)
  })
})

describe('marginIncentiveAcrossBrands with a brand given away', () => {
  it('pays nothing while a brand had no sales, whatever the others clear', () => {
    const result = marginIncentiveAcrossBrands([
      { brandCode: 'AKEMI', revenue: 10_000, cost: 5_000, marginPct: 0.5 },
      { brandCode: 'ZANOTTI', revenue: 0, cost: 300, marginPct: null, noSales: true },
    ], MARGIN_BANDS)
    expect(result).toEqual({ amount: 0, bandKey: null, bandLabel: null, blockedReason: null })
  })
})

describe('unranked salesperson', () => {
  const result = run({ orders: [order('1', 'stranger', [['MATTRESS', 'M1', 1, 10_000]])] })

  it('computes at 0% rather than guessing a rate', () => {
    expect(find(result.statements, 'stranger').productCommission).toBe(0)
  })

  it('warns loudly so the run cannot be applied blind', () => {
    expect(result.warnings.join(' ')).toMatch(/no rank \/ hierarchy row/)
  })

  // KRIS and PETER, September 2026: a Revenue Director cannot hold a rank
  // (23DIR), so their bills are theirs and earn nothing — by the rule.
  it('does not flag a department head, whose 0% is the rule', () => {
    const r = run({
      orders: [order('1', 'director', [['MATTRESS', 'M1', 1, 9_500]])],
      departmentHeadIds: ['director'],
    })
    expect(r.warnings).toEqual([])
    expect(find(r.statements, 'director').totalCommission).toBe(0)
    // Somebody merely unplaced is still flagged beside them.
    const both = run({
      orders: [order('1', 'director', [['MATTRESS', 'M1', 1, 9_500]]), order('2', 'stranger', [['MATTRESS', 'M2', 1, 1_000]])],
      departmentHeadIds: ['director'],
    })
    expect(both.warnings.filter(w => /no rank/.test(w))).toEqual([
      expect.stringMatching(/^Staff stranger has sales this period but no rank/),
    ])
  })

  it('pays a head nothing on their own bills, whatever the month switches on', () => {
    const r = run({
      orders: [order('1', 'director', [
        ['MATTRESS', 'M1', 1, 10_000, 5_000, 'AKEMI'],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 10, 0, 0, 'AKEMI'],
      ])],
      departmentHeadIds: ['director'],
    })
    const s = find(r.statements, 'director')
    // The sale is theirs and stays on the record — as every bill's main sales:
    // the ten pillows' RM 500 of KPI value comes off the bill whoever sold it
    // (2026-09-27), as the month page shows it, and a head is paid neither part…
    expect(s.productRevenue).toBe(9_500)
    // …and earns no KPI allowance or margin incentive.
    expect(s.lines).toEqual([])
    expect(s.totalCommission).toBe(0)
    expect(r.warnings).toEqual([])
  })

  it('still pays flat KPI allowances, which do not depend on rate', () => {
    const r = run({
      orders: [order('1', 'stranger', [
        ['MATTRESS', 'M', 1, 5_000],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 10, 0],
      ])],
    })
    expect(find(r.statements, 'stranger').kpiCommission).toBe(600)
  })
})

// ─── Revenue Director pay (user 2026-09-27) ──────────────────────────────────
// A director holds no membership and earns no override. Their title's rung
// sets the rate of their OWN bills — that rate and nothing else — and Rules ›
// Directors adds a fixed amount and an incentive once the month's
// Commissionable value reaches the threshold.
describe('Revenue Director pay', () => {
  const T_RD = 'title-rd'
  const DIRECTOR_RUNG: Rank = {
    rankKey: 'rd_12', titleId: T_RD, titleLabel: 'Revenue Director', label: 'Rank SS', productRate: 0.12,
    canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 70,
  }
  const LADDER = [...RANKS, DIRECTOR_RUNG]
  const terms = (over: Partial<DirectorTerms> = {}): DirectorTerms => ({
    staffId: 'director', rankKey: 'rd_12', fixedAmount: 0, salesThreshold: null, incentiveAmount: 0, ...over,
  })

  it('pays their own bills at the rung rate, and nothing else', () => {
    const r = run({
      ranks: LADDER,
      orders: [order('1', 'director', [
        ['MATTRESS', 'M1', 1, 10_000, 9_000, 'AKEMI'],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 10, 0, 0, 'AKEMI'],
      ])],
      departmentHeadIds: ['director'],
      directors: [terms()],
    })
    const s = find(r.statements, 'director')
    // The main sales (the pillows' KPI value comes off every bill) at 12%:
    // no KPI allowance, no margin penalty for a 10% margin.
    expect(s.productRevenue).toBe(9_500)
    expect(s.lines.map(l => [l.component, l.amount])).toEqual([['product_revenue', 1_140]])
    expect(s.productRate).toBe(0.12)
    expect(s.effectiveRankKey).toBe('rd_12')
    expect(s.promotesToTitleId).toBeNull()
    expect(s.kpiCommission).toBe(0)
    expect(s.marginIncentive).toBe(0)
    expect(s.totalCommission).toBe(1_140)
    expect(r.warnings).toEqual([])
  })

  it('pays the fixed amount in a month they sold nothing', () => {
    const r = run({ ranks: LADDER, departmentHeadIds: ['director'], directors: [terms({ fixedAmount: 38_000 })] })
    const s = find(r.statements, 'director')
    expect(s.directorFixed).toBe(38_000)
    expect(s.directorIncentive).toBe(0)
    expect(s.lines).toEqual([expect.objectContaining({ component: 'director_fixed', amount: 38_000 })])
    expect(s.totalCommission).toBe(38_000)
  })

  it('pays the incentive once the month reaches the threshold, and not a sen before', () => {
    const month = (value: number) => find(run({
      ranks: LADDER,
      departmentHeadIds: ['director'],
      directors: [terms({ fixedAmount: 10_000, salesThreshold: 2_000_000, incentiveAmount: 5_000 })],
      monthCommissionableValue: value,
    }).statements, 'director')
    expect(month(1_999_999.99).directorIncentive).toBe(0)
    expect(month(1_999_999.99).totalCommission).toBe(10_000)
    const reached = month(2_000_000)
    expect(reached.directorIncentive).toBe(5_000)
    expect(reached.totalCommission).toBe(15_000)
    expect(reached.lines.find(l => l.component === 'director_incentive')?.note).toBe('Commissionable value 2000000.00 reached 2000000.00')
  })

  it('says so when the month figure was not read, rather than silently skipping', () => {
    const r = run({
      ranks: LADDER,
      departmentHeadIds: ['director'],
      directors: [terms({ salesThreshold: 2_000_000, incentiveAmount: 5_000 })],
    })
    expect(r.warnings).toEqual([expect.stringMatching(/^Staff director's director incentive could not be judged/)])
  })

  it('earns no rate without a rung, but keeps the Directors tab amounts', () => {
    const r = run({
      orders: [order('1', 'director', [['MATTRESS', 'M1', 1, 9_500]])],
      departmentHeadIds: ['director'],
      directors: [terms({ rankKey: null, fixedAmount: 1_000 })],
    })
    const s = find(r.statements, 'director')
    expect(s.productCommission).toBe(0)
    expect(s.totalCommission).toBe(1_000)
    expect(r.warnings).toEqual([])
  })

  it('never lets a salesperson climb into the director rung, however much they sell', () => {
    const r = run({
      ranks: LADDER,
      hierarchy: [node('stl', null, 'stl_10', 'variable', T_STL)],
      orders: [order('1', 'stl', [['MATTRESS', 'M1', 1, 5_000_000]])],
      departmentHeadIds: ['director'],
      directors: [terms()],
    })
    const s = find(r.statements, 'stl')
    expect(s.effectiveRankKey).toBe('stl_10')
    expect(s.qualifiesForRankKey).toBeNull()
    expect(s.promotesToTitleId).toBeNull()
  })

  it('pays a director no override, and changes nobody else’s', () => {
    const without = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])] })
    const withDirector = run({
      ranks: LADDER,
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])],
      departmentHeadIds: ['director'],
      directors: [terms({ fixedAmount: 1 })],
    })
    for (const staffId of ['stl', 'tl', 'ta', 'rs']) {
      expect(find(withDirector.statements, staffId).totalCommission).toBe(find(without.statements, staffId).totalCommission)
    }
    expect(find(withDirector.statements, 'director').overrideCommission).toBe(0)
    expect(find(withDirector.statements, 'director').totalCommission).toBe(1)
  })
})
