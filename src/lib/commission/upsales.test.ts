import { describe, it, expect } from 'vitest'
import { computeCommissionRun } from './engine'
import { releasedOrders, toEngineInput, toRunPayload, type RunSourceRows } from './run-payload'
import { upsaleOrderNo, upsalesToOrders } from './upsales'
import type { CommissionScheme, EngineInput, Rank, SalesOrder } from './types'

/**
 * From the August 2026 claim form: Yuny (7%) sold a RM 300 upsale at the
 * Kuching fair onto HC5315, an April order whose commission was paid long ago.
 * She is paid 7% of the 300, and her upline Anthony (9%) overrides on it — his
 * override base for Yuny, RM 158,554, is her claim total WITH the upsale.
 */
const RANKS: Rank[] = [
  { rankKey: 'ta_7', titleId: 't7', titleLabel: 'TA', label: 'TA 7%', productRate: 0.07, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 30 },
  { rankKey: 'tl_9', titleId: 't9', titleLabel: 'TL', label: 'TL 9%', productRate: 0.09, canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null, sortOrder: 50 },
]

const SCHEME: CommissionScheme = {
  openBillBasis: 'uplift_on_commission',
  overrideIncludesKpi: false,
  enableProductRevenue: true,
  enableKpi: true,
  enableOpenBill: true,
  enableOverride: true,
  enableMarginPenalty: true,
  enableMarginIncentive: true,
  itemGroups: [{ group: 'MATTRESS', commissionable: true }],
  depositThresholdPct: 0.3,
  defaultRateMode: 'fixed',
}

const UPSALE = { id: 'u1', staff_id: 'yuny', amount: '300.00', sold_on: '2026-08-29', original_ref: 'HC5315' }

function bill(over: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'o1',
    orderNo: 'HC-SO-1',
    staffId: 'yuny',
    orderDate: '2026-08-15',
    periodMonth: '2026-08-01',
    eventDate: '2026-08-15',
    orderTotal: 10_000,
    paidAmount: 10_000,
    lines: [{ id: 'l1', itemGroup: 'MATTRESS', productCode: 'AK-1', qty: 1, lineAmount: 10_000, brandCode: 'AKEMI', costAmount: 6_000 }],
    ...over,
  }
}

function input(orders: SalesOrder[], over: Partial<EngineInput> = {}): EngineInput {
  return {
    periodMonth: '2026-08-01',
    scheme: SCHEME,
    ranks: RANKS,
    orders,
    kpiItems: [],
    kpiThresholds: [],
    openBillRules: [{ rank: 1, pct: 0.5 }],
    openBillTags: [],
    marginBands: [
      { brandCode: 'AKEMI', bandKey: 't1', label: 'Tier 1', kind: 'incentive', marginPct: 0.36, commissionMultiplier: 1, monthlyIncentive: 1_000 },
      { brandCode: 'AKEMI', bandKey: 'p1', label: 'Below 27%', kind: 'penalty', marginPct: 0.27, commissionMultiplier: 0.5, monthlyIncentive: 0 },
    ],
    hierarchy: [
      { staffId: 'yuny', uplineStaffId: 'anthony', baseRankKey: 'ta_7', rateMode: 'fixed', titleId: 't7' },
      { staffId: 'anthony', uplineStaffId: null, baseRankKey: 'tl_9', rateMode: 'fixed', titleId: 't9' },
    ],
    priorMonths: [],
    ...over,
  }
}

const statementsOf = (inp: EngineInput) =>
  new Map(computeCommissionRun(inp).statements.map(s => [s.staffId, s]))

