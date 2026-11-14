import { describe, it, expect } from 'vitest'
import { splitOrdersByShares } from './shares'
import { toGwpRules, withGwp } from './run-payload'
import type { GwpRule } from '@/lib/catalogue/gwp'
import {
  brandRateOf,
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

// ─── A rider SKU's ratio by brand (Costing Setting, 2026-11-07) ─────────────
// The user: "Trion 我 right click 它，可以设成 0.6 … 不要同一个 item 在不同的 brand 卖不一样的
// margin"; "if didnt set, then just follow the defauly rate". A bed frame rides on a bill of any
// brand and is judged on that brand's ladder, so its cost divides by its ratio for that brand.

describe("a rider SKU's ratio by brand — 2026-11-07", () => {
  const groupIndex = indexItemGroups(ITEM_GROUPS)
  // TRION's own ratio is none (the default 0.7); Dunlopillo 0.6, Ergotex 0.5 — Akemi and Zanotti unset.
  const basis = costBasisOf(0.7, [{ productCode: 'TRION (K)', ratio: 0.65 }], [
    { productCode: ' trion (k) ', brand: 'dunlop', ratio: 0.6 },
    { productCode: 'TRION (K)', brand: 'ERGOTEX', ratio: 0.5 },
    { productCode: 'TRION (Q)', brand: 'DUNLOP', ratio: 0.6 },
    { productCode: 'TRION (Q)', brand: 'AKEMI', ratio: 0 },
  ])

  it("divides by the SKU's ratio for the brand, else its own, else the default", () => {
    expect(costDivisorFor('TRION (K)', basis, 'DUNLOP')).toBe(0.6)
    expect(costDivisorFor('trion (k)', basis, ' Ergotex ')).toBe(0.5)
    // A brand left unset follows the SKU's own ratio …
    expect(costDivisorFor('TRION (K)', basis, 'AKEMI')).toBe(0.65)
    // … and with none of its own, the sub-department's.
    expect(costDivisorFor('TRION (Q)', basis, 'ZANOTTI')).toBe(0.7)
    // A ratio that is no ratio is none: AKEMI on the Queen falls through.
    expect(costDivisorFor('TRION (Q)', basis, 'AKEMI')).toBe(0.7)
    // No brand — a cart of riders alone, a bill nobody can tell the brand of — is never a brand's.
    expect(costDivisorFor('TRION (K)', basis, null)).toBe(0.65)
    expect(costDivisorFor('TRION (K)', basis)).toBe(0.65)
    // Any other SKU is untouched.
    expect(costDivisorFor('M1', basis, 'DUNLOP')).toBe(0.7)
  })

  it("costs a bed frame on a bill at the ratio for the bill's own brand", () => {
    const lines = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 3_000, 700],
      ['BEDFRAME', 'TRION (K)', 1, 1_000, 300],
    ]).lines
    // Dunlopillo: 700 ÷ 0.7 + 300 ÷ 0.6 = 1,000 + 500.
    expect(marginBase(lines, indexKpiItems([]), groupIndex, basis, 'DUNLOP').cost).toBe(1_500)
    // Ergotex: 1,000 + 300 ÷ 0.5 = 1,600.
    expect(marginBase(lines, indexKpiItems([]), groupIndex, basis, 'ERGOTEX').cost).toBe(1_600)
    // Akemi has none: the frame's own 0.65 — 1,000 + 461.54.
    expect(marginBase(lines, indexKpiItems([]), groupIndex, basis, 'AKEMI').cost).toBe(1_461.54)
  })

  it('a bill with no brand of its own: the brand its goods sell the most of, the first on a tie', () => {
    const most = order('2', 'rs', [
      ['ACC', 'PILLOW', 1, 200, 50, 'AKEMI'],
      ['MATTRESS', 'M1', 1, 3_000, 700, 'DUNLOP'],
      ['BEDFRAME', 'TRION (K)', 1, 1_000, 300],
    ])
    const base = marginBase(most.lines, indexKpiItems([]), groupIndex, basis)
    expect(base.brandCode).toBe('DUNLOP')
    expect(base.cost).toBe(1_571.43) // 50 ÷ 0.7 + 1,000 + 300 ÷ 0.6
    const tie = order('3', 'rs', [
      ['MATTRESS', 'M2', 1, 1_000, 280, 'ERGOTEX'],
      ['MATTRESS', 'M1', 1, 1_000, 280, 'DUNLOP'],
      ['BEDFRAME', 'TRION (K)', 1, 1_000, 300],
    ])
    expect(marginBase(tie.lines, indexKpiItems([]), groupIndex, basis).cost).toBe(1_400) // 400 + 400 + 300 ÷ 0.5
  })

  it('nobody can tell the brand: the SKU keeps its own ratio', () => {
    // '' — a line the ERP sent with no brand (the helper gives a costed line Akemi's otherwise).
    const lines = order('4', 'rs', [['BEDFRAME', 'TRION (K)', 1, 1_000, 300, '']]).lines
    const base = marginBase(lines, indexKpiItems([]), groupIndex, basis)
    expect(base.brandCode).toBeNull()
    expect(base.cost).toBe(461.54)
  })

  it('carries them into the run: the same frame, two brands, two margins', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['BEDFRAME', 'TRION (K)', 1, 1_000, 300]], { brandCode: 'DUNLOP' }),
        order('2', 'ta', [['BEDFRAME', 'TRION (K)', 1, 1_000, 300]], { brandCode: 'AKEMI' }),
      ],
      scheme: {
        ...SCHEME,
        costDivisor: 0.7,
        costRatiosByBrand: [{ productCode: 'TRION (K)', brand: 'DUNLOP', ratio: 0.6 }],
      },
    })
    expect(find(r.statements, 'rs').marginPct).toBeCloseTo(0.5, 10) // 1 − 300 ÷ 0.6 ÷ 1,000
    expect(find(r.statements, 'ta').marginPct).toBeCloseTo(0.5714, 4) // 1 − 428.57 ÷ 1,000
  })
})

