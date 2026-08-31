import { describe, it, expect } from 'vitest'
import {
  classifyLine,
  computeCommissionRun,
  computeGroupRevenue,
  computeOverrides,
  depositRequired,
  indexItemGroups,
  indexKpiItems,
  isDepositMet,
  kpiThresholdPct,
  marginBase,
  marginIncentiveFor,
  marginPctOf,
  orderProductRevenue,
  penaltyBandFor,
  resolveRank,
} from './engine'
import type {
  CommissionScheme,
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
const RANKS: Rank[] = [
  { rankKey: 'rs_5', tierKey: 'revenue_specialist', tierLabel: 'Revenue Specialist', label: 'Revenue Specialist · 5%', productRate: 0.05, canRecruit: false, groupSalesThreshold: null, sortOrder: 10 },
  { rankKey: 'rs_6', tierKey: 'revenue_specialist', tierLabel: 'Revenue Specialist', label: 'Revenue Specialist · 6%', productRate: 0.06, canRecruit: true, groupSalesThreshold: null, sortOrder: 20 },
  { rankKey: 'ta_7', tierKey: 'team_assistant', tierLabel: 'Team Assistant', label: 'Team Assistant · 7%', productRate: 0.07, canRecruit: true, groupSalesThreshold: 300_000, sortOrder: 30 },
  { rankKey: 'ta_8', tierKey: 'team_assistant', tierLabel: 'Team Assistant', label: 'Team Assistant · 8%', productRate: 0.08, canRecruit: true, groupSalesThreshold: null, sortOrder: 40 },
  { rankKey: 'tl_9', tierKey: 'team_leader', tierLabel: 'Team Leader', label: 'Team Leader · 9%', productRate: 0.09, canRecruit: true, groupSalesThreshold: null, sortOrder: 50 },
  { rankKey: 'stl_10', tierKey: 'senior_team_leader', tierLabel: 'Senior Team Leader', label: 'Senior Team Leader · 10%', productRate: 0.10, canRecruit: true, groupSalesThreshold: null, sortOrder: 60 },
]

/**
 * The brand ladder from the user's worked example (2026-08-31). Thresholds are
 * per brand: Acami's incentive Tier 1 is 36% where Zanotti's is 33%.
 */
const ACAMI_BANDS: MarginBand[] = [
  { brandCode: 'ACAMI', bandKey: 'incentive_tier_2', label: 'Incentive Tier 2', kind: 'incentive', marginPct: 0.43, commissionMultiplier: 1, monthlyIncentive: 1_500 },
  { brandCode: 'ACAMI', bandKey: 'incentive_tier_1', label: 'Incentive Tier 1', kind: 'incentive', marginPct: 0.36, commissionMultiplier: 1, monthlyIncentive: 1_000 },
  { brandCode: 'ACAMI', bandKey: 'standard', label: 'Standard margin', kind: 'reference', marginPct: 0.33, commissionMultiplier: 1, monthlyIncentive: 0 },
  { brandCode: 'ACAMI', bandKey: 'low', label: 'Low margin', kind: 'reference', marginPct: 0.30, commissionMultiplier: 1, monthlyIncentive: 0 },
  { brandCode: 'ACAMI', bandKey: 'below_tier_1', label: 'Below margin Tier 1', kind: 'penalty', marginPct: 0.27, commissionMultiplier: 0.5, monthlyIncentive: 0 },
  { brandCode: 'ACAMI', bandKey: 'below_tier_2', label: 'Below margin Tier 2', kind: 'penalty', marginPct: 0.25, commissionMultiplier: 0.25, monthlyIncentive: 0 },
  { brandCode: 'ACAMI', bandKey: 'below_tier_3', label: 'Below margin Tier 3', kind: 'penalty', marginPct: 0.24, commissionMultiplier: 0, monthlyIncentive: 0 },
]

/** Zanotti clears at a lower bar — the reason bands are per brand. */
const ZANOTTI_BANDS: MarginBand[] = [
  { brandCode: 'ZANOTTI', bandKey: 'incentive_tier_1', label: 'Incentive Tier 1', kind: 'incentive', marginPct: 0.33, commissionMultiplier: 1, monthlyIncentive: 1_000 },
  { brandCode: 'ZANOTTI', bandKey: 'below_tier_1', label: 'Below margin Tier 1', kind: 'penalty', marginPct: 0.20, commissionMultiplier: 0.5, monthlyIncentive: 0 },
]

const MARGIN_BANDS = [...ACAMI_BANDS, ...ZANOTTI_BANDS]

const SCHEME: CommissionScheme = {
  openBillBasis: 'uplift_on_commission',
  overrideIncludesKpi: false,
  enableProductRevenue: true,
  enableKpi: true,
  enableOpenBill: true,
  enableOverride: true,
  enableMarginPenalty: true,
  enableMarginIncentive: true,
  itemGroups: ITEM_GROUPS,
  depositThresholdPct: 0.5,
  defaultRateMode: 'variable',
}

const KPI_ITEMS = [{ productCode: 'AK-CS AIRLOFT COMFY PIL', kpiAmount: 50 }]
const KPI_THRESHOLDS = [{ minQty: 10, bonusPct: 0.2 }]
const OPEN_BILL_RULES = [
  { rank: 1 as const, pct: 0.5 },
  { rank: 2 as const, pct: 0.4 },
  { rank: 3 as const, pct: 0.3 },
]

function node(
  staffId: string,
  uplineStaffId: string | null,
  baseRankKey: string,
  rateMode: 'fixed' | 'variable' = 'fixed',
): HierarchyNode {
  return { staffId, uplineStaffId, baseRankKey, rateMode }
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
    lines: lines.map(([itemGroup, productCode, qty, lineAmount, costAmount, brandCode], i) => ({
      id: `${id}-L${i + 1}`,
      itemGroup,
      productCode,
      qty,
      lineAmount,
      costAmount,
      brandCode: brandCode ?? (costAmount === undefined ? undefined : 'ACAMI'),
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
    openBillRules: OPEN_BILL_RULES,
    openBillTags: [],
    marginBands: MARGIN_BANDS,
    hierarchy: CHAIN,
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
      openBillTags: [{ orderId: '1', rank: 1 }],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productRevenue).toBe(0)
    expect(rs.deferredRevenue).toBe(10_000)
    expect(rs.kpiCommission).toBe(0) // the free pillows wait too
    expect(rs.openBillBonus).toBe(0)
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

describe('resolveRank — fixed vs variable', () => {
  it('variable climbs to Team Assistant when group sales clear 300k', () => {
    const r = resolveRank(node('x', null, 'rs_6', 'variable'), RANKS, 400_000)
    expect(r.effective?.rankKey).toBe('ta_7')
    expect(r.qualifiesFor?.rankKey).toBe('ta_7')
  })

  it('variable drops back to the base rank in a month that misses the target', () => {
    const r = resolveRank(node('x', null, 'rs_6', 'variable'), RANKS, 250_000)
    expect(r.effective?.rankKey).toBe('rs_6')
    expect(r.qualifiesFor).toBeUndefined()
  })

  it('fixed keeps the attained rank but still reports the qualification', () => {
    const r = resolveRank(node('x', null, 'rs_6', 'fixed'), RANKS, 400_000)
    expect(r.effective?.rankKey).toBe('rs_6')
    expect(r.qualifiesFor?.rankKey).toBe('ta_7')
  })

  it('fixed keeps 7% in a month below target — the point of fixed', () => {
    const r = resolveRank(node('x', null, 'ta_7', 'fixed'), RANKS, 10_000)
    expect(r.effective?.rankKey).toBe('ta_7')
    expect(r.effective?.productRate).toBe(0.07)
  })

  it('never drops a variable person below their attained rank', () => {
    const r = resolveRank(node('x', null, 'ta_7', 'variable'), RANKS, 0)
    expect(r.effective?.rankKey).toBe('ta_7')
  })

  it('the ladder has no 7% Revenue Specialist', () => {
    expect(RANKS.filter(r => r.tierKey === 'revenue_specialist').map(r => r.productRate))
      .toEqual([0.05, 0.06])
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

  it('excludes a KPI item from product revenue even though ACC is commissionable', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'AK-GUARDIAN MATT (Q)', 1, 2800],
      ['ACC', 'AK-CS AIRLOFT COMFY PIL', 1, 250],
    ])
    expect(orderProductRevenue(o, kpiIndex, groupIndex)).toBe(2800)
    expect(classifyLine(o.lines[1], kpiIndex, groupIndex)).toBe('kpi')
  })

  it('pays free bundled KPI items — the usual case in the ERP export', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'AK-GUARDIAN MATT (K)', 1, 6400],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0],
      ])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productRevenue).toBe(6400)
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
    expect(orderProductRevenue(o, kpiIndex, groupIndex)).toBe(0)
  })
})

