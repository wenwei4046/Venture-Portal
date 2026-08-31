import { describe, it, expect } from 'vitest'
import {
  computeCommissionRun,
  computeOverrides,
  kpiThresholdPct,
  orderProductRevenue,
  indexKpiItems,
} from './engine'
import type {
  CommissionScheme,
  EngineInput,
  HierarchyNode,
  SalesOrder,
  Statement,
} from './types'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const SCHEME: CommissionScheme = {
  billBonusBasis: 'uplift_on_commission',
  overrideIncludesKpi: false,
}

const KPI_ITEMS = [{ productCode: 'PLW', kpiAmount: 30 }]
const KPI_THRESHOLDS = [{ minQty: 10, bonusPct: 0.2 }]
const BILL_RULES = [
  { billRank: 1 as const, pct: 0.5 },
  { billRank: 2 as const, pct: 0.4 },
  { billRank: 3 as const, pct: 0.3 },
]

/** Me 7% → Alvin 5% → Ben 3% — the chain from the user's brief, extended. */
const CHAIN: HierarchyNode[] = [
  { staffId: 'me', uplineStaffId: null, rankKey: 'tier_1', productRate: 0.07 },
  { staffId: 'alvin', uplineStaffId: 'me', rankKey: 'tier_2', productRate: 0.05 },
  { staffId: 'ben', uplineStaffId: 'alvin', rankKey: 'tier_3', productRate: 0.03 },
]

function order(
  id: string,
  staffId: string,
  lines: Array<[code: string, qty: number, amount: number]>,
  date = '2026-09-05',
): SalesOrder {
  return {
    id,
    orderNo: `SO-${id}`,
    staffId,
    orderDate: date,
    eventDate: date,
    lines: lines.map(([productCode, qty, lineAmount], i) => ({
      id: `${id}-L${i + 1}`,
      productCode,
      qty,
      lineAmount,
    })),
  }
}

function run(partial: Partial<EngineInput>) {
  return computeCommissionRun({
    periodMonth: '2026-09-01',
    scheme: SCHEME,
    orders: [],
    kpiItems: KPI_ITEMS,
    kpiThresholds: KPI_THRESHOLDS,
    billBonusRules: BILL_RULES,
    billTags: [],
    hierarchy: CHAIN,
    ...partial,
  })
}

function find(statements: Statement[], staffId: string): Statement {
  const s = statements.find(x => x.staffId === staffId)
  if (!s) throw new Error(`no statement for ${staffId}`)
  return s
}

// ─── Line classification ────────────────────────────────────────────────────

describe('KPI line exclusion', () => {
  const kpiIndex = indexKpiItems(KPI_ITEMS)

  it('excludes KPI-item revenue from product revenue', () => {
    // Pillow sold for 250 × 12 = 3,000 must NOT count as product revenue —
    // it already earns the RM30/unit KPI allowance.
    const o = order('1', 'ben', [
      ['SOFA', 1, 10_000],
      ['PLW', 12, 3_000],
    ])
    expect(orderProductRevenue(o, kpiIndex)).toBe(10_000)
  })

  it('matches product codes case-insensitively and trimmed', () => {
    const o = order('1', 'ben', [[' plw ', 2, 500]])
    expect(orderProductRevenue(o, kpiIndex)).toBe(0)
  })
})

describe('kpiThresholdPct', () => {
  it('returns 0 below the first rung', () => {
    expect(kpiThresholdPct(9, KPI_THRESHOLDS)).toBe(0)
  })
  it('returns the rung once met', () => {
    expect(kpiThresholdPct(10, KPI_THRESHOLDS)).toBe(0.2)
  })
  it('picks the highest rung met, unsorted input included', () => {
    const ladder = [
      { minQty: 25, bonusPct: 0.35 },
      { minQty: 10, bonusPct: 0.2 },
    ]
    expect(kpiThresholdPct(30, ladder)).toBe(0.35)
    expect(kpiThresholdPct(12, ladder)).toBe(0.2)
  })
})

// ─── C1 + C2 ────────────────────────────────────────────────────────────────

