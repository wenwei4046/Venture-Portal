import { describe, expect, it } from 'vitest'
import { computeCommissionRun } from './engine'
import {
  kpiLineReaders,
  ownSchemeBrandsOf,
  releasedOrders,
  specialMoneyByLine,
  toBrandRates,
  toEngineInput,
  toRunPayload,
  type RunSourceRows,
} from './run-payload'

/**
 * The mapping between Postgres and the engine.
 *
 * These are not plumbing tests. Every case below is a way the mapping could
 * fail silently — paying the wrong amount rather than throwing — which is why
 * the seam was pulled out of the Server Action into a pure module at all.
 */

const SCHEME: RunSourceRows['scheme'] = {
  id: 'scheme-1',
  sub_department_id: 'sub-1',
  override_includes_kpi: false,
  // Deliberately a string: PostgREST returns DECIMAL as text.
  deposit_threshold_pct: '0.500000',
  default_rate_mode: 'variable',
  enable_product_revenue: true,
  enable_kpi: true,
  enable_override: true,
  enable_margin_penalty: true,
  enable_margin_incentive: true,
}

const RANKS: RunSourceRows['ranks'] = [
  {
    rank_key: 'rs_5',
    title_id: 'title-rs',
    titles: { name: 'Revenue Specialist' },
    label: 'Revenue Specialist 5%',
    product_rate: '0.050000',
    can_recruit: false,
    group_sales_threshold: null,
    personal_sales_threshold: null,
    consecutive_months: null,
    sort_order: 1,
  },
  {
    rank_key: 'rs_6',
    title_id: 'title-rs',
    titles: { name: 'Revenue Specialist' },
    label: 'Revenue Specialist 6%',
    product_rate: '0.060000',
    can_recruit: true,
    group_sales_threshold: '100000.00',
    personal_sales_threshold: null,
    consecutive_months: null,
    sort_order: 2,
  },
]

function baseRows(overrides: Partial<RunSourceRows> = {}): RunSourceRows {
  return {
    periodMonth: '2026-07-01',
    scheme: SCHEME,
    ranks: RANKS,
    itemGroups: [
      { item_group: 'MATTRESS', commissionable: true },
      { item_group: 'TRANS', commissionable: false },
    ],
    kpiItems: [{ product_code: 'PIL-01', kpi_amount: '50.00' }],
    kpiThresholds: [{ min_qty: 10, bonus_pct: '0.200000' }],
    marginBands: [],
    hierarchy: [
      {
        staff_id: 'staff-a',
        upline_staff_id: null,
        rate_mode: null,
        comm_ranks: { rank_key: 'rs_5' }, title_id: null,
      },
    ],
    orders: [],
    releasedOrderNos: [],
    priorMonths: [],
    ...overrides,
  }
}

function order(
  o: Partial<RunSourceRows['orders'][number]> = {},
): RunSourceRows['orders'][number] {
  return {
    id: 'order-1',
    order_no: 'SO-001',
    staff_id: 'staff-a',
    order_date: '2026-07-10',
    event_date: '2026-07-10',
    period_month: '2026-07-01',
    order_total: '10000.00',
    paid_amount: '10000.00',
    manual_margin_pct: null,
    sales_order_lines: [
      {
        id: 'line-1',
        item_group: 'MATTRESS',
        product_code: 'MAT-01',
        product_name: 'Mattress',
        qty: '1.000',
        line_amount: '10000.00',
        brand_code: 'AKEMI',
        cost_amount: '6000.00',
      },
    ],
    ...o,
  }
}