// ─── Open Bill ──────────────────────────────────────────────────────────────

describe('Open Bill bonus', () => {
  const orders = [order('1', 'ta', [['MATTRESS', 'M1', 1, 10_000]])]

  it('matches the brief: Team Assistant on 7%, 10,000 → 700 then +50%', () => {
    const r = run({ orders, openBillTags: [{ orderId: '1', rank: 1 }] })
    const ta = find(r.statements, 'ta')
    expect(ta.productCommission).toBe(700)
    expect(ta.openBillBonus).toBe(350)
    expect(ta.productCommission + ta.openBillBonus).toBe(1_050)
  })

  it('matches the brief: Revenue Specialist on 5%, 10,000 → 500 then +50%', () => {
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])],
      openBillTags: [{ orderId: '1', rank: 1 }],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(500)
    expect(rs.openBillBonus).toBe(250)
  })

  it('follows the EFFECTIVE rate, so a variable promotion lifts the bonus too', () => {
    const solo = [node('x', null, 'rs_6', 'variable')]
    const big = [order('1', 'x', [['MATTRESS', 'M', 1, 400_000]])]
    const r = run({ hierarchy: solo, orders: big, openBillTags: [{ orderId: '1', rank: 1 }] })
    const x = find(r.statements, 'x')
    expect(x.productRate).toBe(0.07) // climbed on 400k group sales
    expect(x.openBillBonus).toBe(14_000) // 400,000 x 7% x 50%
  })

  it('grades the 2nd and 3rd bill of the day down to 40% and 30%', () => {
    const two = run({ orders, openBillTags: [{ orderId: '1', rank: 2 }] })
    const three = run({ orders, openBillTags: [{ orderId: '1', rank: 3 }] })
    expect(find(two.statements, 'ta').openBillBonus).toBe(280) // 700 x 40%
    expect(find(three.statements, 'ta').openBillBonus).toBe(210) // 700 x 30%
  })

  it('excludes transport and KPI revenue from the bonus base', () => {
    const r = run({
      orders: [order('1', 'ta', [
        ['MATTRESS', 'M1', 1, 10_000],
        ['TRANS', 'TRANSPORTATION CHARGES', 1, 500],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 2, 300],
      ])],
      openBillTags: [{ orderId: '1', rank: 1 }],
    })
    expect(find(r.statements, 'ta').openBillBonus).toBe(350)
  })

  it('warns when a tagged rank has no configured rate', () => {
    const r = run({
      orders,
      openBillTags: [{ orderId: '1', rank: 3 }],
      openBillRules: [{ rank: 1, pct: 0.5 }],
    })
    expect(find(r.statements, 'ta').openBillBonus).toBe(0)
    expect(r.warnings.join(' ')).toMatch(/no bonus rate is configured/)
  })

  it('supports the pct_of_revenue basis for a future sub-department', () => {
    const r = run({
      orders,
      openBillTags: [{ orderId: '1', rank: 1 }],
      scheme: { ...SCHEME, openBillBasis: 'pct_of_revenue' },
    })
    expect(find(r.statements, 'ta').openBillBonus).toBe(5_000)
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
  const tags = [{ orderId: '1', rank: 1 as const }]

  it('a sub-department can pay product revenue only', () => {
    const r = run({
      orders,
      openBillTags: tags,
      scheme: { ...SCHEME, enableKpi: false, enableOpenBill: false, enableOverride: false },
    })
    const ta = find(r.statements, 'ta')
    expect(ta.productCommission).toBe(700)
    expect(ta.kpiCommission).toBe(0)
    expect(ta.openBillBonus).toBe(0)
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
      order('1', 'ta', [
        ['MATTRESS', 'M1', 1, 20_000, 13_400],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 11, 0, 0],
        ['TRANS', 'TRANSPORTATION CHARGES', 1, 800, 780],
      ]),
      order('2', 'rs', [['SOFA', 'S1', 1, 10_000, 6_700]]),
      order('3', 'rs', [['BEDFRAME', 'B1', 2, 3_333.33, 2_233.33]]),
    ],
    openBillTags: [{ orderId: '1', rank: 1 }],
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
    expect(ta.tierKey).toBe('team_assistant')
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

  it('includes a free bundled KPI item — giving pillows away hurts margin', () => {
    const o = order('1', 'rs', [
      ['MATTRESS', 'M1', 1, 10_000, 7_300],
      ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0, 100],
    ])
    const base = marginBase(o.lines, kpiIndex, groupIndex)
    expect(base.revenue).toBe(10_000)
    expect(base.cost).toBe(7_400)
    expect(marginPctOf(base)).toBeCloseTo(0.26, 10)
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
      ['SOFA', 'S1', 1, 9_000, 6_000, 'ACAMI'],
    ])
    expect(marginBase(o.lines, kpiIndex, groupIndex).brandCode).toBe('ACAMI')
  })
})

