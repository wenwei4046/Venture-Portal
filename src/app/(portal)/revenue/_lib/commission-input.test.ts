import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { loadCommissionInput } from './commission-input'

type Row = Record<string, unknown>

/** A PostgREST-like cap makes a missing range visible in these regressions. */
function database(tables: Record<string, Row[]>, failedTable?: string) {
  const requests: { table: string; from: number; to: number }[] = []
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = []
    let low = 0
    let high = 999
    const value = (row: Row, key: string): unknown => key.split('.').reduce<unknown>(
      (current, part) => current && typeof current === 'object' ? (current as Row)[part] : undefined, row,
    )
    const execute = () => {
      requests.push({ table, from: low, to: high })
      return failedTable === table
        ? { data: null, error: { message: 'read denied' } }
        : { data: (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(low, high + 1), error: null }
    }
    const query = {
      select: () => query,
      order: () => query,
      eq: (key: string, expected: unknown) => { filters.push(row => value(row, key) === expected); return query },
      is: (key: string, expected: unknown) => { filters.push(row => value(row, key) === expected); return query },
      lt: (key: string, expected: string) => { filters.push(row => String(value(row, key)) < expected); return query },
      lte: (key: string, expected: string) => { filters.push(row => String(value(row, key)) <= expected); return query },
      in: (key: string, expected: string[]) => { filters.push(row => expected.includes(String(value(row, key)))); return query },
      or: (clause: string) => {
        const date = clause.match(/^effective_to\.is\.null,effective_to\.gte\.(\d{4}-\d{2}-\d{2})$/)?.[1]
        if (date) filters.push(row => row.effective_to === null || (typeof row.effective_to === 'string' && row.effective_to >= date))
        return query
      },
      range: (from: number, to: number) => { low = from; high = to; return query },
      maybeSingle: () => { const result = execute(); return Promise.resolve({ ...result, data: result.data?.[0] ?? null }) },
      then: (resolve: (result: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    }
    return query
  }
  return { client: { from } as unknown as SupabaseClient, requests }
}

function order(id: string, period = '2026-09-01', extra: Row = {}): Row {
  return {
    id, order_no: id, staff_id: 'person-a', order_date: period, event_date: period,
    period_month: period, order_total: 1000, paid_amount: 1000, manual_margin_pct: null,
    batch_id: period === '2026-09-01' ? 'batch-current' : 'batch-prior', cancelled: false,
    sales_import_batches: { status: 'committed', sub_department_id: 'sub-1' }, ...extra,
  }
}

function fixture(): Record<string, Row[]> {
  return {
    comm_schemes: [{
      id: 'scheme-1', sub_department_id: 'sub-1', is_active: true, effective_to: null,
      override_includes_kpi: false,
      deposit_threshold_pct: 0.3, default_rate_mode: 'fixed',
      enable_product_revenue: true, enable_kpi: true,
      enable_override: true, enable_margin_penalty: true, enable_margin_incentive: true,
    }],
    sales_import_batches: [{ id: 'batch-current', sub_department_id: 'sub-1', period_month: '2026-09-01', status: 'committed' }],
    comm_ranks: [{
      id: 'rank-1', scheme_id: 'scheme-1', rank_key: 'r5', title_id: 'title-1',
      titles: { name: 'Revenue Specialist' }, label: '5%', product_rate: 0.05,
      can_recruit: true, sort_order: 1, consecutive_months: 2,
    }],
    comm_hierarchy: [{
      id: 'member-1', scheme_id: 'scheme-1', staff_id: 'person-a', upline_staff_id: null,
      rate_mode: 'fixed', title_id: 'title-1', comm_ranks: { rank_key: 'r5' }, effective_from: '2026-01-01', effective_to: null,
    }],
    comm_item_groups: [{ id: 'group-1', scheme_id: 'scheme-1', item_group: 'SOFA', commissionable: true }],
    sales_orders: [order('current'), order('carry', '2026-08-01'), order('older-paid', '2026-08-01')],
    sales_order_lines: [{ id: 'line-1', order_id: 'current', item_group: 'SOFA', product_code: 'SOFA-1', qty: 1, line_amount: 1000, cost_amount: 600 }],
    comm_order_releases: [
      { order_no: 'current', sub_department_id: 'sub-1', run_id: 'run-current' },
      { order_no: 'carry', sub_department_id: 'sub-1', run_id: 'run-current' },
      { order_no: 'older-paid', sub_department_id: 'sub-1', run_id: 'run-prior' },
    ],
    comm_runs: [
      { id: 'run-current', sub_department_id: 'sub-1', period_month: '2026-09-01' },
      { id: 'run-prior', sub_department_id: 'sub-1', period_month: '2026-08-01' },
    ],
    comm_statements: [{ id: 'statement-1', run_id: 'run-prior', staff_id: 'person-a', product_revenue: 2000 }],
  }
}

describe('authoritative commission input', () => {
  it('keeps normal saving release rules and replays only the selected run for read-only previews', async () => {
    const db = database(fixture())
    const saved = await loadCommissionInput('2026-09-01', 'sub-1', db.client)
    expect(saved.input.orders.map(row => [row.id, row.alreadyReleased])).toEqual([['current', true]])
    expect(saved.currentHierarchy).toEqual([])
    for (const table of ['comm_hierarchy', 'comm_kpi_items', 'comm_kpi_thresholds']) {
      expect(db.requests.filter(request => request.table === table)).toHaveLength(1)
    }
    // Open Bill went (2026-10-31): none of its tables is read, its picks included.
    expect(db.requests.filter(request => /open_bill/.test(request.table))).toEqual([])

    const preview = await loadCommissionInput('2026-09-01', 'sub-1', db.client, { replayRunId: 'run-current' })
    expect(preview.input.orders.map(row => [row.id, row.alreadyReleased])).toEqual([['current', false], ['carry', false]])
    expect(preview.input.priorMonths?.[0].personalRevenue['person-a']).toBe(2000)
    await expect(loadCommissionInput('2026-09-01', 'sub-1', db.client, { replayRunId: 'run-prior' }))
      .rejects.toThrow('does not belong to this month')
  })

  it('pages orders, line children and previous statements without losing financial rows at 1,000', async () => {
    const data = fixture()
    data.comm_order_releases = []
    data.sales_orders = Array.from({ length: 1001 }, (_, index) => order(`order-${index}`))
    data.sales_order_lines = Array.from({ length: 1001 }, (_, index) => ({
      id: `line-${index}`, order_id: 'order-0', item_group: 'SOFA', product_code: 'SOFA-1', qty: 1, line_amount: 1, cost_amount: 0.6,
    }))
    data.comm_statements = Array.from({ length: 1001 }, (_, index) => ({
      id: `statement-${index}`, run_id: 'run-prior', staff_id: `person-${index}`, product_revenue: index,
    }))
    const db = database(data)
    const loaded = await loadCommissionInput('2026-09-01', 'sub-1', db.client)
    expect(loaded.input.orders).toHaveLength(1001)
    expect(loaded.input.orders[0].lines).toHaveLength(1001)
    expect(loaded.input.priorMonths?.[0].personalRevenue['person-1000']).toBe(1000)
    for (const table of ['sales_orders', 'sales_order_lines', 'comm_statements']) {
      expect(db.requests.some(request => request.table === table && request.from === 1000)).toBe(true)
    }
  })

  it('never carries a bill of a month the portal does not pay (VP 从九月开始付)', async () => {
    const data = fixture()
    data.comm_order_releases = []
    data.comm_cutovers = [{ sub_department_id: 'sub-1', first_paid_month: '2026-09-01' }]
    const settled = await loadCommissionInput('2026-09-01', 'sub-1', database(data).client)
    expect(settled.input.orders.map(row => row.id)).toEqual(['current'])

    // Earlier, August is the portal's own month again: once it is closed for
    // its salesperson, its unpaid bills ride.
    data.comm_cutovers = [{ sub_department_id: 'sub-1', first_paid_month: '2026-08-01' }]
    data.comm_salesperson_closes = [{ id: 'close-1', sub_department_id: 'sub-1', staff_id: 'person-a', period_month: '2026-08-01', reopened_at: null }]
    const carried = await loadCommissionInput('2026-09-01', 'sub-1', database(data).client)
    expect(carried.input.orders.map(row => row.id)).toEqual(['current', 'carry', 'older-paid'])
  })

  // 2026-10-06: with nobody closed for September, October's page counted all
  // 357 September bills a second time (Fair RM 185,329.41 for RM 24,834.81).
  it("pays an earlier month's unpaid bill only once that month is closed for its salesperson", async () => {
    const data = fixture()
    data.comm_order_releases = []
    data.sales_orders = [order('current'), order('a-aug', '2026-08-01'), order('b-aug', '2026-08-01', { staff_id: 'person-b' })]
    const ids = async () => (await loadCommissionInput('2026-09-01', 'sub-1', database(data).client)).input.orders.map(row => row.id)

    // August still open for both: its bills are August's to pay.
    expect(await ids()).toEqual(['current'])

    // Person A closed for August: what that close did not pay is September's.
    data.comm_salesperson_closes = [{ id: 'close-a', sub_department_id: 'sub-1', staff_id: 'person-a', period_month: '2026-08-01', reopened_at: null }]
    expect(await ids()).toEqual(['current', 'a-aug'])

    // A reopened close closes nothing.
    data.comm_salesperson_closes = [{ id: 'close-a', sub_department_id: 'sub-1', staff_id: 'person-a', period_month: '2026-08-01', reopened_at: '2026-09-02T00:00:00Z' }]
    expect(await ids()).toEqual(['current'])

    // The whole month's run applied closes it for everybody.
    data.comm_salesperson_closes = []
    data.comm_runs = [...fixture().comm_runs, { id: 'run-aug', sub_department_id: 'sub-1', period_month: '2026-08-01', status: 'applied' }]
    expect(await ids()).toEqual(['current', 'a-aug', 'b-aug'])
  })

  it('pays the upsales and drops somebody answered, never one still waiting', async () => {
    const data = fixture()
    const row = (id: string, amount: number, status: string, kind = amount < 0 ? 'drop' : 'upsale') => ({
      id, sub_department_id: 'sub-1', period_month: '2026-09-01', status, kind,
      staff_id: 'person-a', amount, sold_on: '2026-09-18', original_ref: id.toUpperCase(),
    })
    data.comm_upsales = [
      row('hc5315', 300, 'confirmed'),
      row('hc13911', -2088, 'confirmed'),
      row('hc1', -500, 'pending'),
      row('hc2', 700, 'dismissed'),
    ]
    const loaded = await loadCommissionInput('2026-09-01', 'sub-1', database(data).client)
    const upsales = loaded.input.orders.filter(o => o.upsale)
    expect(upsales.map(o => [o.orderNo, o.orderTotal])).toEqual([['UPSALE HC5315', 300], ['DROP HC13911', -2088]])
  })

  // KRIS and PETER sell a few bills a month and hold no rank by rule (23DIR):
  // the engine is told who they are, so their 0% is not read as a gap.
  it('names whoever heads the department, and nobody else', async () => {
    const data = fixture()
    data.hr_staff_costs = [
      { id: 'kris', titles: { is_department_head: true } },
      { id: 'person-a', titles: { is_department_head: false } },
    ]
    const loaded = await loadCommissionInput('2026-09-01', 'sub-1', database(data).client)
    expect(loaded.input.departmentHeadIds).toEqual(['kris'])
  })

  it('refuses incomplete configuration instead of silently returning zero commission', async () => {
    const db = database(fixture(), 'comm_kpi_items')
    await expect(loadCommissionInput('2026-09-01', 'sub-1', db.client)).rejects.toThrow('Could not read KPI items')
  })

  // Product List › Costing Setting and Rules › KPI items (2026-09-27).
  it("reads the scheme's SKU ratios, its KPI specials, and the specials a line carries", async () => {
    const data = fixture()
    data.comm_cost_ratios = [{ scheme_id: 'scheme-1', erp_product_id: 'mfg-1', product_code: 'SOFA-1', ratio: '0.6000' }]
    data.comm_kpi_items = [{
      id: 'kpi-hb', scheme_id: 'scheme-1', source: 'option', product_code: null, product_name: null,
      option_pool: 'bedframe_specials', option_value: 'HB Straight', kpi_amount: '200.00', effective_from: '2026-09-01', effective_to: null,
    }]
    data.sales_order_lines = [
      { id: 'line-1', order_id: 'current', item_group: 'SOFA', product_code: 'SOFA-1', qty: 1, line_amount: 1000, cost_amount: 600 },
      { id: 'line-2', order_id: 'current', item_group: 'bedframe', product_code: 'TRION (A)-(K)', qty: 1, line_amount: 0, cost_amount: 0,
        description2: 'PC151-01 / DIVAN 8" + NO LEG / SPECIAL: HB Straight', variants: null },
      { id: 'line-3', order_id: 'current', item_group: 'bedframe', product_code: 'CODY-(Q)', qty: 1, line_amount: 0, cost_amount: 0,
        description2: 'ignored when variants arrive', variants: { specials: ['Hydraulic'] } },
    ]
    data.comm_order_releases = []
    const loaded = await loadCommissionInput('2026-09-01', 'sub-1', database(data).client)
    expect(loaded.input.scheme.costRatios).toEqual([{ productCode: 'SOFA-1', ratio: 0.6 }])
    expect(loaded.input.kpiItems).toEqual([
      { source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', label: null, kpiAmount: 200 },
    ])
    const lines = loaded.input.orders.find(o => o.id === 'current')!.lines
    expect(lines.map(l => l.specials)).toEqual([undefined, ['HB Straight'], ['Hydraulic']])
  })

  it('returns the current team separately without silently replacing missing historical membership', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'))
    try {
      const data = fixture()
      data.comm_hierarchy[0].effective_from = '2026-10-01'
      data.comm_schemes[0].enable_kpi = false
      data.comm_kpi_items = [
        { id: 'kpi-1', scheme_id: 'scheme-1', product_code: 'PILLOW', kpi_amount: '20.00', effective_from: '2026-10-01', effective_to: null },
        { id: 'kpi-expired', scheme_id: 'scheme-1', product_code: 'EXPIRED', kpi_amount: 30, effective_from: '2026-10-01', effective_to: '2026-10-15' },
      ]
      data.comm_kpi_thresholds = [{ id: 'threshold-1', scheme_id: 'scheme-1', min_qty: 10, bonus_pct: '0.2', effective_from: '2026-10-01', effective_to: null }]
      const loaded = await loadCommissionInput('2026-09-01', 'sub-1', database(data).client, { includeCurrentRules: true })
      expect(loaded.input.hierarchy).toEqual([])
      expect(loaded.input.kpiItems).toEqual([])
      expect(loaded.input.kpiThresholds).toEqual([])
      expect(loaded.input.scheme.enableKpi).toBe(false)
      expect(loaded.currentHierarchy).toMatchObject([{ staffId: 'person-a', baseRankKey: 'r5', titleId: 'title-1' }])
      expect(loaded.currentRules).toEqual({
        hierarchy: loaded.currentHierarchy,
        kpiItems: [{ source: 'sku', productCode: 'PILLOW', label: null, kpiAmount: 20 }],
        kpiThresholds: [{ minQty: 10, bonusPct: 0.2 }],
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
