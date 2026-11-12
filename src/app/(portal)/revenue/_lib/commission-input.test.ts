import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { loadCommissionInput } from './commission-input'

type Row = Record<string, unknown>

/** A PostgREST-like cap makes a missing range visible in these regressions. `rpcRows`: what a function answers. */
function database(tables: Record<string, Row[]>, failedTable?: string, rpcRows: Record<string, Row[]> = {}) {
  const requests: { table: string; from: number; to: number }[] = []
  const rpcs: { fn: string; args: unknown }[] = []
  const rpc = (fn: string, args: unknown) => {
    rpcs.push({ fn, args })
    let low = 0
    let high = 999
    const answer = {
      order: () => answer,
      range: (from: number, to: number) => { low = from; high = to; return answer },
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: (rpcRows[fn] ?? []).slice(low, high + 1), error: null }).then(resolve),
    }
    return answer
  }
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
  return { client: { from, rpc } as unknown as SupabaseClient, requests, rpcs }
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

  // 2026-11-11 — 2990s: a brand that follows its own scheme.
  describe('a brand with its own scheme', () => {
    const upsale = (id: string, bill: string, amount = 500) => ({
      id, sub_department_id: 'sub-1', period_month: '2026-09-01', status: 'confirmed', kind: amount < 0 ? 'drop' : 'upsale',
      staff_id: 'person-a', amount, sold_on: '2026-09-18', original_ref: id.toUpperCase(), settled_order_id: bill,
    })
    const withBrand = () => {
      const data = fixture()
      data.comm_order_releases = []
      data.comm_brands = [
        { id: 'brand-2990', scheme_id: 'scheme-1', code: '2990S', own_scheme: true },
        { id: 'brand-akemi', scheme_id: 'scheme-1', code: 'AKEMI', own_scheme: false },
        // Another scheme's: not this run's to read.
        { id: 'brand-outlet', scheme_id: 'scheme-2', code: 'OUTLET', own_scheme: true },
      ]
      data.comm_ranks[0].comm_rank_defs = { brand_rates: { 'brand-2990': 0.04, 'brand-outlet': 0.01 } }
      data.sales_orders = [order('current', '2026-09-01', { brand_code: '2990S' }), order('hc', '2026-09-01', { brand_code: 'AKEMI' })]
      data.comm_upsales = [upsale('p1', 'current'), upsale('p2', 'hc'), upsale('p3', 'current', -200)]
      return data
    }

    it('reads the scheme’s brands on their own scheme and each rank’s rate for them', async () => {
      const loaded = await loadCommissionInput('2026-09-01', 'sub-1', database(withBrand()).client)
      expect(loaded.input.ownSchemeBrands).toEqual(['2990S'])
      expect(loaded.input.ranks[0].brandRates).toEqual({ '2990S': 0.04 })
      expect(loaded.input.orders.filter(o => !o.upsale).map(o => [o.id, o.brandCode])).toEqual([['current', '2990S'], ['hc', 'AKEMI']])
    })

    it('gives an upsell or a drop the brand of the bill it changed — only where that brand follows its own scheme', async () => {
      const loaded = await loadCommissionInput('2026-09-01', 'sub-1', database(withBrand()).client)
      const brandOf = Object.fromEntries(loaded.input.orders.filter(o => o.upsale).map(o => [o.orderNo, o.brandCode ?? null]))
      expect(brandOf).toEqual({ 'UPSALE P1': '2990S', 'UPSALE P2': null, 'DROP P3': '2990S' })
    })

    it('asks for no bill’s brand, and hands the engine no brand, while none follows its own scheme', async () => {
      const data = withBrand()
      data.comm_brands = data.comm_brands.map(b => ({ ...b, own_scheme: false }))
      const db = database(data)
      const loaded = await loadCommissionInput('2026-09-01', 'sub-1', db.client)
      expect(loaded.input).not.toHaveProperty('ownSchemeBrands')
      expect(loaded.input.ranks[0]).not.toHaveProperty('brandRates')
      expect(loaded.input.orders.filter(o => o.upsale).every(o => !o.brandCode)).toBe(true)
      // The month's bills and the earlier months' — never a third read for the bills behind the upsells.
      expect(db.requests.filter(r => r.table === 'sales_orders')).toHaveLength(2)
    })

    // 2026-11-12 — the brand's own KPI items, found where its bill's special order charges for them.
    const kpiRow = (id: string, extra: Row) => ({
      id, scheme_id: 'scheme-1', source: 'option', product_code: null, product_name: null, option_pool: 'sofa_specials',
      option_value: 'Latex Seat', kpi_amount: '50.00', brand_id: null, unit_tiers: [], effective_from: '2026-09-01', effective_to: null, ...extra,
    })
    const withItems = () => {
      const data = withBrand()
      data.comm_upsales = []
      data.comm_kpi_items = [
        kpiRow('kpi-latex', { product_name: 'Upgrade latex seat', brand_id: 'brand-2990', unit_tiers: [{ min_qty: 5, amount: 70 }] }),
        kpiRow('kpi-own', { kpi_amount: '40.00' }),
        // Another scheme's brand is no brand of this run's: its item is found on no bill — never read as the sub-department's own.
        kpiRow('kpi-stray', { product_name: 'Stray', option_value: 'Nylon Fabric', brand_id: 'brand-outlet' }),
      ]
      data.sales_order_lines = [
        { id: 'line-own', order_id: 'current', item_group: 'sofa', product_code: 'BOAAT-2A', qty: 1, line_amount: 1000, cost_amount: null, variants: { specials: ['Latex Seat'] } },
        { id: 'line-hc', order_id: 'hc', item_group: 'sofa', product_code: '8030-2A', qty: 1, line_amount: 1000, cost_amount: 600, variants: { specials: ['Latex Seat'] } },
      ]
      return data
    }
    const MONEY = { sales_order_special_money: [{ order_id: 'current', line_id: 'line-own', special_key: 'latex seat', amount: '500.00' }] }

    it('reads a brand’s own KPI items with its code and tiers, and what its bills’ special orders charge — for those bills alone', async () => {
      const db = database(withItems(), undefined, MONEY)
      const loaded = await loadCommissionInput('2026-09-01', 'sub-1', db.client)
      expect(loaded.input.kpiItems).toEqual([
        { source: 'option', optionPool: 'sofa_specials', optionValue: 'Latex Seat', label: 'Upgrade latex seat', kpiAmount: 50, brandCode: '2990S', unitTiers: [{ minQty: 5, amount: 70 }] },
        { source: 'option', optionPool: 'sofa_specials', optionValue: 'Latex Seat', label: null, kpiAmount: 40 },
      ])
      // Asked once, for the 2990s bill alone — never the Akemi one.
      expect(db.rpcs).toEqual([{ fn: 'sales_order_special_money', args: { p_order_ids: ['current'] } }])
      const lineOf = (orderId: string) => loaded.input.orders.find(o => o.id === orderId)!.lines[0]
      expect(lineOf('current')).toMatchObject({ specials: ['Latex Seat'], specialMoney: { 'latex seat': 500 } })
      expect(lineOf('hc')).not.toHaveProperty('specialMoney')
    })

    it('asks for no special order while no brand has an item of its own, or the brand is switched off', async () => {
      const none = withItems()
      none.comm_kpi_items = [kpiRow('kpi-own', { kpi_amount: '40.00' })]
      const db = database(none, undefined, MONEY)
      await loadCommissionInput('2026-09-01', 'sub-1', db.client)
      expect(db.rpcs).toEqual([])

      const off = withItems()
      off.comm_brands = off.comm_brands.map(b => (b.id === 'brand-2990' ? { ...b, is_active: false } : b))
      const switchedOff = database(off, undefined, MONEY)
      const loaded = await loadCommissionInput('2026-09-01', 'sub-1', switchedOff.client)
      expect(switchedOff.rpcs).toEqual([])
      // Its bills are ordinary bills again, and its item is nobody's.
      expect(loaded.input).not.toHaveProperty('ownSchemeBrands')
      expect(loaded.input.kpiItems).toEqual([{ source: 'option', optionPool: 'sofa_specials', optionValue: 'Latex Seat', label: null, kpiAmount: 40 }])
    })
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
