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
        comm_ranks: { rank_key: 'rs_5' }, hr_staff_costs: null,
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

  it('carries each rung\'s title, and the title a person holds, into the engine', () => {
    const input = toEngineInput(
      baseRows({
        hierarchy: [
          {
            staff_id: 'staff-a',
            upline_staff_id: null,
            rate_mode: null,
            comm_ranks: { rank_key: 'rs_5' },
            hr_staff_costs: { title_id: 'title-ta' },
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
            comm_ranks: [{ rank_key: 'rs_6' }], hr_staff_costs: null,
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
            comm_ranks: { rank_key: 'rs_5' }, hr_staff_costs: null,
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
          { staff_id: 'staff-a', upline_staff_id: null, rate_mode: null, comm_ranks: null, hr_staff_costs: null },
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
        { staff_id: 'staff-a', upline_staff_id: null, rate_mode: null, comm_ranks: { rank_key: 'rs_6' }, hr_staff_costs: null },
        { staff_id: 'staff-idle', upline_staff_id: 'staff-a', rate_mode: null, comm_ranks: { rank_key: 'rs_5' }, hr_staff_costs: null },
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