describe("a brand's own ratio — 2026-11-14", () => {
  const groupIndex = indexItemGroups(ITEM_GROUPS)
  // Fair at 0.7; Ergotex 0.6 and Dunlopillo 0.65 of their own, Akemi and Zanotti none. M2 has a ratio of its own (0.8);
  // TRION a ratio for Dunlopillo (0.55).
  const basis = costBasisOf(0.7, [{ productCode: 'M2', ratio: 0.8 }], [{ productCode: 'TRION (K)', brand: 'DUNLOP', ratio: 0.55 }], [
    { brand: ' ergotex ', ratio: 0.6 },
    { brand: 'DUNLOP', ratio: 0.65 },
    { brand: 'AKEMI', ratio: 0 },
  ])

  it("divides a SKU with no ratio of its own by the brand's, else the default", () => {
    expect(costDivisorFor('M1', basis, 'ERGOTEX')).toBe(0.6)
    expect(costDivisorFor('M1', basis, 'dunlop')).toBe(0.65)
    // A brand with none — or a ratio that is no ratio — divides by the sub-department's.
    expect(costDivisorFor('M1', basis, 'ZANOTTI')).toBe(0.7)
    expect(costDivisorFor('M1', basis, 'AKEMI')).toBe(0.7)
    // No brand: the sub-department's.
    expect(costDivisorFor('M1', basis, null)).toBe(0.7)
    expect(costDivisorFor('M1', basis)).toBe(0.7)
  })

  it("a SKU's own ratio, and its ratio for the brand, stay ahead of the brand's", () => {
    expect(costDivisorFor('M2', basis, 'ERGOTEX')).toBe(0.8)
    expect(costDivisorFor('TRION (K)', basis, 'DUNLOP')).toBe(0.55)
    // The frame has none for Ergotex and none of its own: Ergotex's.
    expect(costDivisorFor('TRION (K)', basis, 'ERGOTEX')).toBe(0.6)
  })

  it("costs a bill's lines at its brand's ratio", () => {
    const lines = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 3_000, 600],
      ['MATTRESS', 'M2', 1, 1_000, 200],
      ['BEDFRAME', 'TRION (K)', 1, 1_000, 330],
    ]).lines
    // Ergotex: 600 ÷ 0.6 + 200 ÷ 0.8 + 330 ÷ 0.6 = 1,000 + 250 + 550.
    expect(marginBase(lines, indexKpiItems([]), groupIndex, basis, 'ERGOTEX').cost).toBe(1_800)
    // Dunlopillo: 600 ÷ 0.65 + 250 + 330 ÷ 0.55 = 923.08 + 250 + 600.
    expect(marginBase(lines, indexKpiItems([]), groupIndex, basis, 'DUNLOP').cost).toBe(1_773.08)
    // Zanotti has none: 600 ÷ 0.7 + 250 + 330 ÷ 0.7.
    expect(marginBase(lines, indexKpiItems([]), groupIndex, basis, 'ZANOTTI').cost).toBe(1_578.57)
  })

  it('a bill with no brand of its own answers to the brand its goods sell the most of', () => {
    const lines = order('2', 'rs', [
      ['MATTRESS', 'M1', 1, 3_000, 600, 'ERGOTEX'],
      ['BEDFRAME', 'TRION (K)', 1, 1_000, 330],
    ]).lines
    const base = marginBase(lines, indexKpiItems([]), groupIndex, basis)
    expect(base.brandCode).toBe('ERGOTEX')
    expect(base.cost).toBe(1_550) // 600 ÷ 0.6 + 330 ÷ 0.6
  })

  it('carries them into the run: one mattress, two brands, two margins', () => {
    const r = run({
      orders: [
        order('1', 'rs', [['MATTRESS', 'M1', 1, 1_000, 300]], { brandCode: 'ERGOTEX' }),
        order('2', 'ta', [['MATTRESS', 'M1', 1, 1_000, 300]], { brandCode: 'AKEMI' }),
      ],
      scheme: { ...SCHEME, costDivisor: 0.7, brandDivisors: [{ brand: 'ERGOTEX', ratio: 0.6 }] },
    })
    expect(find(r.statements, 'rs').marginPct).toBeCloseTo(0.5, 10) // 1 − 300 ÷ 0.6 ÷ 1,000
    expect(find(r.statements, 'ta').marginPct).toBeCloseTo(0.5714, 4) // 1 − 300 ÷ 0.7 ÷ 1,000
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
    // A bill cut to nothing counts no sales either (2026-11-07), so the upline
    // has no group sales from it — and no statement to show it.
    expect(r.statements.find(s => s.staffId === 'ta')?.overrideCommission ?? 0).toBe(0)
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

// ─── An old bill topped up: commission only (2026-11-07) ────────────────────

describe('an old bill topped up pays its holder commission only (2026-11-07)', () => {
  // A departed salesperson's March bill whose top-up rs collected in July:
  // RM 10,000 that earns — a KPI pillow among it, uncosted, so its margin is
  // not known yet and no penalty can be read.
  const oldBill = (opts: { paidAmount?: number } = {}): SalesOrder => ({
    ...order('old', 'rs', [
      ['MATTRESS', 'M1', 1, 9_900, 9_000],
      ['ACC', 'AK-CS AIRLOFT COMFY PIL', 2, 100],
    ], { date: '2026-03-14', periodMonth: '2026-07-01', ...opts }),
    commissionOnly: true,
  })
  const own = order('own', 'rs', [['MATTRESS', 'M2', 1, 4_000]])
  const without = run({ orders: [own] })
  const withOld = run({ orders: [own, oldBill()] })

  it('pays the rate on everything on it that earns, one line', () => {
    const line = find(withOld.statements, 'rs').lines.filter(l => l.sourceOrderId === 'old')
    expect(line).toEqual([expect.objectContaining({ component: 'product_revenue', basisAmount: 10_000, rate: 0.05, amount: 500 })])
    expect(line[0].note).toMatch(/old bill, commission only$/)
    expect(find(withOld.statements, 'rs').productCommission).toBe(find(without.statements, 'rs').productCommission + 500)
    expect(find(withOld.statements, 'rs').totalCommission).toBe(find(without.statements, 'rs').totalCommission + 500)
  })

  it('is no sale of theirs: no revenue, group sales, margin or KPI moves', () => {
    const a = find(without.statements, 'rs')
    const b = find(withOld.statements, 'rs')
    for (const key of ['productRevenue', 'penaltyWeightedRevenue', 'groupRevenue', 'excludedRevenue', 'deferredRevenue',
      'kpiQty', 'kpiBase', 'kpiCommission', 'marginRevenue', 'marginCost', 'marginPct', 'marginBandKey', 'marginIncentive'] as const) {
      expect(b[key], key).toEqual(a[key])
    }
    expect(b.marginByBrand).toEqual(a.marginByBrand)
    expect(withOld.penalised.filter(p => p.orderId === 'old')).toEqual([])
  })

  it('pays no upline an override on it', () => {
    for (const staffId of ['ta', 'tl', 'stl']) {
      expect(find(withOld.statements, staffId)).toEqual(find(without.statements, staffId))
    }
  })

  it('waits on its deposit like any bill', () => {
    const r = run({ orders: [oldBill({ paidAmount: 1_000 })] })
    expect(r.deferred.map(d => d.orderId)).toEqual(['old'])
    expect(r.statements.find(s => s.staffId === 'rs')?.productCommission ?? 0).toBe(0)
  })

  // The user, told the old bill paid its rate whatever its margin: "need follow the margin as well".
  it('is cut by its margin as any bill is, and stays out of the month’s margin', () => {
    // 26% on Akemi's ladder: Below margin Tier 1, half the commission.
    const thin: SalesOrder = { ...order('thin', 'rs', [['MATTRESS', 'M1', 1, 10_000, 7_400]], { date: '2026-03-14', periodMonth: '2026-07-01' }), commissionOnly: true }
    const r = run({ orders: [own, thin] })
    const line = find(r.statements, 'rs').lines.find(l => l.sourceOrderId === 'thin')!
    expect(line).toMatchObject({ basisAmount: 10_000, rate: 0.05, amount: 250 })
    expect(line.note).toMatch(/Below margin Tier 1 \(26% margin\) × 0\.5 · old bill, commission only$/)
    expect(r.penalised.filter(p => p.orderId === 'thin')).toEqual([expect.objectContaining({ bandKey: 'below_tier_1', multiplier: 0.5, withheld: 250 })])
    expect(find(r.statements, 'rs').marginPenaltyWithheld).toBe(find(without.statements, 'rs').marginPenaltyWithheld + 250)
    // …and is no part of the month's margin, nor of what the upline overrides.
    expect(find(r.statements, 'rs').marginByBrand).toEqual(find(without.statements, 'rs').marginByBrand)
    expect(find(r.statements, 'rs').penaltyWeightedRevenue).toBe(find(without.statements, 'rs').penaltyWeightedRevenue)
  })

  it('a director’s is paid at their rung’s rate, unscaled, as their own bills are', () => {
    const RD: Rank = {
      rankKey: 'rd_12', titleId: 'title-rd', titleLabel: 'Revenue Director', label: 'Rank SS', productRate: 0.12,
      canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 70,
    }
    const thin: SalesOrder = { ...order('thin', 'director', [['MATTRESS', 'M1', 1, 10_000, 7_400]], { date: '2026-03-14', periodMonth: '2026-07-01' }), commissionOnly: true }
    const r = run({
      ranks: [...RANKS, RD], orders: [thin], departmentHeadIds: ['director'],
      directors: [{ staffId: 'director', rankKey: 'rd_12', fixedAmount: 0, salesThreshold: null, incentiveAmount: 0 }],
    })
    expect(find(r.statements, 'director').lines.map(l => [l.sourceOrderId, l.amount])).toEqual([['thin', 1_200]])
    expect(find(r.statements, 'director').productRevenue).toBe(0)
    expect(r.penalised).toEqual([])
  })
})

// ─── A bill cut for its margin counts the sales its commission is (2026-11-07) ─
// The user: "只要是 drop com 的情况也是一样的 … 原本 1 万块的 total sales order 也只是算
// 5,000 块的 sales。当然 commission 还是一样算 1 万块的 50%"; asked where: "连升级业绩也打折".

describe('a bill cut for its margin counts the sales its commission is (2026-11-07)', () => {
  // 26% on Akemi's ladder: Below margin Tier 1 — half the commission, and half the sales.
  const thin = (id: string, amount: number) => order(id, 'rs', [['MATTRESS', 'M1', 1, amount, amount * 0.74]])
  const good = (id: string, amount: number) => order(id, 'rs', [['MATTRESS', 'M1', 1, amount, amount * 0.6]])

  it('counts half its sales where it pays half its commission', () => {
    const rs = find(run({ orders: [thin('1', 10_000)] }).statements, 'rs')
    expect(rs.productRevenue).toBe(5_000)
    expect(rs.penaltyWeightedRevenue).toBe(5_000)
    expect(rs.productCommission).toBe(250)
  })

  it('counts so in the upline’s group sales', () => {
    const r = run({ orders: [thin('1', 10_000), good('2', 10_000)] })
    expect(find(r.statements, 'rs').groupRevenue).toBe(15_000)
    expect(find(r.statements, 'ta').groupRevenue).toBe(15_000)
  })

  it('and in a promotion: RM 400,000 at half commission is RM 200,000, short of a Team Assistant’s 300,000', () => {
    const hierarchy = [node('rs', null, 'rs_6', 'variable')]
    expect(find(run({ hierarchy, orders: [good('1', 400_000)] }).statements, 'rs').effectiveRankKey).toBe('ta_7')
    expect(find(run({ hierarchy, orders: [thin('1', 400_000)] }).statements, 'rs').effectiveRankKey).toBe('rs_6')
  })

  it('cuts nothing while the penalty is off, nor a bill with no margin yet, nor a head’s own bill', () => {
    const off = run({ scheme: { ...SCHEME, enableMarginPenalty: false }, orders: [thin('1', 10_000)] })
    expect(find(off.statements, 'rs').productRevenue).toBe(10_000)
    expect(find(run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])] }).statements, 'rs').productRevenue).toBe(10_000)
    const head = run({ orders: [{ ...thin('1', 10_000), staffId: 'director' }], departmentHeadIds: ['director'] })
    expect(find(head.statements, 'director').productRevenue).toBe(10_000)
  })
})