describe('upsalesToOrders', () => {
  it('turns an upsale into a one-line order of the month it is recorded under', () => {
    const [o] = upsalesToOrders([UPSALE], '2026-09-01')
    expect(o).toMatchObject({
      id: 'u1',
      orderNo: 'UPSALE HC5315',
      staffId: 'yuny',
      orderDate: '2026-08-29',
      periodMonth: '2026-09-01',
      orderTotal: 300,
      paidAmount: 300,
      upsale: true,
    })
    expect(o.lines).toEqual([
      { id: 'u1', itemGroup: 'UPSALE', productCode: 'UPSALE', productName: 'Upsale', qty: 1, lineAmount: 300, upsale: true },
    ])
  })

  it('names an upsale by the bill it was added to', () => {
    expect(upsaleOrderNo(' HC5315 ')).toBe('UPSALE HC5315')
    expect(upsaleOrderNo(null)).toBe('UPSALE')
  })
})

describe('an upsale through the engine', () => {
  it('pays the salesperson her own rate on the upsale amount only', () => {
    const s = statementsOf(input(upsalesToOrders([UPSALE], '2026-08-01'))).get('yuny')!
    expect(s.productRevenue).toBe(300)
    expect(s.productCommission).toBe(21) // 7% × 300
    expect(s.lines.map(l => l.note)).toEqual(['UPSALE HC5315 · 2026-08-29'])
  })

  it('counts toward the upline’s override like any sale', () => {
    const s = statementsOf(input(upsalesToOrders([UPSALE], '2026-08-01'))).get('anthony')!
    expect(s.overrideCommission).toBe(6) // (9% − 7%) × 300
  })

  it('is not asked the deposit question', () => {
    const [u] = upsalesToOrders([UPSALE], '2026-08-01')
    const s = statementsOf(input([{ ...u, paidAmount: 0 }])).get('yuny')!
    expect(s.productRevenue).toBe(300)
    expect(s.deferredRevenue).toBe(0)
  })

  it('never holds an Open Bill rank, even if one were tagged on it', () => {
    const s = statementsOf(
      input(upsalesToOrders([UPSALE], '2026-08-01'), { openBillTags: [{ orderId: 'u1', rank: 1 }] }),
    ).get('yuny')!
    expect(s.openBillBonus).toBe(0)
  })

  it('is commissionable even when its code is a KPI item or its group is unknown', () => {
    const s = statementsOf(
      input(upsalesToOrders([UPSALE], '2026-08-01'), { kpiItems: [{ productCode: 'UPSALE', kpiAmount: 50 }] }),
    ).get('yuny')!
    expect(s.productRevenue).toBe(300)
    expect(s.kpiQty).toBe(0)
    expect(computeCommissionRun(input(upsalesToOrders([UPSALE], '2026-08-01'))).warnings).toEqual([])
  })

  it('stays out of the margin: it neither blocks the incentive nor dilutes it', () => {
    const inp = input([bill(), ...upsalesToOrders([UPSALE], '2026-08-01')])
    const s = statementsOf(inp).get('yuny')!
    expect(s.marginRevenue).toBe(10_000)
    expect(s.marginPct).toBeCloseTo(0.4)
    expect(s.marginIncentive).toBe(1_000)
    expect(s.productCommission).toBe(721) // 7% × 10,000 + 7% × 300
  })
})