describe('toEngineInput', () => {
  it('reads DECIMAL columns that arrive as strings', () => {
    const input = toEngineInput(baseRows({ orders: [order()] }))

    expect(input.scheme.depositThresholdPct).toBe(0.5)
    expect(input.ranks[1].productRate).toBe(0.06)
    expect(input.ranks[1].groupSalesThreshold).toBe(100000)
    expect(input.kpiItems[0].kpiAmount).toBe(50)
    expect(input.kpiThresholds[0].bonusPct).toBe(0.2)
    expect(input.orders[0].orderTotal).toBe(10000)
    expect(input.orders[0].lines[0].costAmount).toBe(6000)
  })

  // 2026-10-05: what a bed frame's divan, leg and gap were charged.
  it('carries a line’s option charge, and nothing at all for a line without one', () => {
    const input = toEngineInput(baseRows({
      orders: [order({
        sales_order_lines: [
          { id: 'line-1', item_group: 'MATTRESS', product_code: 'MAT-01', product_name: 'Mattress', qty: '1.000',
            line_amount: '10000.00', brand_code: 'AKEMI', cost_amount: '6000.00', option_charge_amount: '0.00' },
          { id: 'line-2', item_group: 'BEDFRAME', product_code: 'BF-01', product_name: 'Bed frame', qty: '2.000',
            line_amount: '4200.00', brand_code: null, cost_amount: '2000.00', option_charge_amount: '200.00' },
        ],
      })],
    }))
    expect(input.orders[0].lines[0]).not.toHaveProperty('optionCharge')
    expect(input.orders[0].lines[1].optionCharge).toBe(200)
  })

  // 2026-11-07: a rider SKU's ratio by brand (Costing Setting) — strings read, anything else left out.
  it("carries a rider SKU's ratios by brand, and no key at all while it has none", () => {
    expect(toEngineInput(baseRows()).scheme).not.toHaveProperty('costRatiosByBrand')
    const input = toEngineInput(baseRows({
      costRatiosByBrand: [
        { product_code: 'TRION (A)-(K)', brand_code: 'DUNLOP', ratio: '0.6000' },
        { product_code: 'TRION (A)-(K)', brand_code: 'ERGOTEX', ratio: 0.5 },
        { product_code: 'TRION (A)-(K)', brand_code: 'AKEMI', ratio: '0' },
        { product_code: ' ', brand_code: 'AKEMI', ratio: '0.6' },
        { product_code: 'TRION (A)-(Q)', brand_code: '', ratio: '0.6' },
      ],
    }))
    expect(input.scheme.costRatiosByBrand).toEqual([
      { productCode: 'TRION (A)-(K)', brand: 'DUNLOP', ratio: 0.6 },
      { productCode: 'TRION (A)-(K)', brand: 'ERGOTEX', ratio: 0.5 },
    ])
  })

  // 2026-11-14: a brand's own ratio (Costing Setting) — strings read, anything else left out.
  it("carries the brands' own ratios, and no key at all while none has one", () => {
    expect(toEngineInput(baseRows()).scheme).not.toHaveProperty('brandDivisors')
    expect(toEngineInput(baseRows({ brandCostRatios: [] })).scheme).not.toHaveProperty('brandDivisors')
    const input = toEngineInput(baseRows({
      brandCostRatios: [
        { brand_code: 'ERGOTEX', ratio: '0.6000' },
        { brand_code: 'DUNLOP', ratio: 0.65 },
        { brand_code: 'AKEMI', ratio: '0' },
        { brand_code: ' ', ratio: '0.6' },
      ],
    }))
    expect(input.scheme.brandDivisors).toEqual([
      { brand: 'ERGOTEX', ratio: 0.6 },
      { brand: 'DUNLOP', ratio: 0.65 },
    ])
  })

  it('carries each rung\'s title, and the title a person holds, into the engine', () => {
    const input = toEngineInput(
      baseRows({
        hierarchy: [
          {
            staff_id: 'staff-a',
            upline_staff_id: null,
            rate_mode: null,
            comm_ranks: { rank_key: 'rs_5' },
            title_id: 'title-ta',
          },
        ],
      }),
    )
    expect(input.ranks[0].titleId).toBe('title-rs')
    expect(input.ranks[0].titleLabel).toBe('Revenue Specialist')
    expect(input.hierarchy[0].titleId).toBe('title-ta')

    // No staff embed at all → no title, and the engine falls back to the rank.
    expect(toEngineInput(baseRows()).hierarchy[0].titleId).toBeNull()
  })

  it('carries a streak gate and the earlier months, most recent first', () => {
    const input = toEngineInput(
      baseRows({
        ranks: [
          RANKS[0],
          { ...RANKS[1], group_sales_threshold: null, personal_sales_threshold: '100000.00', consecutive_months: 2 },
        ],
        priorMonths: [
          { period_month: '2026-05-01', comm_statements: [{ staff_id: 'staff-a', product_revenue: '90000.00' }] },
          { period_month: '2026-06-01', comm_statements: [{ staff_id: 'staff-a', product_revenue: '150000.50' }] },
          { period_month: '2026-04-01', comm_statements: null },
        ],
      }),
    )
    expect(input.ranks[1].personalSalesThreshold).toBe(100000)
    expect(input.ranks[1].consecutiveMonths).toBe(2)
    expect(input.priorMonths.map(p => p.periodMonth)).toEqual(['2026-06-01', '2026-05-01', '2026-04-01'])
    expect(input.priorMonths[0].personalRevenue['staff-a']).toBe(150000.5)
    expect(input.priorMonths[2].personalRevenue).toEqual({})
  })

  it('accepts an embedded relation as either an object or a one-element array', () => {
    const asArray = toEngineInput(
      baseRows({
        hierarchy: [
          {
            staff_id: 'staff-a',
            upline_staff_id: null,
            rate_mode: null,
            comm_ranks: [{ rank_key: 'rs_6' }], title_id: null,
          },
        ],
      }),
    )
    expect(asArray.hierarchy[0].baseRankKey).toBe('rs_6')
  })

  it('falls back to the scheme default when a person has no rate mode of their own', () => {
    const input = toEngineInput(baseRows())
    expect(input.hierarchy[0].rateMode).toBe('variable')

    const explicit = toEngineInput(
      baseRows({
        hierarchy: [
          {
            staff_id: 'staff-a',
            upline_staff_id: null,
            rate_mode: 'fixed',
            comm_ranks: { rank_key: 'rs_5' }, title_id: null,
          },
        ],
      }),
    )
    expect(explicit.hierarchy[0].rateMode).toBe('fixed')
  })

  it('drops a hierarchy row whose rank did not resolve rather than inventing one', () => {
    const input = toEngineInput(
      baseRows({
        hierarchy: [
          { staff_id: 'staff-a', upline_staff_id: null, rate_mode: null, comm_ranks: null, title_id: null },
        ],
      }),
    )
    expect(input.hierarchy).toHaveLength(0)
  })

  it('drops a margin band with no brand — the whole ladder is keyed by brand', () => {
    const input = toEngineInput(
      baseRows({
        marginBands: [
          {
            band_key: 'inc_1',
            label: 'Tier 1',
            kind: 'incentive',
            margin_pct: '0.360000',
            commission_multiplier: '1.000000',
            monthly_incentive: '1000.00',
            comm_brands: null,
          },
          {
            band_key: 'inc_1',
            label: 'Tier 1',
            kind: 'incentive',
            margin_pct: '0.360000',
            commission_multiplier: '1.000000',
            monthly_incentive: '1000.00',
            comm_brands: { code: 'AKEMI' },
          },
        ],
      }),
    )
    expect(input.marginBands).toHaveLength(1)
    expect(input.marginBands[0].brandCode).toBe('AKEMI')
  })

  it('excludes an order whose agent never matched a salesperson', () => {
    const input = toEngineInput(
      baseRows({ orders: [order({ staff_id: null }), order({ id: 'order-2', order_no: 'SO-002' })] }),
    )
    expect(input.orders.map(o => o.id)).toEqual(['order-2'])
  })

  it('flags an already-released order instead of dropping it, so group sales stay whole', () => {
    const input = toEngineInput(
      baseRows({ orders: [order()], releasedOrderNos: ['SO-001'] }),
    )
    expect(input.orders).toHaveLength(1)
    expect(input.orders[0].alreadyReleased).toBe(true)
  })

  it('keeps a carried-forward order at its ORIGINAL period, not the run period', () => {
    const input = toEngineInput(
      baseRows({
        orders: [order({ id: 'order-june', order_no: 'SO-J', period_month: '2026-06-01' })],
      }),
    )
    expect(input.periodMonth).toBe('2026-07-01')
    expect(input.orders[0].periodMonth).toBe('2026-06-01')
  })
})