// 2026-11-08 (Product List › GWP — the user: "dullop mattress ecobliss, set a gwp 2 micorfibre pillow. so the margin
// calculator and margin leader will not calculate the cost in for those 2 pillow. is jsut calculate the mattress cost
// only"): a line's part given with a purchase leaves the margin's cost, worked out on the whole bill.
describe('a gift with purchase leaves the margin (2026-11-08)', () => {
  const groupIndex = indexItemGroups(ITEM_GROUPS)
  const ECO: GwpRule = { id: 'eco', buy: ['ECOBLISS (Q)'], gifts: [{ code: 'MF PILLOW', perUnit: 2 }] }
  const bill = (pillows: number, pillowCost: number | undefined) =>
    withGwp(order('g1', 'rs', [
      ['MATTRESS', 'ECOBLISS (Q)', 1, 3_000, 1_400, 'AKEMI'],
      ['ACC', 'MF PILLOW', pillows, 0, pillowCost, 'AKEMI'],
    ]), [ECO])

  it('costs the mattress alone while the pillows are within the allowance', () => {
    const base = marginBase(bill(2, 70).lines, indexKpiItems([]), groupIndex, 0.7, 'AKEMI')
    expect(base.cost).toBe(2_000) // 1,400 ÷ 0.7; the two pillows 0
    expect(base.complete).toBe(true)
    const plain = marginBase(order('g0', 'rs', [
      ['MATTRESS', 'ECOBLISS (Q)', 1, 3_000, 1_400, 'AKEMI'],
      ['ACC', 'MF PILLOW', 2, 0, 70, 'AKEMI'],
    ]).lines, indexKpiItems([]), groupIndex, 0.7, 'AKEMI')
    expect(plain.cost).toBe(2_100)
  })

  it('counts the pillows past it, and holds the bill only for a part not given', () => {
    // Three pillows at 35 each: one counts, 35 ÷ 0.7 = 50.
    expect(marginBase(bill(3, 105).lines, indexKpiItems([]), groupIndex, 0.7, 'AKEMI').cost).toBe(2_050)
    // Two with no cost yet are wholly given: the margin is known.
    expect(marginBase(bill(2, undefined).lines, indexKpiItems([]), groupIndex, 0.7, 'AKEMI').complete).toBe(true)
    // Three with no cost: one is not given, so the bill waits for it.
    expect(marginBase(bill(3, undefined).lines, indexKpiItems([]), groupIndex, 0.7, 'AKEMI').complete).toBe(false)
  })

  it('marks the given part on the bill, every month alike (a GWP has no dates)', () => {
    expect(bill(2, 70).lines.find(l => l.productCode === 'MF PILLOW')?.gwpFree).toBe(1)
    expect(bill(2, 70).lines.find(l => l.productCode === 'ECOBLISS (Q)')?.gwpFree).toBeUndefined()
    expect(withGwp(bill(2, 70), []).lines.find(l => l.productCode === 'MF PILLOW')?.gwpFree).toBe(1)
  })

  it('keeps each holder of a shared bill on the same part', () => {
    const [owner, other] = splitOrdersByShares([bill(3, 105)], [{ orderId: 'g1', staffId: 'rs2', pct: 0.5 }])
    for (const part of [owner, other]) {
      expect(part.lines.find(l => l.productCode === 'MF PILLOW')?.gwpFree).toBeCloseTo(2 / 3, 10)
    }
    const costOf = (o: SalesOrder) => marginBase(o.lines, indexKpiItems([]), groupIndex, 0.7, 'AKEMI').cost
    expect(costOf(owner) + costOf(other)).toBeCloseTo(2_050, 2)
  })

  it('reads the rows as the loader hands them, each gift with its quantity', () => {
    expect(toGwpRules([
      { id: 'g', catalogue_gwp_items: [
        { role: 'buy', product_code: 'ECOBLISS (Q)', qty: null },
        { role: 'gift', product_code: 'MF PILLOW', qty: '2' },
        { role: 'gift', product_code: 'MP (Q)', qty: 1 },
      ] },
      { id: 'h', catalogue_gwp_items: [{ role: 'buy', product_code: 'X' }] },
      // A gift with no quantity gives nothing: the GWP has no gift.
      { id: 'k', catalogue_gwp_items: [{ role: 'buy', product_code: 'X' }, { role: 'gift', product_code: 'Y' }] },
    ])).toEqual([{ id: 'g', buy: ['ECOBLISS (Q)'], gifts: [{ code: 'MF PILLOW', perUnit: 2 }, { code: 'MP (Q)', perUnit: 1 }] }])
  })
})