describe('product revenue + KPI commission', () => {
  const result = run({
    orders: [order('1', 'ben', [['SOFA', 1, 10_000], ['PLW', 12, 3_000]])],
  })
  const ben = find(result.statements, 'ben')

  it('pays the personal rate on product revenue only', () => {
    expect(ben.productRevenue).toBe(10_000)
    expect(ben.productCommission).toBe(300) // 10,000 × 3%
  })

  it('pays the flat KPI allowance plus the threshold uplift', () => {
    expect(ben.kpiQty).toBe(12)
    expect(ben.kpiBase).toBe(360) // 12 × 30
    expect(ben.kpiThresholdPct).toBe(0.2)
    expect(ben.kpiCommission).toBe(432) // 360 × 1.20
  })

  it('totals the two components', () => {
    expect(ben.totalCommission).toBe(732)
  })

  it('emits no threshold line below the rung', () => {
    const small = run({ orders: [order('1', 'ben', [['PLW', 5, 1_250]])] })
    const s = find(small.statements, 'ben')
    expect(s.kpiCommission).toBe(150) // 5 × 30, no uplift
    expect(s.lines.some(l => l.component === 'kpi_threshold')).toBe(false)
  })
})

// ─── C3 ─────────────────────────────────────────────────────────────────────

describe('1st / 2nd / 3rd Bill bonus', () => {
  const orders = [order('1', 'alvin', [['SOFA', 1, 10_000]])]

  it('uplift basis: order revenue × personal rate × bill pct', () => {
    const r = run({ orders, billTags: [{ orderId: '1', billRank: 1 }] })
    const alvin = find(r.statements, 'alvin')
    expect(alvin.billBonus).toBe(250) // 10,000 × 5% × 50%
  })

  it('pct_of_revenue basis: order revenue × bill pct', () => {
    const r = run({
      orders,
      billTags: [{ orderId: '1', billRank: 1 }],
      scheme: { ...SCHEME, billBonusBasis: 'pct_of_revenue' },
    })
    expect(find(r.statements, 'alvin').billBonus).toBe(5_000) // 10,000 × 50%
  })

  it('is additive — the tagged order still earns normal commission', () => {
    const r = run({ orders, billTags: [{ orderId: '1', billRank: 1 }] })
    const alvin = find(r.statements, 'alvin')
    expect(alvin.productCommission).toBe(500) // 10,000 × 5%
    expect(alvin.billBonus).toBe(250)
  })

  it('grades 2nd and 3rd bill down', () => {
    const two = run({ orders, billTags: [{ orderId: '1', billRank: 2 }] })
    const three = run({ orders, billTags: [{ orderId: '1', billRank: 3 }] })
    expect(find(two.statements, 'alvin').billBonus).toBe(200) // 40%
    expect(find(three.statements, 'alvin').billBonus).toBe(150) // 30%
  })

  it('excludes KPI-item revenue from the bonus base', () => {
    const r = run({
      orders: [order('1', 'alvin', [['SOFA', 1, 10_000], ['PLW', 4, 1_000]])],
      billTags: [{ orderId: '1', billRank: 1 }],
    })
    expect(find(r.statements, 'alvin').billBonus).toBe(250) // not 275
  })

  it('warns when a tagged rank has no configured rate', () => {
    const r = run({
      orders,
      billTags: [{ orderId: '1', billRank: 3 }],
      billBonusRules: [{ billRank: 1, pct: 0.5 }],
    })
    expect(find(r.statements, 'alvin').billBonus).toBe(0)
    expect(r.warnings.join(' ')).toMatch(/no bonus rate is configured/)
  })
})

// ─── C4 ─────────────────────────────────────────────────────────────────────