describe('releasedOrders', () => {
  it('releases an eligible order and holds one under the deposit gate', () => {
    const rows = baseRows({
      orders: [
        order(),
        order({
          id: 'order-2',
          order_no: 'SO-002',
          order_total: '20000.00',
          paid_amount: '1000.00',
        }),
      ],
    })
    const input = toEngineInput(rows)
    const result = computeCommissionRun(input)

    const released = releasedOrders(input, result)
    expect(released.map(r => r.order_no)).toEqual(['SO-001'])
    expect(released[0].product_revenue).toBe(10000)
    expect(result.deferred.map(d => d.orderNo)).toEqual(['SO-002'])
  })

  it('never re-releases an order an earlier run already paid', () => {
    const rows = baseRows({ orders: [order()], releasedOrderNos: ['SO-001'] })
    const input = toEngineInput(rows)
    const result = computeCommissionRun(input)

    expect(releasedOrders(input, result)).toHaveLength(0)
  })

  it('releases an order that earned nothing, so it stops being reconsidered', () => {
    const rows = baseRows({
      orders: [
        order({
          sales_order_lines: [
            {
              id: 'line-t',
              item_group: 'TRANS',
              product_code: 'TRANS-01',
              product_name: 'Delivery',
              qty: '1.000',
              line_amount: '300.00',
              brand_code: null,
              cost_amount: null,
            },
          ],
        }),
      ],
    })
    const input = toEngineInput(rows)
    const result = computeCommissionRun(input)

    const released = releasedOrders(input, result)
    expect(released.map(r => r.order_no)).toEqual(['SO-001'])
    expect(released[0].product_revenue).toBe(0)
  })
})

describe('toRunPayload', () => {
  it('produces statements whose lines add up to the total the RPC will store', () => {
    const rows = baseRows({ orders: [order()] })
    const input = toEngineInput(rows)
    const result = computeCommissionRun(input)
    const payload = toRunPayload(input, result)

    for (const s of payload.p_statements) {
      const lineSum = s.lines.reduce((a, l) => a + l.amount, 0)
      expect(Math.abs(lineSum - s.total_commission)).toBeLessThanOrEqual(0.01)
    }

    const total = payload.p_statements.reduce((a, s) => a + s.total_commission, 0)
    expect(Math.abs(total - payload.p_total_commission)).toBeLessThanOrEqual(0.01)
  })

  it('drops a statement for someone with no sales and nothing earned', () => {
    const rows = baseRows({
      hierarchy: [
        { staff_id: 'staff-a', upline_staff_id: null, rate_mode: null, comm_ranks: { rank_key: 'rs_6' }, title_id: null },
        { staff_id: 'staff-idle', upline_staff_id: 'staff-a', rate_mode: null, comm_ranks: { rank_key: 'rs_5' }, title_id: null },
      ],
      orders: [order()],
    })
    const input = toEngineInput(rows)
    const payload = toRunPayload(input, computeCommissionRun(input))

    expect(payload.p_statements.map(s => s.staff_id)).toEqual(['staff-a'])
  })

  it('writes the paid rank\'s title and the ratchet preview onto the statement', () => {
    // Nobody has given staff-a a title yet, so the first paid rank's title is
    // what the run would raise them to.
    const rows = baseRows({ orders: [order()] })
    const input = toEngineInput(rows)
    const payload = toRunPayload(input, computeCommissionRun(input))

    expect(payload.p_statements[0]).toMatchObject({
      rank_key: 'rs_5',
      rank_title_id: 'title-rs',
      promotes_to_title_id: 'title-rs',
    })
  })

  it('keeps a statement whose whole month is sitting behind the deposit gate', () => {
    const rows = baseRows({
      orders: [order({ paid_amount: '1000.00' })],
    })
    const input = toEngineInput(rows)
    const payload = toRunPayload(input, computeCommissionRun(input))

    expect(payload.p_statements).toHaveLength(1)
    expect(payload.p_statements[0].total_commission).toBe(0)
    expect(payload.p_statements[0].deferred_revenue).toBe(10000)
  })

  it('omits a brand slice with no brand code — the column cannot hold it', () => {
    const rows = baseRows({
      orders: [
        order({
          sales_order_lines: [
            {
              id: 'line-1',
              item_group: 'MATTRESS',
              product_code: 'MAT-01',
              product_name: 'Mattress',
              qty: '1.000',
              line_amount: '10000.00',
              brand_code: null,
              cost_amount: '6000.00',
            },
          ],
        }),
      ],
    })
    const input = toEngineInput(rows)
    const payload = toRunPayload(input, computeCommissionRun(input))

    expect(payload.p_statements[0].brand_margins).toHaveLength(0)
  })

  it('carries the engine warnings through untouched', () => {
    const rows = baseRows({
      itemGroups: [{ item_group: 'MATTRESS', commissionable: true }],
      orders: [
        order({
          sales_order_lines: [
            {
              id: 'line-x',
              item_group: 'MYSTERY',
              product_code: 'X-1',
              product_name: 'Something new',
              qty: '1.000',
              line_amount: '500.00',
              brand_code: null,
              cost_amount: null,
            },
          ],
        }),
      ],
    })
    const input = toEngineInput(rows)
    const payload = toRunPayload(input, computeCommissionRun(input))

    expect(payload.p_warnings.some(w => w.includes('MYSTERY'))).toBe(true)
  })
})