// 2026-11-10 (Comm Cal › a bill's menu › Half comm — the user: "commission value 5000, commission percentage 6%;
// commission get RM300, 当我按了 half comm 就会是 total commission RM150"; and asked the rest: the upline's override on
// it halved too, its sales counted in full, its KPI items paid in full).
describe('half comm halves what a bill pays, never its sales (2026-11-10)', () => {
  // A 6% Specialist under the 7% Team Assistant, under the 9% Team Leader.
  const SIX: HierarchyNode[] = [node('tl', null, 'tl_9'), node('ta', 'tl', 'ta_7'), node('rs', 'ta', 'rs_6')]
  const halfComm = (o: SalesOrder): SalesOrder => ({ ...o, halfComm: true })
  const bill = (id: string, amount: number) => order(id, 'rs', [['MATTRESS', 'M1', 1, amount]])

  it('pays RM 5,000 at 6% RM 150, not RM 300 — and says half comm on the line', () => {
    const full = find(run({ hierarchy: SIX, orders: [bill('1', 5_000)] }).statements, 'rs')
    expect(full.productCommission).toBe(300)
    const rs = find(run({ hierarchy: SIX, orders: [halfComm(bill('1', 5_000))] }).statements, 'rs')
    expect(rs.productCommission).toBe(150)
    expect(rs.totalCommission).toBe(150)
    expect(rs.lines.find(l => l.component === 'product_revenue')).toMatchObject({
      basisAmount: 5_000, rate: 0.06, amount: 150, note: 'SO-1 · 2026-07-06 · half comm',
    })
  })

  it('halves the override up the line on it', () => {
    const r = run({ hierarchy: SIX, orders: [halfComm(bill('1', 5_000))] })
    expect(find(r.statements, 'ta').overrideCommission).toBe(25) // (7 − 6)% of 5,000 = 50, halved
    expect(find(r.statements, 'tl').overrideCommission).toBe(50) // (9 − 7)% of 5,000 = 100, halved
    expect(find(r.statements, 'rs').penaltyWeightedRevenue).toBe(2_500)
  })

  it('counts its sales in full — own, group, and the rung they climb', () => {
    const r = run({ hierarchy: SIX, orders: [halfComm(bill('1', 5_000))] })
    expect(find(r.statements, 'rs').productRevenue).toBe(5_000)
    expect(find(r.statements, 'ta').groupRevenue).toBe(5_000)
    expect(find(r.statements, 'tl').groupRevenue).toBe(5_000)
    // RM 300,000 of group sales lifts a variable 6% to Team Assistant whether or not the bill pays half.
    const variable = [node('rs', null, 'rs_6', 'variable')]
    expect(find(run({ hierarchy: variable, orders: [halfComm(bill('1', 300_000))] }).statements, 'rs').effectiveRankKey).toBe('ta_7')
  })

  it('pays its KPI items in full', () => {
    const o = halfComm(order('1', 'rs', [['MATTRESS', 'M1', 1, 5_000], ['ACC', 'AK-CS AIRLOFT COMFY PIL', 2, 100]]))
    const rs = find(run({ hierarchy: SIX, orders: [o] }).statements, 'rs')
    expect(rs.kpiCommission).toBe(100) // 2 × RM 50, whole
    expect(rs.productCommission).toBe(150) // 5,000 × 6%, halved
  })

  it('halves after the margin cut, and the penalty withheld is the margin’s alone', () => {
    // 26% on Akemi's ladder: Below margin Tier 1 × 0.5 — RM 10,000 at 6% is 600 → 300, then half comm → 150.
    const thin = halfComm(order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 7_400]]))
    const r = run({ hierarchy: SIX, orders: [thin] })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(150)
    expect(rs.marginPenaltyWithheld).toBe(300)
    expect(rs.productRevenue).toBe(5_000) // the margin's cut, as before — half comm cuts no sales
    expect(r.penalised[0].withheld).toBe(300)
    expect(rs.lines.find(l => l.component === 'product_revenue')?.note).toMatch(/× 0\.5 · half comm$/)
  })

  it('halves each holder’s part of a shared bill', () => {
    const parts = splitOrdersByShares([halfComm(bill('1', 10_000))], [{ orderId: '1', staffId: 'ta', pct: 0.5 }])
    const r = run({ hierarchy: SIX, orders: parts })
    expect(find(r.statements, 'rs').productCommission).toBe(150) // 5,000 × 6%, halved
    expect(find(r.statements, 'ta').productCommission).toBe(175) // 5,000 × 7%, halved
    expect(find(r.statements, 'rs').productRevenue).toBe(5_000)
  })

  it('halves a director’s own bill too, and an old bill topped up', () => {
    const head = run({
      hierarchy: SIX, departmentHeadIds: ['director'],
      directors: [{ staffId: 'director', rankKey: 'rs_6', fixedAmount: 0, salesThreshold: null, incentiveAmount: 0 }],
      orders: [{ ...halfComm(bill('1', 5_000)), staffId: 'director' }],
    })
    expect(find(head.statements, 'director').productCommission).toBe(150)
    expect(find(head.statements, 'director').productRevenue).toBe(5_000)
    const old = run({ hierarchy: SIX, orders: [{ ...halfComm(bill('1', 5_000)), commissionOnly: true }] })
    expect(find(old.statements, 'rs').productCommission).toBe(150)
  })

  it('leaves a bill without it as it was', () => {
    const r = run({ hierarchy: SIX, orders: [bill('1', 5_000), halfComm(bill('2', 5_000))] })
    expect(find(r.statements, 'rs').productCommission).toBe(450) // 300 + 150
    expect(find(r.statements, 'rs').productRevenue).toBe(10_000)
  })
})

// 2026-11-14 (Comm Cal › a bill's menu › Don't count this bill… › No commission — the user: "Down count（HR 那边）我觉得
// 要分为两种：1. 一种是指完全不出 commission，但他还是有算在 revenue，还有算在 margin 等等"; asked who else goes unpaid,
// with the RM example these tests use — RM 10,000 at 6% = RM 600, the leader's 2% override RM 200 — "整张单谁都不拿钱").
describe('no commission: nobody is paid on a bill that still counts (2026-11-14)', () => {
  // A 6% Specialist under the 7% Team Assistant, under the 9% Team Leader (2% over the Team Assistant).
  const SIX: HierarchyNode[] = [node('tl', null, 'tl_9'), node('ta', 'tl', 'ta_7'), node('rs', 'ta', 'rs_6')]
  const noComm = (o: SalesOrder): SalesOrder => ({ ...o, noCommission: true })
  const bill = (id: string, amount: number) => order(id, 'rs', [['MATTRESS', 'M1', 1, amount]])

  it('pays RM 10,000 at 6% nothing, not RM 600 — no line at all', () => {
    expect(find(run({ hierarchy: SIX, orders: [bill('1', 10_000)] }).statements, 'rs').productCommission).toBe(600)
    const rs = find(run({ hierarchy: SIX, orders: [noComm(bill('1', 10_000))] }).statements, 'rs')
    expect(rs.productCommission).toBe(0)
    expect(rs.totalCommission).toBe(0)
    expect(rs.lines.filter(l => l.sourceOrderId === '1')).toEqual([])
  })

  it('pays no override up the line on it — the leader’s RM 200 is nothing', () => {
    const paid = run({ hierarchy: SIX, orders: [bill('1', 10_000)] })
    expect(find(paid.statements, 'tl').overrideCommission).toBe(200) // (9 − 7)% of 10,000
    const r = run({ hierarchy: SIX, orders: [noComm(bill('1', 10_000))] })
    expect(find(r.statements, 'ta').overrideCommission).toBe(0)
    expect(find(r.statements, 'tl').overrideCommission).toBe(0)
    expect(find(r.statements, 'rs').penaltyWeightedRevenue).toBe(0)
  })

  it('counts its sales in full — own, group, and the rung they climb', () => {
    const r = run({ hierarchy: SIX, orders: [noComm(bill('1', 10_000))] })
    expect(find(r.statements, 'rs').productRevenue).toBe(10_000)
    expect(find(r.statements, 'ta').groupRevenue).toBe(10_000)
    expect(find(r.statements, 'tl').groupRevenue).toBe(10_000)
    // RM 300,000 of group sales lifts a variable 6% to Team Assistant — and the 7% pays on the bills that pay.
    const variable = [node('rs', null, 'rs_6', 'variable')]
    const lifted = find(run({ hierarchy: variable, orders: [noComm(bill('1', 300_000)), bill('2', 10_000)] }).statements, 'rs')
    expect(lifted.effectiveRankKey).toBe('ta_7')
    expect(lifted.productCommission).toBe(700) // 7% of the RM 10,000 that pays
  })

  it('counts in the month’s margin', () => {
    const r = run({ hierarchy: SIX, orders: [noComm(order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 6_000]]))] })
    const rs = find(r.statements, 'rs')
    expect(rs.marginRevenue).toBe(10_000)
    expect(rs.marginCost).toBe(6_000)
    expect(rs.marginPct).toBeCloseTo(0.4)
  })

  it('pays nothing for its KPI items — and still counts them on the ladder', () => {
    // 6 items on a bill that pays + 4 on one that pays nothing = 10, the ladder's +20% — on the 6 paid only.
    const paying = order('1', 'rs', [['MATTRESS', 'M1', 1, 5_000], ['ACC', 'AK-CS AIRLOFT COMFY PIL', 6, 0]])
    const none = noComm(order('2', 'rs', [['MATTRESS', 'M1', 1, 5_000], ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0]]))
    const rs = find(run({ hierarchy: SIX, orders: [paying, none] }).statements, 'rs')
    expect(rs.kpiQty).toBe(10)
    expect(rs.kpiThresholdPct).toBe(0.2)
    expect(rs.kpiBase).toBe(300) // 6 × RM 50
    expect(rs.kpiCommission).toBe(360) // 300 + 20%
    expect(rs.lines.filter(l => l.sourceOrderId === '2')).toEqual([])
    // Without the bill that pays nothing, 6 items climb no rung.
    expect(find(run({ hierarchy: SIX, orders: [paying] }).statements, 'rs').kpiThresholdPct).toBe(0)
  })

  it('takes no penalty and records none — its sales are cut by its margin as any bill’s', () => {
    // 26% on Akemi's ladder: Below margin Tier 1 × 0.5.
    const thin = noComm(order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 7_400]]))
    const r = run({ hierarchy: SIX, orders: [thin] })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(0)
    expect(rs.marginPenaltyWithheld).toBe(0)
    expect(r.penalised).toEqual([])
    expect(rs.productRevenue).toBe(5_000)
  })

  it('wins over half comm — nothing is left to halve', () => {
    const both = { ...noComm(bill('1', 10_000)), halfComm: true }
    const r = run({ hierarchy: SIX, orders: [both] })
    expect(find(r.statements, 'rs').productCommission).toBe(0)
    expect(find(r.statements, 'tl').overrideCommission).toBe(0)
  })

  it('pays no holder’s part of a shared bill', () => {
    const parts = splitOrdersByShares([noComm(bill('1', 10_000))], [{ orderId: '1', staffId: 'ta', pct: 0.5 }])
    const r = run({ hierarchy: SIX, orders: parts })
    expect(find(r.statements, 'rs').productCommission).toBe(0)
    expect(find(r.statements, 'ta').productCommission).toBe(0)
    expect(find(r.statements, 'tl').overrideCommission).toBe(0)
    expect(find(r.statements, 'rs').productRevenue).toBe(5_000)
  })

  it('pays nothing on a director’s own bill, nor on an old bill topped up', () => {
    const head = run({
      hierarchy: SIX, departmentHeadIds: ['director'],
      directors: [{ staffId: 'director', rankKey: 'rs_6', fixedAmount: 0, salesThreshold: null, incentiveAmount: 0 }],
      orders: [{ ...noComm(bill('1', 5_000)), staffId: 'director' }],
    })
    expect(find(head.statements, 'director').productCommission).toBe(0)
    expect(find(head.statements, 'director').productRevenue).toBe(5_000)
    const old = run({ hierarchy: SIX, orders: [{ ...noComm(bill('1', 5_000)), commissionOnly: true }] })
    expect(old.statements.find(s => s.staffId === 'rs')?.productCommission ?? 0).toBe(0)
  })

  it('leaves a bill without it as it was', () => {
    const r = run({ hierarchy: SIX, orders: [bill('1', 10_000), noComm(bill('2', 10_000))] })
    expect(find(r.statements, 'rs').productCommission).toBe(600)
    expect(find(r.statements, 'rs').productRevenue).toBe(20_000)
    expect(find(r.statements, 'tl').overrideCommission).toBe(200)
  })
})

