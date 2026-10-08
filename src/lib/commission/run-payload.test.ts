import { describe, expect, it } from 'vitest'
import { computeCommissionRun } from './engine'
import {
  releasedOrders,
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
  open_bill_basis: 'uplift_on_commission',
  override_includes_kpi: false,
  // Deliberately a string: PostgREST returns DECIMAL as text.
  deposit_threshold_pct: '0.500000',
  default_rate_mode: 'variable',
  enable_product_revenue: true,
  enable_kpi: true,
  enable_open_bill: true,
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
    openBillRules: [{ bill_rank: 1, pct: '0.500000' }],
    openBillTags: [],
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
    expect(input.openBillRules[0].pct).toBe(0.5)
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
      enable_open_bill: false,
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
      expect(s.product_commission + s.kpi_commission + s.open_bill_bonus + s.override_commission + s.margin_incentive + s.group_incentive).toBe(s.total_commission)
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