describe('penaltyBandFor — the most severe match wins', () => {
  it("matches the user's ladder exactly", () => {
    const at = (m: number) => penaltyBandFor(m, 'ACAMI', MARGIN_BANDS)?.bandKey ?? null
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
    expect(penaltyBandFor(0.22, 'ACAMI', MARGIN_BANDS)?.bandKey).toBe('below_tier_3')
    expect(penaltyBandFor(0.19, 'ZANOTTI', MARGIN_BANDS)?.bandKey).toBe('below_tier_1')
  })
})

describe('marginIncentiveFor — incentives stack up the ladder', () => {
  const at = (m: number) => marginIncentiveFor(m, 'ACAMI', MARGIN_BANDS)

  it('pays nothing below Tier 1', () => {
    expect(at(0.35).amount).toBe(0)
  })

  it('pays RM1,000 at Tier 1', () => {
    expect(at(0.36).amount).toBe(1_000)
    expect(at(0.36).bandKey).toBe('incentive_tier_1')
  })

  it('pays RM1,000 + RM1,500 at Tier 2', () => {
    expect(at(0.43).amount).toBe(2_500)
    expect(at(0.50).amount).toBe(2_500)
    expect(at(0.43).bandKey).toBe('incentive_tier_2')
  })

  it("uses the brand's own bar — Zanotti clears Tier 1 at 33%", () => {
    expect(marginIncentiveFor(0.33, 'ZANOTTI', MARGIN_BANDS).amount).toBe(1_000)
    expect(marginIncentiveFor(0.33, 'ACAMI', MARGIN_BANDS).amount).toBe(0)
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

  it('halves the Open Bill bonus on the same bill', () => {
    const r = run({ orders: [badBill], openBillTags: [{ orderId: '1', rank: 1 }] })
    const rs = find(r.statements, 'rs')
    expect(rs.openBillBonus).toBe(125) // 250 full, halved
    expect(rs.marginPenaltyWithheld).toBe(375) // 250 + 125
    expect(rs.totalCommission).toBe(375)
  })

  it('does NOT scale the flat KPI allowance', () => {
    const r = run({
      orders: [order('1', 'rs', [
        ['MATTRESS', 'M1', 1, 10_000, 7_300],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 4, 0, 100],
      ])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.marginPct).toBeCloseTo(0.26, 10)
    expect(rs.productCommission).toBe(250) // halved
    expect(rs.kpiCommission).toBe(200) // 4 x 50, untouched
    expect(rs.totalCommission).toBe(450)
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

  it('leaves a good-margin bill alone', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 6_000]])] })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(500)
    expect(rs.marginPenaltyWithheld).toBe(0)
    expect(r.penalised).toEqual([])
  })

  it('skips the penalty and warns loudly when there is no cost data', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])] })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(500) // full, not penalised
    expect(rs.marginPct).toBeNull()
    expect(r.warnings.join(' ')).toMatch(/no cost data/)
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

  it('keeps the line-sum invariant with an incentive present', () => {
    const r = run({ orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000, 5_600]])] })
    for (const st of r.statements) {
      const lineSum = Math.round(st.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100
      expect(lineSum).toBe(st.totalCommission)
    }
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