describe('a brand with its own scheme — 2990s (2026-11-11)', () => {
  // The user's list: Team Leader 8%, Senior Team Assistant 7%, Team Assistant 6%,
  // Senior Revenue Specialist 5%, Revenue Specialist 4% — each a point under Fair's.
  const RATES_2990S: Record<string, number> = { rs_5: 0.04, rs_6: 0.05, ta_7: 0.06, ta_8: 0.07, tl_9: 0.08 }
  const LADDER: Rank[] = RANKS.map(r => (r.rankKey in RATES_2990S ? { ...r, brandRates: { '2990S': RATES_2990S[r.rankKey] } } : r))
  const OWN = { ranks: LADDER, ownSchemeBrands: ['2990S'] }
  const TEAM: HierarchyNode[] = [node('tl', null, 'tl_9'), node('ta', 'tl', 'ta_7'), node('rs', 'ta', 'rs_5')]
  const NO_MARGIN_PAY: CommissionScheme = { ...SCHEME, enableMarginPenalty: false, enableMarginIncentive: false }
  const sofa = (id: string, staffId: string, amount: number, opts: OrderOpts = {}) =>
    order(id, staffId, [['SOFA', 'BOOQIT-2A(RHF)', 1, amount]], { brandCode: '2990S', ...opts })

  it('pays each rung its rate for the brand, not its own', () => {
    for (const [rankKey, rate] of Object.entries(RATES_2990S)) {
      const r = run({ ...OWN, hierarchy: [node('a', null, rankKey)], orders: [sofa('1', 'a', 10_000)] })
      const a = find(r.statements, 'a')
      expect(a.productCommission).toBeCloseTo(10_000 * rate, 2)
      expect(a.lines.find(l => l.component === 'product_revenue')).toMatchObject({
        basisAmount: 10_000, rate, brandCode: '2990S', note: 'SO-1 · 2026-07-06 · 2990S rate',
      })
      expect(r.warnings).toEqual([])
    }
  })

  it('pays the override up the line on the brand’s own rates', () => {
    // RS 4% (own) · TA 6% − 4% · TL 8% − 6%: RM 10,000 pays 400 + 200 + 200 — 8% in all, the brand's top rate.
    const r = run({ ...OWN, hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000)] })
    expect(find(r.statements, 'rs').productCommission).toBe(400)
    expect(find(r.statements, 'ta').overrideCommission).toBe(200)
    expect(find(r.statements, 'tl').overrideCommission).toBe(200)
    expect(r.totalCommission).toBe(800)
    const line = find(r.statements, 'ta').lines.find(l => l.component === 'override')
    expect(line).toMatchObject({
      sourceStaffId: 'rs', basisAmount: 10_000, amount: 200, brandCode: '2990S',
      note: 'Override on downline rs · 2% differential · 2990S',
    })
    expect(line?.rate).toBeCloseTo(0.02, 10)
  })

  it('keeps a brand’s bills apart from the rest up the line — each at the rates it was paid at', () => {
    // A ladder where the gap differs: the Team Assistant's 2990s rate is 6.5%.
    const ladder = LADDER.map(r => (r.rankKey === 'ta_7' ? { ...r, brandRates: { '2990S': 0.065 } } : r))
    const akemi = order('2', 'rs', [['MATTRESS', 'M1', 1, 10_000]], { brandCode: 'AKEMI' })
    const r = run({ ranks: ladder, ownSchemeBrands: ['2990S'], hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000), akemi], scheme: NO_MARGIN_PAY })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(900) // 10,000 × 5% + 10,000 × 4%
    expect(rs.penaltyWeightedRevenue).toBe(20_000)
    const overrides = find(r.statements, 'ta').lines.filter(l => l.component === 'override')
    expect(overrides.map(l => [l.brandCode ?? '', l.basisAmount, l.amount])).toEqual([
      ['', 10_000, 200], // 7% − 5% of the Akemi bill
      ['2990S', 10_000, 250], // 6.5% − 4% of the 2990s one
    ])
    // The Team Leader over them: 9% − 7% of the Akemi bill, 8% − 6.5% of the 2990s one.
    expect(find(r.statements, 'tl').overrideCommission).toBe(350)
  })

  it('counts its sales like any bill — own, group, and the rung they climb', () => {
    const r = run({ ...OWN, hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000)] })
    expect(find(r.statements, 'rs').productRevenue).toBe(10_000)
    expect(find(r.statements, 'ta').groupRevenue).toBe(10_000)
    expect(find(r.statements, 'tl').groupRevenue).toBe(10_000)
    // RM 300,000 of 2990s alone lifts a variable 6% to Team Assistant — and is paid that rung's 2990s rate, 6%.
    const variable = run({ ...OWN, hierarchy: [node('rs', null, 'rs_6', 'variable')], orders: [sofa('1', 'rs', 300_000)] })
    expect(find(variable.statements, 'rs').effectiveRankKey).toBe('ta_7')
    expect(find(variable.statements, 'rs').productCommission).toBe(18_000)
  })

  it('is in no margin: no penalty, no cost to wait for, none of the month’s margin or its incentive', () => {
    // Akemi at 40% clears Incentive Tier 1 (36%); the 2990s bill has no cost and a margin keyed on it — neither is read.
    const akemi = order('2', 'rs', [['MATTRESS', 'M1', 1, 10_000, 6_000]], { brandCode: 'AKEMI' })
    const r = run({ ...OWN, hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000, { manualMarginPct: 0.1 }), akemi] })
    const rs = find(r.statements, 'rs')
    expect(rs.marginByBrand).toEqual([{ brandCode: 'AKEMI', revenue: 10_000, cost: 6_000, marginPct: 0.4 }])
    expect(rs.marginPct).toBe(0.4)
    expect(rs.marginIncentive).toBe(1_000)
    expect(rs.marginPenaltyWithheld).toBe(0)
    expect(rs.productCommission).toBe(900)
    expect(r.penalised).toEqual([])
    expect(r.warnings).toEqual([])
    // Alone in a month it leaves no margin at all, and nothing to say about it.
    const alone = run({ ...OWN, hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000)] })
    expect(find(alone.statements, 'rs').marginByBrand).toEqual([])
    expect(find(alone.statements, 'rs').marginPct).toBeNull()
    expect(alone.warnings).toEqual([])
  })

  it('carries none of the sub-department’s KPI items', () => {
    const o = order('1', 'rs', [['SOFA', 'BOOQIT-CNR', 1, 5_000], ['ACC', 'AK-CS AIRLOFT COMFY PIL', 2, 100]], { brandCode: '2990S' })
    const rs = find(run({ ...OWN, hierarchy: TEAM, orders: [o] }).statements, 'rs')
    expect(rs.kpiCommission).toBe(0)
    expect(rs.kpiQty).toBe(0)
    expect(rs.productRevenue).toBe(5_100)
    expect(rs.productCommission).toBe(204) // 5,100 × 4%: nothing taken off as KPI
  })

  it('a rung with no rate for the brand pays the nearest rung below that has one', () => {
    // The user's list ends at Team Leader, 8%: a Senior Team Leader's 2990s bill is paid 8%, never Fair's 10%.
    const r = run({ ...OWN, hierarchy: [node('stl', null, 'stl_10'), node('tl', 'stl', 'tl_9')], orders: [sofa('1', 'stl', 10_000), sofa('2', 'tl', 10_000)] })
    expect(find(r.statements, 'stl').productCommission).toBe(800)
    // …and earns no override on a Team Leader's: 8% − 8%.
    expect(find(r.statements, 'stl').overrideCommission).toBe(0)
  })

  it('pays a director’s own bill their rung’s rate for the brand', () => {
    const r = run({
      ...OWN, hierarchy: TEAM, departmentHeadIds: ['director'],
      directors: [{ staffId: 'director', rankKey: 'tl_9', fixedAmount: 0, salesThreshold: null, incentiveAmount: 0 }],
      orders: [sofa('1', 'director', 10_000)],
    })
    expect(find(r.statements, 'director').productCommission).toBe(800)
    expect(find(r.statements, 'director').lines[0].note).toBe("SO-1 · 2026-07-06 · director's own bill · 2990S rate")
  })

  it('takes a drop on one of its bills back at the rate it was paid', () => {
    const drop: SalesOrder = {
      id: 'u1', orderNo: 'DROP 2990-SO-2611-017', staffId: 'rs', orderDate: '2026-07-20', periodMonth: '2026-07-01', eventDate: '2026-07-20',
      orderTotal: -1_000, paidAmount: -1_000, upsale: true, brandCode: '2990S',
      lines: [{ id: 'u1', itemGroup: 'UPSALE', productCode: 'DROP', qty: 1, lineAmount: -1_000, upsale: true }],
    }
    const r = run({ ...OWN, hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000), drop] })
    expect(find(r.statements, 'rs').productCommission).toBe(360) // 400 − 40
    expect(find(r.statements, 'ta').overrideCommission).toBe(180) // 2% of 9,000
  })

  it('pays each holder of a shared bill their own rate for the brand, and halves a half-comm one', () => {
    const parts = splitOrdersByShares([sofa('1', 'rs', 10_000)], [{ orderId: '1', staffId: 'ta', pct: 0.5 }])
    const r = run({ ...OWN, hierarchy: TEAM, orders: parts })
    expect(find(r.statements, 'rs').productCommission).toBe(200) // 5,000 × 4%
    expect(find(r.statements, 'ta').productCommission).toBe(300) // 5,000 × 6%
    const half = run({ ...OWN, hierarchy: TEAM, orders: [{ ...sofa('1', 'rs', 10_000), halfComm: true }] })
    expect(find(half.statements, 'rs').productCommission).toBe(200)
    expect(find(half.statements, 'ta').overrideCommission).toBe(100)
  })

  it('holds a bill under its deposit like any other', () => {
    const r = run({ ...OWN, hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000, { paidAmount: 1_000 })] })
    expect(find(r.statements, 'rs').productCommission).toBe(0)
    expect(find(r.statements, 'rs').deferredRevenue).toBe(10_000)
    expect(r.deferred).toHaveLength(1)
  })

  it('changes nothing while no brand is on its own scheme', () => {
    // The rates are there and the brand is not named: the bill is an ordinary one — the rung's own rate.
    const r = run({ ranks: LADDER, hierarchy: TEAM, orders: [sofa('1', 'rs', 10_000)], scheme: NO_MARGIN_PAY })
    expect(find(r.statements, 'rs').productCommission).toBe(500)
    expect(find(r.statements, 'ta').lines.find(l => l.component === 'override')?.note).toBe('Override on downline rs · 2% differential')
  })

  // 2026-11-12 — the user: "这个 KPI item 是独立的，属于 2990 专属的 KPI item"; "Upgrade fabric RM125/RM250(corner)
  // Bonus RM50 — Upgrade latex seat RM500/RM1000(corner) Bonus by tier (units): 1 - 4 per units RM50; 5-9 per units
  // RM70; 10 above per units RM100"; six in a month are 6 × RM 70; and of the upgrade's money, "升级的钱只拿 bonus".
  describe('its own KPI items (2026-11-12)', () => {
    const FABRIC = { source: 'option' as const, optionPool: 'sofa_specials' as const, optionValue: 'Sofa Full Fabric', label: 'Upgrade fabric', kpiAmount: 50, brandCode: '2990S' }
    const LATEX = {
      source: 'option' as const, optionPool: 'sofa_specials' as const, optionValue: 'Latex Seat', label: 'Upgrade latex seat', kpiAmount: 50, brandCode: '2990S',
      unitTiers: [{ minQty: 5, amount: 70 }, { minQty: 10, amount: 100 }],
    }
    // The sub-department's own item of the same special — and its KPI switched OFF, as Fair's is.
    const OWN_LATEX = { source: 'option' as const, optionPool: 'sofa_specials' as const, optionValue: 'Latex Seat', kpiAmount: 40 }
    const KPI_OFF: CommissionScheme = { ...NO_MARGIN_PAY, enableKpi: false }
    const ITEMS = { ...OWN, scheme: KPI_OFF, kpiItems: [FABRIC, LATEX, OWN_LATEX, ...KPI_ITEMS] }
    // A sofa of two pieces carrying one special; its special order charges `charged` for it, written on each piece.
    const upgraded = (id: string, staffId: string, sofaAmount: number, special: string, charged: number, opts: OrderOpts = {}): SalesOrder => {
      const o = order(id, staffId, [['SOFA', 'TELLUC-2A(LHF)', 1, sofaAmount / 2], ['SOFA', 'TELLUC-L(RHF)', 1, sofaAmount / 2], ['TRANS', 'SVC-DELIVERY', 1, 250]], { brandCode: '2990S', ...opts })
      return {
        ...o,
        lines: o.lines.map(l => (l.itemGroup === 'SOFA'
          ? { ...l, specials: [special], ...(charged > 0 ? { specialMoney: { [special.toLowerCase()]: charged } } : {}) }
          : l)),
      }
    }

    it('the user’s bill: RM 3,240 (sofa 2,990 + fabric 250) at 4% is 2,990 × 4% + RM 50 = RM 169.60', () => {
      const r = run({ ...ITEMS, hierarchy: TEAM, orders: [upgraded('1', 'rs', 3_240, 'Sofa Full Fabric', 250)] })
      const rs = find(r.statements, 'rs')
      expect(rs.productRevenue).toBe(2_990)
      expect(rs.productCommission).toBe(119.6)
      expect(rs.kpiCommission).toBe(50)
      expect(rs.totalCommission).toBe(169.6)
      expect(rs.lines.find(l => l.component === 'kpi_item')).toMatchObject({
        sourceOrderId: '1', basisAmount: 250, qty: 1, amount: 50, brandCode: '2990S',
        note: 'SO-1 · Upgrade fabric × 1 @ 50 · 250.00 off its sales',
      })
      expect(r.warnings).toEqual([])
    })

    it('is paid whatever the sub-department’s KPI switch says, and is no part of its quantity ladder', () => {
      for (const enableKpi of [false, true]) {
        // Ten latex seats: far past the sub-department's own 10-unit ladder (+20%).
        const orders = Array.from({ length: 10 }, (_, i) => upgraded(String(i + 1), 'rs', 3_740, 'Latex Seat', 500))
        const rs = find(run({ ...ITEMS, scheme: { ...KPI_OFF, enableKpi }, hierarchy: TEAM, orders }).statements, 'rs')
        expect(rs.kpiCommission).toBe(1_000) // 10 × RM 100
        expect([rs.kpiQty, rs.kpiBase, rs.kpiThresholdPct]).toEqual([0, 0, 0])
        expect(rs.lines.filter(l => l.component === 'kpi_threshold')).toEqual([])
        expect(rs.productRevenue).toBe(32_400) // 10 × (3,740 − 500)
      }
    })

    it('pays every unit of the month at the tier the month reaches — the tier is whole', () => {
      const month = (units: number) => {
        const orders = Array.from({ length: units }, (_, i) => upgraded(String(i + 1), 'rs', 3_740, 'Latex Seat', 500))
        return find(run({ ...ITEMS, hierarchy: TEAM, orders }).statements, 'rs')
      }
      expect(month(1).kpiCommission).toBe(50)
      expect(month(4).kpiCommission).toBe(200) // 4 × 50
      expect(month(5).kpiCommission).toBe(350) // 5 × 70
      expect(month(6).kpiCommission).toBe(420) // the user's: 6 × 70, never 4 × 50 + 2 × 70
      expect(month(9).kpiCommission).toBe(630)
      expect(month(10).kpiCommission).toBe(1_000) // 10 × 100
      expect(month(6).lines.filter(l => l.component === 'kpi_item')[0].note)
        .toBe('SO-1 · Upgrade latex seat × 1 @ 70 (6 this month) · 500.00 off its sales')
    })

    it('counts each item on its own: fabric has no tier and moves none of latex’s', () => {
      const orders = [
        ...Array.from({ length: 4 }, (_, i) => upgraded(`L${i}`, 'rs', 3_740, 'Latex Seat', 500)),
        ...Array.from({ length: 6 }, (_, i) => upgraded(`F${i}`, 'rs', 3_240, 'Sofa Full Fabric', 250)),
      ]
      const rs = find(run({ ...ITEMS, hierarchy: TEAM, orders }).statements, 'rs')
      expect(rs.kpiCommission).toBe(500) // 4 × 50 + 6 × 50
    })

    it('counts a person’s own units: a colleague’s do not lift their tier', () => {
      const orders = [
        ...Array.from({ length: 3 }, (_, i) => upgraded(`A${i}`, 'rs', 3_740, 'Latex Seat', 500)),
        ...Array.from({ length: 3 }, (_, i) => upgraded(`B${i}`, 'ta', 3_740, 'Latex Seat', 500)),
      ]
      const r = run({ ...ITEMS, hierarchy: TEAM, orders })
      expect(find(r.statements, 'rs').kpiCommission).toBe(150)
      expect(find(r.statements, 'ta').kpiCommission).toBe(150)
    })

    it('pays the upline no override on the upgrade’s money', () => {
      const r = run({ ...ITEMS, hierarchy: TEAM, orders: [upgraded('1', 'rs', 3_240, 'Sofa Full Fabric', 250)] })
      // TA 6% − RS 4% on the 2,990 that earned commission.
      expect(find(r.statements, 'ta').lines.find(l => l.component === 'override')).toMatchObject({ basisAmount: 2_990, amount: 59.8, brandCode: '2990S' })
    })

    // 2026-11-13 — the user: "不需要去 detect 他有没有收钱" (the price is sometimes written in the remark). Until then
    // an upgrade the special order charged nothing for was no unit.
    it('finds it wherever the bill names it: one the special order charges nothing for pays the bonus beside the whole bill', () => {
      const unpriced = upgraded('1', 'rs', 2_990, 'Latex Seat', 0)
      const rs = find(run({ ...ITEMS, hierarchy: TEAM, orders: [unpriced] }).statements, 'rs')
      expect(rs.kpiCommission).toBe(50)
      expect(rs.productCommission).toBe(119.6) // the whole 2,990 at 4% — nothing is known to take off
      expect(rs.totalCommission).toBe(169.6)
      // …and it counts in the month's units, with the ones that charged: five latex seats pay RM 70 each.
      const five = [unpriced, ...['2', '3', '4', '5'].map(id => upgraded(id, 'rs', 3_490, 'Latex Seat', 500))]
      expect(find(run({ ...ITEMS, hierarchy: TEAM, orders: five }).statements, 'rs').kpiCommission).toBe(350)
    })

    // 2026-11-14 — the user: "我只需要像 Fair 一样选 KPI 就好，不需要去选它的 cost"; "by model、by special 或者是 by
    // compartment"; what comes off is what the bill charged ("扣掉再发 bonus"), a compartment once a set ("每组沙发算 1
    // 个"). The cost and the corner cost of the two days before are no longer read (20261114230000).
    describe('of every kind (2026-11-14) — what the bill charged comes off', () => {
      const BOAAT = { source: 'option' as const, optionPool: 'models' as const, optionValue: 'Boaat', kpiAmount: 40, brandCode: '2990S' }
      const CNR = { source: 'option' as const, optionPool: 'compartments' as const, optionValue: 'CNR', kpiAmount: 30, brandCode: '2990S' }
      const EZ = {
        source: 'option' as const, optionPool: 'sofa_fabric_series' as const, optionValue: 'EZ', label: 'EZ · Sofa fabric', kpiAmount: 50, brandCode: '2990S',
      }
      const DELIVERY = { source: 'sku' as const, productCode: 'SVC-DELIVERY', label: 'Delivery', kpiAmount: 5, brandCode: '2990S' }
      const EVERY = { ...ITEMS, kpiItems: [FABRIC, LATEX, BOAAT, CNR, EZ, DELIVERY, OWN_LATEX, ...KPI_ITEMS] }
      const rsOf = (o: SalesOrder, items = EVERY) => find(run({ ...items, hierarchy: TEAM, orders: [o] }).statements, 'rs')
      type Line = SalesOrder['lines'][number]
      const bill = (id: string, lines: Array<[group: string, code: string, qty: number, amount: number]>, more: (l: Line) => Partial<Line> = () => ({})) => {
        const o = order(id, 'rs', lines, { brandCode: '2990S' })
        return { ...o, lines: o.lines.map(l => ({ ...l, ...more(l) })) }
      }

      it('a model: the whole sofa off once, its bonus paid, the override on what is left; a delivery takes nothing off', () => {
        const o = bill('1', [['SOFA', 'BOAAT-2A', 1, 2_000], ['SOFA', 'BOAAT-CNR', 1, 1_000], ['MATTRESS', 'MAT-01', 1, 2_000], ['TRANS', 'SVC-DELIVERY', 1, 250]],
          l => (l.itemGroup === 'SOFA' ? { model: 'Boaat' } : {}))
        const r = run({ ...EVERY, hierarchy: TEAM, orders: [o] })
        const rs = find(r.statements, 'rs')
        // 5,000 commissionable − the Boaat's 3,000 (its corner is the model's) = 2,000 at 4%; RM 40 + the delivery's RM 5.
        expect([rs.productRevenue, rs.productCommission, rs.kpiCommission, rs.totalCommission]).toEqual([2_000, 80, 45, 125])
        expect(rs.lines.filter(l => l.component === 'kpi_item').map(l => [l.basisAmount ?? 0, l.qty ?? 0, l.amount]).sort((a, b) => b[0] - a[0]))
          .toEqual([[3_000, 1, 40], [0, 1, 5]])
        expect(find(r.statements, 'ta').lines.find(l => l.component === 'override')).toMatchObject({ basisAmount: 2_000, amount: 40 })
      })

      it('a compartment: once a sofa set at its corner pieces’ money — a U with two corners one unit, two corner sofas two', () => {
        const u = rsOf(bill('1', [
          ['SOFA', 'XAMMAR-2A(LHF)', 1, 1_500], ['SOFA', 'XAMMAR-CNR', 1, 1_000], ['SOFA', 'XAMMAR-2A', 1, 1_500],
          ['SOFA', 'XAMMAR-CNR', 1, 1_000], ['SOFA', 'XAMMAR-2A(RHF)', 1, 1_500],
        ]))
        // 6,500 − both corners' 2,000 = 4,500 at 4% + RM 30.
        expect([u.productRevenue, u.productCommission, u.kpiCommission, u.totalCommission]).toEqual([4_500, 180, 30, 210])
        const two = rsOf(bill('2', [['SOFA', 'KABBIN-2A(LHF)', 2, 6_000], ['SOFA', 'KABBIN-CNR', 2, 2_000], ['SOFA', 'KABBIN-1A(RHF)', 2, 3_000]]))
        expect([two.productRevenue, two.kpiCommission]).toEqual([9_000, 60])
      })

      it('a fabric series pays its bonus and takes nothing off', () => {
        const rs = rsOf(bill('1', [['SOFA', 'LOTTI-2A', 1, 3_000]], () => ({ fabricSeries: 'EZ' })))
        expect([rs.productRevenue, rs.productCommission, rs.kpiCommission, rs.totalCommission]).toEqual([3_000, 120, 50, 170])
      })

      it('a special takes off what the bill charged for it, more or less — no cost is read any more', () => {
        for (const [total, charged] of [[3_990, 1_000], [3_290, 300], [3_240, 250]]) {
          const rs = rsOf(upgraded('1', 'rs', total, 'Latex Seat', charged), ITEMS)
          expect([rs.productRevenue, rs.kpiCommission]).toEqual([2_990, 50])
        }
      })

      it('counts the month’s units as before: five latex seats pay RM 70 each, charged or not', () => {
        const five = [upgraded('1', 'rs', 3_490, 'Latex Seat', 0), ...['2', '3', '4', '5'].map(id => upgraded(id, 'rs', 3_490, 'Latex Seat', 500))]
        const rs = find(run({ ...ITEMS, hierarchy: TEAM, orders: five }).statements, 'rs')
        expect(rs.kpiCommission).toBe(350)
        // The one charged nothing keeps its whole RM 3,490; the four RM 2,990 each.
        expect(rs.productRevenue).toBe(15_450)
      })
    })

    it('pays nothing where the bill’s sales do not cover what it charged', () => {
      const rs = find(run({ ...ITEMS, hierarchy: TEAM, orders: [upgraded('1', 'rs', 400, 'Latex Seat', 500)] }).statements, 'rs')
      expect(rs.kpiCommission).toBe(0)
      expect(rs.productRevenue).toBe(400)
    })

    it('never finds the brand’s items on another brand’s bill, nor the sub-department’s on its own', () => {
      const akemi = { ...upgraded('1', 'rs', 6_000, 'Latex Seat', 500), brandCode: 'AKEMI' }
      const off = find(run({ ...ITEMS, hierarchy: TEAM, orders: [akemi] }).statements, 'rs')
      expect([off.kpiCommission, off.productRevenue]).toEqual([0, 6_000]) // its own item is switched off
      const on = find(run({ ...ITEMS, scheme: NO_MARGIN_PAY, hierarchy: TEAM, orders: [akemi, upgraded('2', 'rs', 3_740, 'Latex Seat', 500)] }).statements, 'rs')
      // The Akemi bill: the sub-department's Latex Seat, RM 40 off and paid. The 2990s bill: the brand's, RM 500 off, RM 50 paid.
      expect(on.lines.filter(l => l.component === 'kpi_item').map(l => [l.sourceOrderId, l.basisAmount, l.amount])).toEqual([['1', 40, 40], ['2', 500, 50]])
      expect([on.kpiQty, on.kpiBase]).toEqual([1, 40])
      expect(on.productRevenue).toBe(9_200) // 5,960 + 3,240
    })

    it('shares a unit as the bill is shared, and what it charged with it', () => {
      const parts = splitOrdersByShares([upgraded('1', 'rs', 3_240, 'Sofa Full Fabric', 250)], [{ orderId: '1', staffId: 'ta', pct: 0.5 }])
      const r = run({ ...ITEMS, hierarchy: TEAM, orders: parts })
      const [rs, ta] = [find(r.statements, 'rs'), find(r.statements, 'ta')]
      expect([rs.productRevenue, rs.productCommission, rs.kpiCommission]).toEqual([1_495, 59.8, 25]) // half of 2,990 at 4%, half the bonus
      expect([ta.productRevenue, ta.productCommission, ta.kpiCommission]).toEqual([1_495, 89.7, 25]) // …at 6%
    })

    it('leaves a half-comm bill’s bonus whole, and an old bill topped up and a director’s own bill without one', () => {
      const half = find(run({ ...ITEMS, hierarchy: TEAM, orders: [{ ...upgraded('1', 'rs', 3_240, 'Sofa Full Fabric', 250), halfComm: true }] }).statements, 'rs')
      expect([half.productCommission, half.kpiCommission]).toEqual([59.8, 50])
      const old = find(run({ ...ITEMS, hierarchy: TEAM, orders: [{ ...upgraded('1', 'rs', 3_240, 'Sofa Full Fabric', 250), commissionOnly: true }] }).statements, 'rs')
      expect([old.productCommission, old.kpiCommission]).toEqual([129.6, 0]) // the rate on everything that earns, as billed
      const head = run({
        ...ITEMS, hierarchy: TEAM, departmentHeadIds: ['director'],
        directors: [{ staffId: 'director', rankKey: 'tl_9', fixedAmount: 0, salesThreshold: null, incentiveAmount: 0 }],
        orders: [upgraded('1', 'director', 3_240, 'Sofa Full Fabric', 250)],
      })
      expect(find(head.statements, 'director').kpiCommission).toBe(0)
    })

    it('finds none once the brand is no longer on its own scheme', () => {
      const r = run({ ranks: LADDER, scheme: KPI_OFF, kpiItems: [FABRIC, LATEX], hierarchy: TEAM, orders: [upgraded('1', 'rs', 3_240, 'Sofa Full Fabric', 250)] })
      const rs = find(r.statements, 'rs')
      expect([rs.kpiCommission, rs.productRevenue, rs.productCommission]).toEqual([0, 3_240, 162]) // an ordinary bill at 5%
    })
  })
})