describe('hierarchy override — differential roll-up', () => {
  const result = run({
    orders: [
      order('1', 'alvin', [['SOFA', 1, 20_000]]),
      order('2', 'ben', [['SOFA', 1, 10_000]]),
    ],
  })

  it("gives the upline the rate difference on the downline's volume", () => {
    // Me 7% over Alvin 5% → 2% × 20,000 = 400 …
    // … plus 2% × Ben's 10,000 rolled up through Alvin = 200.
    expect(find(result.statements, 'me').overrideCommission).toBe(600)
  })

  it('rolls up through the middle of the chain', () => {
    const alvin = find(result.statements, 'alvin')
    expect(alvin.productCommission).toBe(1_000) // own 20,000 × 5%
    expect(alvin.overrideCommission).toBe(200) // (5% − 3%) × 10,000
    expect(alvin.totalCommission).toBe(1_200)
  })

  it('never pays out more than the top rate on any ringgit', () => {
    // Alvin's 20,000 → 7% = 1,400. Ben's 10,000 → 7% = 700.
    expect(result.totalCommission).toBe(2_100)
  })

  it('compresses to zero between equal rates', () => {
    const flat: HierarchyNode[] = [
      { staffId: 'me', uplineStaffId: null, rankKey: 't1', productRate: 0.05 },
      { staffId: 'alvin', uplineStaffId: 'me', rankKey: 't1', productRate: 0.05 },
    ]
    const r = run({
      hierarchy: flat,
      orders: [order('1', 'alvin', [['SOFA', 1, 20_000]])],
    })
    expect(r.statements.find(s => s.staffId === 'me')).toBeUndefined()
    expect(find(r.statements, 'alvin').totalCommission).toBe(1_000)
  })

  it('skips a downline with an upline whose rate is lower', () => {
    const inverted: HierarchyNode[] = [
      { staffId: 'me', uplineStaffId: null, rankKey: 't3', productRate: 0.03 },
      { staffId: 'alvin', uplineStaffId: 'me', rankKey: 't1', productRate: 0.07 },
    ]
    const r = run({
      hierarchy: inverted,
      orders: [order('1', 'alvin', [['SOFA', 1, 10_000]])],
    })
    expect(r.statements.find(s => s.staffId === 'me')).toBeUndefined()
  })

  it('breaks a hierarchy cycle instead of looping forever', () => {
    const cyclic = new Map<string, HierarchyNode>([
      ['a', { staffId: 'a', uplineStaffId: 'b', rankKey: 't1', productRate: 0.07 }],
      ['b', { staffId: 'b', uplineStaffId: 'a', rankKey: 't2', productRate: 0.05 }],
    ])
    const warnings: string[] = []
    const credits = computeOverrides(cyclic, new Map([['b', 10_000]]), warnings)
    expect(credits).toHaveLength(1) // a earns (7% − 5%) once
    expect(credits[0]).toMatchObject({ uplineStaffId: 'a', amount: 200 })
    expect(warnings.join(' ')).toMatch(/cycle/i)
  })

  it('warns when an upline has no active hierarchy row', () => {
    const orphan: HierarchyNode[] = [
      { staffId: 'ben', uplineStaffId: 'ghost', rankKey: 't3', productRate: 0.03 },
    ]
    const r = run({
      hierarchy: orphan,
      orders: [order('1', 'ben', [['SOFA', 1, 10_000]])],
    })
    expect(r.warnings.join(' ')).toMatch(/no active hierarchy row/)
  })
})

// ─── Cross-cutting invariants ───────────────────────────────────────────────

describe('run invariants', () => {
  const result = run({
    orders: [
      order('1', 'alvin', [['SOFA', 1, 20_000], ['PLW', 11, 2_750]]),
      order('2', 'ben', [['SOFA', 1, 10_000]]),
      order('3', 'ben', [['CHAIR', 2, 3_333.33]]),
    ],
    billTags: [{ orderId: '1', billRank: 1 }],
  })

  it('every statement total equals the sum of its lines', () => {
    for (const s of result.statements) {
      const lineSum = Math.round(s.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100
      expect(lineSum).toBe(s.totalCommission)
    }
  })

  it('the run total equals the sum of statement totals', () => {
    const sum =
      Math.round(result.statements.reduce((a, s) => a + s.totalCommission, 0) * 100) / 100
    expect(result.totalCommission).toBe(sum)
  })

  it('sorts statements by total, descending', () => {
    const totals = result.statements.map(s => s.totalCommission)
    expect([...totals].sort((a, b) => b - a)).toEqual(totals)
  })

  it('snapshots rank and rate onto each statement', () => {
    const alvin = find(result.statements, 'alvin')
    expect(alvin.rankKey).toBe('tier_2')
    expect(alvin.productRate).toBe(0.05)
    expect(alvin.uplineStaffId).toBe('me')
  })

  it('produces no warnings on a clean run', () => {
    expect(result.warnings).toEqual([])
  })
})

describe('unranked salesperson', () => {
  const result = run({
    orders: [order('1', 'stranger', [['SOFA', 1, 10_000]])],
  })

  it('computes at 0% rather than guessing a rate', () => {
    expect(find(result.statements, 'stranger').productCommission).toBe(0)
  })

  it('warns loudly so the run cannot be applied blind', () => {
    expect(result.warnings.join(' ')).toMatch(/no rank \/ hierarchy row/)
  })

  it('still pays flat KPI allowances, which do not depend on rate', () => {
    const r = run({ orders: [order('1', 'stranger', [['PLW', 12, 3_000]])] })
    expect(find(r.statements, 'stranger').kpiCommission).toBe(432)
  })
})