describe('an upsale on its way to the database', () => {
  it('is never released — it is read by its own month and has no sales_orders row', () => {
    const inp = input([bill(), ...upsalesToOrders([UPSALE], '2026-08-01')])
    expect(releasedOrders(inp, computeCommissionRun(inp)).map(r => r.order_id)).toEqual(['o1'])
  })

  it('leaves the statement line’s order and line ids empty (they are foreign keys to sales orders)', () => {
    const inp = input([bill(), ...upsalesToOrders([UPSALE], '2026-08-01')])
    const payload = toRunPayload(inp, computeCommissionRun(inp))
    const lines = payload.p_statements.find(s => s.staff_id === 'yuny')!.lines
    const upsaleLine = lines.find(l => l.note.startsWith('UPSALE'))!
    expect(upsaleLine).toMatchObject({ component: 'product_revenue', source_order_id: null, source_line_id: null, amount: 21 })
    expect(lines.find(l => l.note.startsWith('HC-SO-1'))!.source_order_id).toBe('o1')
  })

  it('joins the run’s orders from the rows the server action reads', () => {
    const rows: RunSourceRows = {
      periodMonth: '2026-08-01',
      scheme: {
        id: 's', sub_department_id: 'fair', open_bill_basis: 'uplift_on_commission', override_includes_kpi: false,
        deposit_threshold_pct: '0.3', default_rate_mode: 'fixed', enable_product_revenue: true, enable_kpi: false,
        enable_open_bill: false, enable_override: true, enable_margin_penalty: false, enable_margin_incentive: false,
      },
      ranks: [], itemGroups: [], kpiItems: [], kpiThresholds: [], openBillRules: [], openBillTags: [],
      marginBands: [], hierarchy: [], orders: [], releasedOrderNos: [], priorMonths: [],
      upsales: [UPSALE],
    }
    const eng = toEngineInput(rows)
    expect(eng.orders).toHaveLength(1)
    expect(eng.orders[0]).toMatchObject({ id: 'u1', upsale: true, periodMonth: '2026-08-01', orderTotal: 300 })
  })
})

/**
 * HC13911 (LOUIS in the claim form; YUNY here, on the same ladder as the
 * upsale above): 16,888 was paid in August, the customer dropped an item on
 * 18 August and the ERP now says 14,800 — a drop of 2,088 paid in September.
 */
const DROP = { id: 'd1', staff_id: 'yuny', amount: '-2088.00', sold_on: '2026-09-18', original_ref: 'HC13911', kind: 'drop' as const }

describe('a drop', () => {
  it('becomes a one-line order that takes its amount back', () => {
    const [o] = upsalesToOrders([DROP], '2026-09-01')
    expect(o).toMatchObject({ id: 'd1', orderNo: 'DROP HC13911', orderTotal: -2088, paidAmount: -2088, upsale: true })
    expect(o.lines).toEqual([
      { id: 'd1', itemGroup: 'UPSALE', productCode: 'DROP', productName: 'Drop sales', qty: 1, lineAmount: -2088, upsale: true },
    ])
    expect(upsaleOrderNo('HC13911', 'drop')).toBe('DROP HC13911')
  })

  it('comes off the seller’s sales and the upline’s override in the month it is paid', () => {
    const inp = input([bill({ periodMonth: '2026-09-01' }), ...upsalesToOrders([DROP], '2026-09-01')], { periodMonth: '2026-09-01' })
    const run = computeCommissionRun(inp)
    const s = new Map(run.statements.map(x => [x.staffId, x]))
    expect(s.get('yuny')!.productRevenue).toBe(7_912) // 10,000 − 2,088
    expect(s.get('yuny')!.productCommission).toBe(553.84) // 7% × 7,912
    expect(s.get('anthony')!.overrideCommission).toBe(158.24) // 2% × 7,912
    expect(s.get('yuny')!.lines.map(l => l.note)).toContain('DROP HC13911 · 2026-09-18')
    expect(run.warnings).toEqual([])
  })

  it('takes the override back even when it is all the seller has that month — and says payroll cannot pay it', () => {
    const run = computeCommissionRun(input(upsalesToOrders([DROP], '2026-09-01'), { periodMonth: '2026-09-01' }))
    const s = new Map(run.statements.map(x => [x.staffId, x]))
    expect(s.get('yuny')!.totalCommission).toBe(-146.16) // 7% × −2,088
    expect(s.get('anthony')!.overrideCommission).toBe(-41.76) // 2% × −2,088
    expect(run.warnings).toEqual([
      "Staff yuny's commission comes to -146.16 this month — drops take back more than the month pays (DROP HC13911). Payroll cannot pay a negative commission: pay the drop in a month their sales cover it.",
      "Staff anthony's commission comes to -41.76 this month — drops take back more than the month pays. Payroll cannot pay a negative commission: pay the drop in a month their sales cover it.",
    ])
  })
})