describe('brandRateOf — a rung’s rate for a brand with its own scheme', () => {
  const with2990s = (rates: Record<string, number>): Rank[] =>
    RANKS.map(r => (r.rankKey in rates ? { ...r, brandRates: { '2990S': rates[r.rankKey] } } : r))
  const rung = (ladder: Rank[], key: string) => ladder.find(r => r.rankKey === key)

  it('is the rate the rung names, the code read in any case', () => {
    const ladder = with2990s({ rs_5: 0.04, tl_9: 0.08 })
    expect(brandRateOf(rung(ladder, 'rs_5'), '2990s', ladder)).toBe(0.04)
    expect(brandRateOf(rung(ladder, 'tl_9'), ' 2990S ', ladder)).toBe(0.08)
  })

  it('falls back to the nearest rung below that names one', () => {
    const ladder = with2990s({ rs_5: 0.04, ta_7: 0.06, tl_9: 0.08 })
    expect(brandRateOf(rung(ladder, 'rs_6'), '2990S', ladder)).toBe(0.04)
    expect(brandRateOf(rung(ladder, 'ta_8'), '2990S', ladder)).toBe(0.06)
    expect(brandRateOf(rung(ladder, 'stl_10'), '2990S', ladder)).toBe(0.08)
  })

  it('with none below: its own rate, never above the nearest named rate over it', () => {
    const ladder = with2990s({ ta_7: 0.04 })
    expect(brandRateOf(rung(ladder, 'rs_5'), '2990S', ladder)).toBe(0.04) // its own 5%, capped at the Team Assistant's 4%
    const high = with2990s({ ta_7: 0.065 })
    expect(brandRateOf(rung(high, 'rs_5'), '2990S', high)).toBe(0.05)
  })

  it('a brand no rung names a rate for pays every rung its own rate; nobody, nothing', () => {
    expect(brandRateOf(rung(RANKS, 'ta_7'), '2990S', RANKS)).toBe(0.07)
    expect(brandRateOf(undefined, '2990S', RANKS)).toBe(0)
  })
})
