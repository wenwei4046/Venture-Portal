import { describe, it, expect } from 'vitest'
import {
  classifyLine,
  computeCommissionRun,
  computeOverrides,
  indexItemGroups,
  indexKpiItems,
  kpiThresholdPct,
  orderProductRevenue,
} from './engine'
import type {
  CommissionScheme,
  EngineInput,
  HierarchyNode,
  ItemGroupRule,
  SalesOrder,
  Statement,
} from './types'

// ─── Fixtures — the Fair sub-department ruleset ─────────────────────────────

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

const SCHEME: CommissionScheme = {
  openBillBasis: 'uplift_on_commission',
  overrideIncludesKpi: false,
  enableProductRevenue: true,
  enableKpi: true,
  enableOpenBill: true,
  enableOverride: true,
  itemGroups: ITEM_GROUPS,
}

const KPI_ITEMS = [{ productCode: 'AK-CS AIRLOFT COMFY PIL', kpiAmount: 50 }]
const KPI_THRESHOLDS = [{ minQty: 10, bonusPct: 0.2 }]
const OPEN_BILL_RULES = [
  { rank: 1 as const, pct: 0.5 },
  { rank: 2 as const, pct: 0.4 },
  { rank: 3 as const, pct: 0.3 },
]

/**
 * The four tiers from the brief. Rates overlap across tiers (7% is both a
 * senior Revenue Specialist and a junior Team Assistant), which is why the
 * rank key carries the tier.
 */
const RS5: Omit<HierarchyNode, 'staffId' | 'uplineStaffId'> =
  { tierKey: 'revenue_specialist', rankKey: 'rs_5', productRate: 0.05, canRecruit: false }
const RS6: Omit<HierarchyNode, 'staffId' | 'uplineStaffId'> =
  { tierKey: 'revenue_specialist', rankKey: 'rs_6', productRate: 0.06, canRecruit: true }
const TA7: Omit<HierarchyNode, 'staffId' | 'uplineStaffId'> =
  { tierKey: 'team_assistant', rankKey: 'ta_7', productRate: 0.07, canRecruit: true }
const TL9: Omit<HierarchyNode, 'staffId' | 'uplineStaffId'> =
  { tierKey: 'team_leader', rankKey: 'tl_9', productRate: 0.09, canRecruit: true }
const STL10: Omit<HierarchyNode, 'staffId' | 'uplineStaffId'> =
  { tierKey: 'senior_team_leader', rankKey: 'stl_10', productRate: 0.10, canRecruit: true }

/** STL 10% → TL 9% → TA 7% → RS 5% */
const CHAIN: HierarchyNode[] = [
  { staffId: 'stl', uplineStaffId: null, ...STL10 },
  { staffId: 'tl', uplineStaffId: 'stl', ...TL9 },
  { staffId: 'ta', uplineStaffId: 'tl', ...TA7 },
  { staffId: 'rs', uplineStaffId: 'ta', ...RS5 },
]

function order(
  id: string,
  staffId: string,
  lines: Array<[group: string, code: string, qty: number, amount: number]>,
  date = '2026-07-06',
): SalesOrder {
  return {
    id,
    orderNo: `SO-${id}`,
    staffId,
    orderDate: date,
    eventDate: date,
    lines: lines.map(([itemGroup, productCode, qty, lineAmount], i) => ({
      id: `${id}-L${i + 1}`,
      itemGroup,
      productCode,
      qty,
      lineAmount,
    })),
  }
}

function run(partial: Partial<EngineInput>) {
  return computeCommissionRun({
    periodMonth: '2026-07-01',
    scheme: SCHEME,
    orders: [],
    kpiItems: KPI_ITEMS,
    kpiThresholds: KPI_THRESHOLDS,
    openBillRules: OPEN_BILL_RULES,
    openBillTags: [],
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
    expect(rs.productCommission).toBe(354.15) // 7,083 × 5%
  })
})

// ─── KPI ────────────────────────────────────────────────────────────────────