/** IR rows exercise the same database seam as Fair, including DECIMAL strings. */
function irRows(fullSpec = false): RunSourceRows {
  const directIds = fullSpec ? ['direct-a', 'direct-b', 'direct-c'] : ['direct-a', 'direct-b']
  const ranks: RunSourceRows['ranks'] = [
    { ...RANKS[0], rank_key: 'ir_rs', title_id: 'ir-rs', product_rate: '0.030000', sort_order: 10 },
    { ...RANKS[1], rank_key: 'ir_tl', title_id: 'ir-tl', product_rate: '0.040000', group_sales_threshold: '800000.00', sort_order: 30 },
    {
      ...RANKS[1],
      rank_key: 'ir_stl',
      title_id: 'ir-stl',
      product_rate: '0.000000',
      group_sales_threshold: '1000000.00',
      group_incentive_amount: '6000.00',
      group_subsidy_cap: '2000.00',
      sort_order: 40,
    },
  ]
  const member = (staffId: string, upline: string | null, rankKey: string, titleId: string): RunSourceRows['hierarchy'][number] => ({
    staff_id: staffId,
    upline_staff_id: upline,
    rate_mode: null,
    comm_ranks: { rank_key: rankKey },
    title_id: titleId,
  })
  const personalOrder = (staffId: string, amount: string) => order({
    id: `order-${staffId}`,
    order_no: `SO-${staffId}`,
    staff_id: staffId,
    order_total: amount,
    paid_amount: amount,
    sales_order_lines: [{
      id: `line-${staffId}`,
      item_group: 'MATTRESS',
      product_code: 'MAT-01',
      product_name: 'Project',
      qty: '1.000',
      line_amount: amount,
      brand_code: null,
      cost_amount: null,
    }],
  })

  return baseRows({
    scheme: {
      ...SCHEME,
      enable_kpi: false,
      enable_margin_penalty: false,
      enable_margin_incentive: false,
      deposit_threshold_pct: null,
      group_sales_depth: 2,
      override_depth: 2,
      enable_group_incentive: true,
    },
    ranks,
    hierarchy: [
      member('leader', null, 'ir_stl', 'ir-stl'),
      ...directIds.flatMap(id => [
        member(id, 'leader', fullSpec ? 'ir_tl' : 'ir_rs', fullSpec ? 'ir-tl' : 'ir-rs'),
        ...(fullSpec ? ['a', 'b', 'c'].map(child => member(`${id}-${child}`, id, 'ir_rs', 'ir-rs')) : []),
      ]),
    ],
    orders: [personalOrder('leader', '200000.00'), ...directIds.map(id => personalOrder(id, '800000.00'))],
  })
}

