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
      open_bill_basis: 'uplift_on_commission', override_includes_kpi: false,
      deposit_threshold_pct: 0.3, default_rate_mode: 'fixed',
      enable_product_revenue: true, enable_kpi: true, enable_open_bill: true,
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
    for (const table of ['comm_hierarchy', 'comm_kpi_items', 'comm_kpi_thresholds', 'comm_open_bill_rules']) {
      expect(db.requests.filter(request => request.table === table)).toHaveLength(1)
    }

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

  it('refuses incomplete configuration instead of silently returning zero commission', async () => {
    const db = database(fixture(), 'comm_kpi_items')
    await expect(loadCommissionInput('2026-09-01', 'sub-1', db.client)).rejects.toThrow('Could not read KPI items')
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
      data.comm_open_bill_rules = [{ id: 'open-1', scheme_id: 'scheme-1', bill_rank: 1, pct: '0.5', effective_from: '2026-10-01', effective_to: null }]
      const loaded = await loadCommissionInput('2026-09-01', 'sub-1', database(data).client, { includeCurrentRules: true })
      expect(loaded.input.hierarchy).toEqual([])
      expect(loaded.input.kpiItems).toEqual([])
      expect(loaded.input.kpiThresholds).toEqual([])
      expect(loaded.input.openBillRules).toEqual([])
      expect(loaded.input.scheme.enableKpi).toBe(false)
      expect(loaded.currentHierarchy).toMatchObject([{ staffId: 'person-a', baseRankKey: 'r5', titleId: 'title-1' }])
      expect(loaded.currentRules).toEqual({
        hierarchy: loaded.currentHierarchy,
        kpiItems: [{ productCode: 'PILLOW', kpiAmount: 20 }],
        kpiThresholds: [{ minQty: 10, bonusPct: 0.2 }],
        openBillRules: [{ rank: 1, pct: 0.5 }],
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