describe('KPI items', () => {
  const kpiIndex = indexKpiItems(KPI_ITEMS)
  const groupIndex = indexItemGroups(ITEM_GROUPS)

  it('excludes a KPI item from product revenue even though ACC is commissionable', () => {
    // A pillow sold for 250 must not count as revenue — it already earns its
    // flat KPI allowance.
    const o = order('1', 'rs', [
      ['MATTRESS', 'AK-GUARDIAN MATT (Q)', 1, 2800],
      ['ACC', 'AK-CS AIRLOFT COMFY PIL', 1, 250],
    ])
    expect(orderProductRevenue(o, kpiIndex, groupIndex)).toBe(2800)
    expect(classifyLine(o.lines[1], kpiIndex, groupIndex)).toBe('kpi')
  })

  it('pays free bundled KPI items — the usual case in the ERP export', () => {
    // The ERP prices packages: the mattress line carries the money, the pillows
    // are qty 4 at 0. Those 4 pillows still earn 4 × 50.
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

  it("matches the brief's worked example: 10 × 50 then +20%", () => {
    const r = run({
      orders: [order('1', 'rs', [['ACC', 'AK-CS AIRLOFT COMFY PIL', 10, 0]])],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.kpiBase).toBe(500)
    expect(rs.kpiThresholdPct).toBe(0.2)
    expect(rs.kpiCommission).toBe(600)
  })

  it('does not uplift below the rung', () => {
    const r = run({
      orders: [order('1', 'rs', [['ACC', 'AK-CS AIRLOFT COMFY PIL', 9, 0]])],
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

  it("matches the brief: Team Assistant on 7%, 10,000 → 700 then +50%", () => {
    const r = run({ orders, openBillTags: [{ orderId: '1', rank: 1 }] })
    const ta = find(r.statements, 'ta')
    expect(ta.productCommission).toBe(700)
    expect(ta.openBillBonus).toBe(350)
    expect(ta.productCommission + ta.openBillBonus).toBe(1_050)
  })

  it("matches the brief: Revenue Specialist on 5%, 10,000 → 500 then +50%", () => {
    const r = run({
      orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])],
      openBillTags: [{ orderId: '1', rank: 1 }],
    })
    const rs = find(r.statements, 'rs')
    expect(rs.productCommission).toBe(500)
    expect(rs.openBillBonus).toBe(250)
  })

  it('follows the person\'s CURRENT rate, so a promotion changes the bonus', () => {
    const promoted = CHAIN.map(n => (n.staffId === 'ta' ? { ...n, ...TL9 } : n))
    const r = run({ orders, openBillTags: [{ orderId: '1', rank: 1 }], hierarchy: promoted })
    expect(find(r.statements, 'ta').openBillBonus).toBe(450) // 10,000 × 9% × 50%
  })

  it('grades the 2nd and 3rd bill of the day down to 40% and 30%', () => {
    const two = run({ orders, openBillTags: [{ orderId: '1', rank: 2 }] })
    const three = run({ orders, openBillTags: [{ orderId: '1', rank: 3 }] })
    expect(find(two.statements, 'ta').openBillBonus).toBe(280) // 700 × 40%
    expect(find(three.statements, 'ta').openBillBonus).toBe(210) // 700 × 30%
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
    const pair: HierarchyNode[] = [
      { staffId: 'six', uplineStaffId: null, ...RS6 },
      { staffId: 'five', uplineStaffId: 'six', ...RS5 },
    ]
    const r = run({
      hierarchy: pair,
      orders: [order('1', 'five', [['MATTRESS', 'M1', 1, 20_000]])],
    })
    expect(find(r.statements, 'five').productCommission).toBe(1_000) // 5%
    expect(find(r.statements, 'six').overrideCommission).toBe(200) // 1% differential
  })

  it('compresses to zero between two people on the same rate', () => {
    // Revenue Specialist 7% under Team Assistant 7%: nothing to override.
    const flat: HierarchyNode[] = [
      { staffId: 'ta', uplineStaffId: null, ...TA7 },
      { staffId: 'rs7', uplineStaffId: 'ta', tierKey: 'revenue_specialist', rankKey: 'rs_7', productRate: 0.07, canRecruit: true },
    ]
    const r = run({ hierarchy: flat, orders: [order('1', 'rs7', [['MATTRESS', 'M1', 1, 20_000]])] })
    expect(r.statements.find(s => s.staffId === 'ta')).toBeUndefined()
    expect(find(r.statements, 'rs7').totalCommission).toBe(1_400)
  })

  it('flags a downline placed under a rank that may not recruit', () => {
    const bad: HierarchyNode[] = [
      { staffId: 'five', uplineStaffId: null, ...RS5 },
      { staffId: 'other', uplineStaffId: 'five', ...RS5 },
    ]
    const r = run({ hierarchy: bad, orders: [] })
    expect(r.warnings.join(' ')).toMatch(/is not allowed to recruit/)
  })

  it('breaks a hierarchy cycle instead of looping forever', () => {
    const cyclic = new Map<string, HierarchyNode>([
      ['a', { staffId: 'a', uplineStaffId: 'b', ...TA7 }],
      ['b', { staffId: 'b', uplineStaffId: 'a', ...RS5 }],
    ])
    const warnings: string[] = []
    const credits = computeOverrides(cyclic, new Map([['b', 10_000]]), warnings)
    expect(credits).toHaveLength(1)
    expect(credits[0]).toMatchObject({ uplineStaffId: 'a', amount: 200 })
    expect(warnings.join(' ')).toMatch(/cycle/i)
  })

  it('warns when an upline has no active hierarchy row', () => {
    const orphan: HierarchyNode[] = [{ staffId: 'rs', uplineStaffId: 'ghost', ...RS5 }]
    const r = run({ hierarchy: orphan, orders: [order('1', 'rs', [['MATTRESS', 'M1', 1, 10_000]])] })
    expect(r.warnings.join(' ')).toMatch(/no active hierarchy row/)
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
    expect(r.statements.find(s => s.staffId === 'tl')).toBeUndefined()
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
  const result = run({
    orders: [
      order('1', 'ta', [
        ['MATTRESS', 'M1', 1, 20_000],
        ['ACC', 'AK-CS AIRLOFT COMFY PIL', 11, 0],
        ['TRANS', 'TRANSPORTATION CHARGES', 1, 800],
      ]),
      order('2', 'rs', [['SOFA', 'S1', 1, 10_000]]),
      order('3', 'rs', [['BEDFRAME', 'B1', 2, 3_333.33]]),
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

  it('snapshots tier, rank, rate and upline onto each statement', () => {
    const ta = find(result.statements, 'ta')
    expect(ta.tierKey).toBe('team_assistant')
    expect(ta.rankKey).toBe('ta_7')
    expect(ta.productRate).toBe(0.07)
    expect(ta.uplineStaffId).toBe('tl')
  })

  it('produces no warnings on a clean run', () => {
    expect(result.warnings).toEqual([])
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
      orders: [order('1', 'stranger', [['ACC', 'AK-CS AIRLOFT COMFY PIL', 10, 0]])],
    })
    expect(find(r.statements, 'stranger').kpiCommission).toBe(600)
  })
})