describe('IR package database mapping', () => {
  it('maps scheme depth/switch fields and string package amounts without reusing percentage rate', () => {
    const rows = irRows()
    rows.ranks[2] = { ...rows.ranks[2], group_incentive_amount: '6000.50', group_subsidy_cap: '2000.25' }
    const input = toEngineInput(rows)

    expect(input.scheme).toMatchObject({ groupSalesDepth: 2, overrideDepth: 2, enableGroupIncentive: true })
    expect(input.ranks[2]).toMatchObject({
      productRate: 0,
      groupSalesThreshold: 1_000_000,
      groupIncentiveAmount: 6_000.50,
      groupSubsidyCap: 2_000.25,
    })

    const payload = toRunPayload(input, computeCommissionRun(input))
    expect(payload.p_statements.find(s => s.staff_id === 'leader')).toMatchObject({
      group_incentive: 12_001,
      group_subsidy_cap: 4_000.50,
      total_commission: 12_001,
    })
  })

  it('round-trips the independent group evidence and keeps subsidy outside cash line/component totals', () => {
    const input = toEngineInput(irRows())
    const result = computeCommissionRun(input)
    const payload = toRunPayload(input, result)
    const leader = payload.p_statements.find(s => s.staff_id === 'leader')!

    expect(payload.p_warnings).toEqual([])
    expect(leader).toMatchObject({
      product_rate: 0,
      product_revenue: 200_000,
      group_revenue: 1_800_000,
      product_commission: 0,
      override_commission: 0,
      group_incentive: 12_000,
      group_subsidy_cap: 4_000,
      full_spec: false,
      total_commission: 12_000,
    })
    expect(leader.group_breakdown).toEqual(result.statements.find(s => s.staffId === 'leader')?.groupBreakdown)
    expect(leader.group_breakdown.map(group => group.targetRevenue)).toEqual([1_000_000, 1_000_000])
    expect(leader.group_breakdown.map(group => ({
      direct: group.directStaffId, own: group.leaderPersonalRevenue,
      directPersonal: group.directPersonalRevenue, second: group.secondLayerRevenue,
      total: group.totalRevenue, qualifies: group.qualifies,
    }))).toEqual([
      { direct: 'direct-a', own: 200_000, directPersonal: 800_000, second: 0, total: 1_000_000, qualifies: true },
      { direct: 'direct-b', own: 200_000, directPersonal: 800_000, second: 0, total: 1_000_000, qualifies: true },
    ])
    expect(leader.lines.map(line => ({ component: line.component, source: line.source_staff_id, amount: line.amount }))).toEqual([
      { component: 'group_incentive', source: 'direct-a', amount: 6_000 },
      { component: 'group_incentive', source: 'direct-b', amount: 6_000 },
    ])
    for (const s of payload.p_statements) {
      expect(s.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(s.total_commission)
      expect(s.product_commission + s.kpi_commission + s.override_commission + s.margin_incentive + s.group_incentive).toBe(s.total_commission)
    }
    expect(payload.p_statements.reduce((sum, s) => sum + s.total_commission, 0)).toBe(payload.p_total_commission)
    expect(payload.p_released_orders.reduce((sum, o) => sum + o.product_revenue, 0)).toBe(1_800_000)
  })

  it('preserves monthly Full Spec and its three-by-three contribution evidence in the RPC payload', () => {
    const input = toEngineInput(irRows(true))
    const payload = toRunPayload(input, computeCommissionRun(input))
    const leader = payload.p_statements.find(s => s.staff_id === 'leader')!

    expect(leader.full_spec).toBe(true)
    expect(leader.group_incentive).toBe(18_000)
    expect(leader.group_subsidy_cap).toBe(6_000)
    expect(leader.group_breakdown.map(group => group.secondLayer.length)).toEqual([3, 3, 3])
    expect(JSON.parse(JSON.stringify(leader)).group_breakdown).toEqual(leader.group_breakdown)
  })

  it('uses neutral package defaults for legacy Fair rows and output snapshots', () => {
    const input = toEngineInput(baseRows({ orders: [order()] }))
    const payload = toRunPayload(input, computeCommissionRun(input))

    expect(input.scheme).toMatchObject({ groupSalesDepth: null, overrideDepth: null, enableGroupIncentive: false })
    expect(input.ranks.every(rank => rank.groupIncentiveAmount === 0 && rank.groupSubsidyCap === 0)).toBe(true)
    expect(payload.p_statements[0]).toMatchObject({ group_incentive: 0, group_subsidy_cap: 0, group_breakdown: [], full_spec: false })
  })
})

// ─── An old bill topped up (2026-11-07) ─────────────────────────────────────

describe('an old bill topped up', () => {
  const old = order({ id: 'old-1', order_no: 'ZNT4813', order_date: '2026-03-14', period_month: '2026-07-01', source: 'erp_sync' })

  it('is commission only: an ERP bill dated before the feed window, in a month from it on', () => {
    const input = toEngineInput(baseRows({ feedFloor: '2026-06-01', orders: [old, order({ source: 'erp_sync' })] }))
    expect(input.orders.find(o => o.id === 'old-1')?.commissionOnly).toBe(true)
    expect(input.orders.find(o => o.id === 'order-1')).not.toHaveProperty('commissionOnly')
  })

  it('is nothing of the kind without a window, or from a file', () => {
    expect(toEngineInput(baseRows({ orders: [old] })).orders[0]).not.toHaveProperty('commissionOnly')
    expect(toEngineInput(baseRows({ feedFloor: '2026-06-01', orders: [{ ...old, source: 'file' }] })).orders[0])
      .not.toHaveProperty('commissionOnly')
  })

  it('is released once paid, so no later month pays it again', () => {
    const input = toEngineInput(baseRows({ feedFloor: '2026-06-01', orders: [old] }))
    const result = computeCommissionRun(input)
    expect(releasedOrders(input, result).map(r => r.order_no)).toEqual(['ZNT4813'])
    // 5% of the RM 10,000 that earns, and none of it sales.
    const statement = result.statements.find(s => s.staffId === 'staff-a')!
    expect(statement.productCommission).toBe(500)
    expect(statement.productRevenue).toBe(0)
  })
})

// ─── A brand with its own scheme — 2990s (2026-11-11) ───────────────────────

describe('a brand with its own scheme — 2990s', () => {
  const BRANDS: NonNullable<RunSourceRows['brands']> = [
    { id: 'brand-2990', code: ' 2990s ', own_scheme: true },
    { id: 'brand-akemi', code: 'AKEMI', own_scheme: false },
    { id: 'brand-blank', code: ' ', own_scheme: true },
  ]
  // The rank catalogue keys a rank's rates by the brand's ID; the 5% rank pays 2990s 4%, the 6% one names none.
  const ranks: RunSourceRows['ranks'] = [
    { ...RANKS[0], comm_rank_defs: { brand_rates: { 'brand-2990': 0.04, 'brand-akemi': 0.03, 'brand-gone': 0.02 } } },
    { ...RANKS[1], comm_rank_defs: [{ brand_rates: {} }] },
  ]
  // A mattress and a pillow that is one of the sub-department's KPI items (RM 50).
  const lines: RunSourceRows['orders'][number]['sales_order_lines'] = [
    { id: 'line-1', item_group: 'MATTRESS', product_code: 'MAT-01', product_name: 'Mattress', qty: '1.000', line_amount: '10000.00', brand_code: null, cost_amount: null },
    { id: 'line-2', item_group: 'MATTRESS', product_code: 'PIL-01', product_name: 'Pillow', qty: '1.000', line_amount: '100.00', brand_code: null, cost_amount: null },
  ]
  const bill = (brand: string | null) =>
    order({ brand_code: brand, order_total: '10100.00', paid_amount: '10100.00', sales_order_lines: lines })

  it('knows which brands follow their own scheme: the code a bill carries, by the brand’s id', () => {
    expect([...ownSchemeBrandsOf(BRANDS)]).toEqual([['brand-2990', '2990S']])
    expect([ownSchemeBrandsOf(undefined).size, ownSchemeBrandsOf([{ id: 'b', code: 'AKEMI' }]).size]).toEqual([0, 0])
  })

  it('reads a rank’s rates by the brand’s code — only for a brand on its own scheme, only a rate from 0 to 1', () => {
    const own = ownSchemeBrandsOf(BRANDS)
    expect(toBrandRates({ 'brand-2990': 0.04, 'brand-akemi': 0.03, 'brand-gone': 0.02 }, own)).toEqual({ '2990S': 0.04 })
    expect(toBrandRates({ 'brand-2990': '0.045' }, own)).toEqual({ '2990S': 0.045 })
    expect(toBrandRates({ 'BRAND-2990': 0 }, own)).toEqual({ '2990S': 0 })
    for (const bad of [{ 'brand-2990': 4 }, { 'brand-2990': -0.01 }, { 'brand-2990': 'x' }, { 'brand-2990': null }, {}, [0.04], null, 'x']) {
      expect(toBrandRates(bad, own)).toBeUndefined()
    }
    expect(toBrandRates({ 'brand-2990': 0.04 }, new Map())).toBeUndefined()
  })

  it('hands the engine the brands and each rung’s rates — and nothing at all while no brand follows its own scheme', () => {
    const input = toEngineInput(baseRows({ ranks, brands: BRANDS }))
    expect(input.ownSchemeBrands).toEqual(['2990S'])
    expect(input.ranks[0].brandRates).toEqual({ '2990S': 0.04 })
    expect(input.ranks[1]).not.toHaveProperty('brandRates')

    const plain = toEngineInput(baseRows({ ranks }))
    expect(plain).not.toHaveProperty('ownSchemeBrands')
    expect(plain.ranks[0]).not.toHaveProperty('brandRates')
  })

  it('pays its bill the rank’s rate for the brand, on all of it: the sub-department’s KPI item is not found there', () => {
    const input = toEngineInput(baseRows({ ranks, brands: BRANDS, orders: [bill('2990S')] }))
    const result = computeCommissionRun(input)
    const statement = result.statements.find(s => s.staffId === 'staff-a')!
    // 4% of RM 10,100 — the pillow's RM 100 with it, no RM 50 KPI carved out.
    expect([statement.productCommission, statement.totalCommission]).toEqual([404, 404])
    expect(statement.lines.map(l => l.component)).toEqual(['product_revenue'])
    expect(statement.marginPct).toBeNull()
    expect(result.warnings).toEqual([])
  })

  it('pays the same bill under any other brand as ever: the rank’s own rate, the KPI item paid flat', () => {
    const input = toEngineInput(baseRows({ ranks, brands: BRANDS, orders: [bill('AKEMI')] }))
    const statement = computeCommissionRun(input).statements.find(s => s.staffId === 'staff-a')!
    // 5% of RM 10,050, and the pillow's RM 50.
    expect(statement.productCommission).toBe(502.5)
    expect(statement.lines.map(l => l.component).sort()).toEqual(['kpi_item', 'product_revenue'])
  })

  it('releases the bill on its whole commissionable value', () => {
    const input = toEngineInput(baseRows({ ranks, brands: BRANDS, orders: [bill(' 2990s ')] }))
    const released = releasedOrders(input, computeCommissionRun(input))
    expect(released.map(r => [r.order_no, r.product_revenue])).toEqual([['SO-001', 10100]])
  })

  it('reads a brand switched off as no brand on its own scheme — as the database’s readers do', () => {
    expect(ownSchemeBrandsOf([{ id: 'brand-2990', code: '2990S', own_scheme: true, is_active: false }]).size).toBe(0)
    expect([...ownSchemeBrandsOf([{ id: 'brand-2990', code: '2990S', own_scheme: true, is_active: true }])]).toEqual([['brand-2990', '2990S']])
  })

  // 2026-11-12 — the brand's own KPI items (the user: "这个 KPI item 是独立的，属于 2990 专属的 KPI item"; "升级的钱只拿 bonus").
  describe('its own KPI items', () => {
    const KPI: RunSourceRows['kpiItems'] = [
      { source: 'option', product_code: null, product_name: 'Upgrade fabric', option_pool: 'sofa_specials', option_value: 'Sofa Full Fabric', kpi_amount: '50.00', brand_id: 'brand-2990', unit_tiers: [] },
      {
        source: 'option', product_code: null, product_name: 'Upgrade latex seat', option_pool: 'sofa_specials', option_value: 'Latex Seat', kpi_amount: '50.00',
        brand_id: 'BRAND-2990', unit_tiers: [{ min_qty: 10, amount: 100 }, { min_qty: 5, amount: 70 }],
      },
      // The sub-department's own, and one of a brand that is not on its own scheme.
      { source: 'sku', product_code: 'PIL-01', product_name: 'Pillow', kpi_amount: '50.00', brand_id: null },
      { source: 'option', product_code: null, product_name: 'Stray', option_pool: 'sofa_specials', option_value: 'Latex Seat', kpi_amount: '9.00', brand_id: 'brand-akemi' },
    ]
    // 2990-SO-2611-022 as production holds it: a sofa of two pieces at RM 3,240, Sofa Full Fabric RM 250 on both; delivery RM 250.
    const sofa: RunSourceRows['orders'][number]['sales_order_lines'] = [
      { id: 'sofa-1', item_group: 'SOFA', product_code: 'TELLUC-2A(LHF)', product_name: 'TELLUC', qty: '1.000', line_amount: '1620.00', brand_code: '2990S', cost_amount: null, variants: { specials: ['Sofa Full Fabric'] } },
      { id: 'sofa-2', item_group: 'SOFA', product_code: 'TELLUC-L(RHF)', product_name: 'TELLUC', qty: '1.000', line_amount: '1620.00', brand_code: '2990S', cost_amount: null, variants: { specials: ['Sofa Full Fabric'] } },
      { id: 'svc', item_group: 'TRANS', product_code: 'SVC-DELIVERY', product_name: 'Delivery', qty: '1.000', line_amount: '250.00', brand_code: '2990S', cost_amount: null },
    ]
    const MONEY: RunSourceRows['specialMoney'] = [
      { line_id: 'sofa-1', special_key: 'sofa full fabric', amount: '250.00' },
      { line_id: 'sofa-2', special_key: 'sofa full fabric', amount: '250.00' },
      { line_id: 'sofa-2', special_key: 'miscellaneous', amount: 10 },
      { line_id: 'sofa-1', special_key: 'given away', amount: 0 },
      { line_id: '', special_key: 'sofa full fabric', amount: 250 },
    ]
    const rows = () => baseRows({
      ranks, brands: BRANDS, kpiItems: KPI, specialMoney: MONEY,
      itemGroups: [{ item_group: 'SOFA', commissionable: true }, { item_group: 'TRANS', commissionable: false }],
      scheme: { ...SCHEME, enable_kpi: false },
      orders: [order({ brand_code: '2990S', order_total: '3490.00', paid_amount: '3490.00', sales_order_lines: sofa })],
    })

    it('reads the items with their brand’s code and their tiers lowest first; one of a brand not on its own scheme is nobody’s', () => {
      expect(toEngineInput(rows()).kpiItems).toEqual([
        { source: 'option', optionPool: 'sofa_specials', optionValue: 'Sofa Full Fabric', label: 'Upgrade fabric', kpiAmount: 50, brandCode: '2990S' },
        {
          source: 'option', optionPool: 'sofa_specials', optionValue: 'Latex Seat', label: 'Upgrade latex seat', kpiAmount: 50, brandCode: '2990S',
          unitTiers: [{ minQty: 5, amount: 70 }, { minQty: 10, amount: 100 }],
        },
        { source: 'sku', productCode: 'PIL-01', label: 'Pillow', kpiAmount: 50 },
      ])
    })

    it('puts on each line what its special order charges, by the special’s name', () => {
      const [first, second, delivery] = toEngineInput(rows()).orders[0].lines
      expect(first.specialMoney).toEqual({ 'sofa full fabric': 250 })
      expect(second.specialMoney).toEqual({ 'sofa full fabric': 250, miscellaneous: 10 })
      expect(delivery).not.toHaveProperty('specialMoney')
      expect([...specialMoneyByLine(undefined)]).toEqual([])
    })

    it('pays the bill 4% of 2,990 and the RM 50 bonus — RM 169.60 — with the sub-department’s KPI switched off', () => {
      const input = toEngineInput(rows())
      const result = computeCommissionRun(input)
      const statement = result.statements.find(s => s.staffId === 'staff-a')!
      expect([statement.productRevenue, statement.productCommission, statement.kpiCommission, statement.totalCommission]).toEqual([2_990, 119.6, 50, 169.6])
      expect(result.warnings).toEqual([])
      // …and releases it on what earned commission.
      expect(releasedOrders(input, result).map(r => [r.order_no, r.product_revenue])).toEqual([['SO-001', 2_990]])
    })

    it('a special whose price is in the remark takes nothing off: its bonus is paid on top of 4% of the whole sofa', () => {
      // The same sofa at RM 3,490, its fabric upgrade's RM 250 … and a latex seat whose RM 500 is in the remark, not on
      // the bill's special order (2026-11-14: what comes off is what the bill charged — no cost is typed any more).
      const lines = sofa.map(l => (l.item_group === 'SOFA'
        ? { ...l, line_amount: '1870.00', variants: { specials: ['Sofa Full Fabric', 'Latex Seat'] } } : l))
      const input = toEngineInput(baseRows({
        ranks, brands: BRANDS, specialMoney: MONEY, kpiItems: KPI,
        itemGroups: [{ item_group: 'SOFA', commissionable: true }, { item_group: 'TRANS', commissionable: false }],
        scheme: { ...SCHEME, enable_kpi: false },
        orders: [order({ brand_code: '2990S', order_total: '3990.00', paid_amount: '3990.00', sales_order_lines: lines })],
      }))
      const statement = computeCommissionRun(input).statements.find(s => s.staffId === 'staff-a')!
      // 3,740 of sofa − 250 the bill charged for the fabric = 3,490; RM 50 + RM 50.
      expect([statement.productRevenue, statement.productCommission, statement.kpiCommission, statement.totalCommission]).toEqual([3_490, 139.6, 100, 239.6])
    })

    // 2026-11-14 — the user: "我只需要像 Fair 一样选 KPI 就好，不需要去选它的 cost"; "by model、by special 或者是 by
    // compartment"; what comes off is what the bill charged ("扣掉再发 bonus"), a compartment once a set ("每组沙发算 1 个").
    describe('of every kind, found on its own company’s SKU master and fabric list', () => {
      const OWN_BRANDS = BRANDS.map(b => (b.id === 'brand-2990' ? { ...b, erp_company_id: 2 } : b))
      const ITEMS: RunSourceRows['kpiItems'] = [
        { source: 'option', product_code: null, product_name: null, option_pool: 'models', option_value: 'Boaat', kpi_amount: '40.00', brand_id: 'brand-2990' },
        { source: 'option', product_code: null, product_name: null, option_pool: 'compartments', option_value: 'CNR', kpi_amount: '30.00', brand_id: 'brand-2990' },
        {
          source: 'option', product_code: null, product_name: 'EZ · Sofa fabric', option_pool: 'sofa_fabric_series', option_value: 'EZ',
          kpi_amount: '50.00', brand_id: 'brand-2990',
        },
        { source: 'sku', product_code: 'SQUARE PILLOW-M', product_name: 'Square pillow', kpi_amount: '10.00', brand_id: 'brand-2990' },
        // A model of the sub-department's (the database refuses one) is nobody's.
        { source: 'option', product_code: null, product_name: null, option_pool: 'models', option_value: 'Boaat', kpi_amount: '99.00', brand_id: null },
      ]
      const SKU_MODELS: NonNullable<RunSourceRows['brandSkuModels']> = [
        { erp_company_id: 2, item_code: 'BOAAT-2A', base_model: 'Boaat', erp_id: '9001' },
        { erp_company_id: '2', item_code: ' boaat-cnr ', base_model: 'Boaat', erp_id: '9002' },
        // Houzs' own SKU of a code is not 2990s'.
        { erp_company_id: 1, item_code: 'XAMMAR-2A(LHF)', base_model: 'Xammar', erp_id: '1001' },
      ]
      // EZ-007 has no series on 2990s' list — its code's family, EZ; Houzs' list calls the same code EASY.
      const FABRICS: NonNullable<RunSourceRows['fabrics']> = [
        { fabric_code: 'EZ-007', series: null, erp_company_id: 2 },
        { fabric_code: 'EZ-007', series: 'EASY', erp_company_id: 1 },
      ]
      const piece = (id: string, product_code: string, line_amount: string, variants?: unknown) => ({
        id, item_group: 'SOFA', product_code, product_name: product_code, qty: '1.000', line_amount, brand_code: '2990S', cost_amount: null,
        ...(variants ? { variants } : {}),
      })
      const boaat = order({
        id: 'order-boaat', order_no: '2990-SO-1', brand_code: '2990S', order_total: '3250.00', paid_amount: '3250.00',
        sales_order_lines: [
          piece('b-1', 'BOAAT-2A', '2000.00', { fabricCode: 'EZ-007' }),
          piece('b-2', 'BOAAT-CNR', '1000.00', { fabricCode: 'EZ-007' }),
          { id: 'b-svc', item_group: 'TRANS', product_code: 'SVC-DELIVERY', product_name: 'Delivery', qty: '1.000', line_amount: '250.00', brand_code: '2990S', cost_amount: null },
        ],
      })
      const xammar = order({
        id: 'order-xammar', order_no: '2990-SO-2', brand_code: '2990S', order_total: '4000.00', paid_amount: '4000.00',
        sales_order_lines: [piece('x-1', 'XAMMAR-2A(LHF)', '1500.00'), piece('x-2', 'XAMMAR-CNR', '1000.00'), piece('x-3', 'XAMMAR-2A(RHF)', '1500.00')],
      })
      const rows = (orders = [boaat, xammar]) => baseRows({
        ranks, brands: OWN_BRANDS, kpiItems: ITEMS, fabrics: FABRICS, brandSkuModels: SKU_MODELS,
        itemGroups: [{ item_group: 'SOFA', commissionable: true }, { item_group: 'TRANS', commissionable: false }],
        scheme: { ...SCHEME, enable_kpi: false },
        orders,
      })

      it('reads the brand’s items of every kind', () => {
        expect(toEngineInput(rows()).kpiItems).toEqual([
          { source: 'option', optionPool: 'models', optionValue: 'Boaat', label: null, kpiAmount: 40, brandCode: '2990S' },
          { source: 'option', optionPool: 'compartments', optionValue: 'CNR', label: null, kpiAmount: 30, brandCode: '2990S' },
          { source: 'option', optionPool: 'sofa_fabric_series', optionValue: 'EZ', label: 'EZ · Sofa fabric', kpiAmount: 50, brandCode: '2990S' },
          { source: 'sku', productCode: 'SQUARE PILLOW-M', label: 'Square pillow', kpiAmount: 10, brandCode: '2990S' },
        ])
      })

      it('puts on a brand’s line its model and its fabric’s family — on its own company’s lists only', () => {
        const [b, x] = toEngineInput(rows()).orders
        expect(b.lines.map(l => [l.id, l.model, l.fabricSeries])).toEqual([
          ['b-1', 'Boaat', 'EZ'], ['b-2', 'Boaat', 'EZ'], ['b-svc', undefined, undefined],
        ])
        expect(x.lines.map(l => l.model)).toEqual([undefined, undefined, undefined])
        // A bill of any other brand reads Houzs' list, and no model.
        const houzs = toEngineInput(rows([{ ...boaat, brand_code: 'AKEMI' }])).orders[0]
        expect(houzs.lines.map(l => [l.model, l.fabricSeries])).toEqual([[undefined, 'EASY'], [undefined, 'EASY'], [undefined, undefined]])
      })

      it('takes off what the bill charged — the Boaat whole, the Xammar’s corner once — and pays the bonuses', () => {
        const input = toEngineInput(rows())
        const result = computeCommissionRun(input)
        const statement = result.statements.find(s => s.staffId === 'staff-a')!
        // Boaat: RM 3,000 of sofa off for the model (its corner is the model's, no compartment's), RM 40 + RM 50 EZ.
        // Xammar: RM 1,000 of corner off, RM 30. 4% of what is left, RM 3,000 = RM 120; bonuses RM 120.
        expect([statement.productRevenue, statement.productCommission, statement.kpiCommission, statement.totalCommission]).toEqual([3_000, 120, 120, 240])
        expect(result.warnings).toEqual([])
      })
    })
  })

  describe('kpiLineReaders — how a bill’s lines are read for KPI items', () => {
    const OWN = [{ id: 'brand-2990', code: ' 2990s ', own_scheme: true, erp_company_id: '2' }, { id: 'brand-off', code: 'OFF', own_scheme: true, is_active: false, erp_company_id: 3 }]

    it('knows a brand’s bill’s company — none for a bill of a brand not on its own scheme, or switched off', () => {
      const readers = kpiLineReaders(OWN, [], [])
      expect(['2990S', ' 2990s ', 'OFF', 'AKEMI', null].map(code => readers.companyOf(code))).toEqual([2, 2, null, null, null])
      // A brand with no company of its own reads the ERP's first.
      expect(kpiLineReaders([{ id: 'b', code: '2990S', own_scheme: true }], [], []).companyOf('2990S')).toBe(1)
    })

    it('reads a code’s base model from a live SKU first, then the first by its id', () => {
      const readers = kpiLineReaders(OWN, [], [
        { erp_company_id: 2, item_code: 'LOTTI-2A', base_model: 'Lotti old', erp_id: '1', removed_at: '2026-10-01' },
        { erp_company_id: 2, item_code: 'LOTTI-2A', base_model: 'Lotti', erp_id: '9' },
        { erp_company_id: 2, item_code: 'LOTTI-2A', base_model: 'Lotti B', erp_id: '5' },
        { erp_company_id: 2, item_code: 'BLANK-1', base_model: '  ', erp_id: '2' },
      ])
      expect(readers.modelOf(2, ' lotti-2a ')).toBe('Lotti B')
      expect(readers.modelOf(2, 'BLANK-1')).toBeUndefined()
      expect(readers.modelOf(null, 'LOTTI-2A')).toBeUndefined()
      expect(readers.modelOf(3, 'LOTTI-2A')).toBeUndefined()
    })
  })
})
