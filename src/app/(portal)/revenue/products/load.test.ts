import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient }))

import { loadCombos, loadCostingGaps, loadMaintenance, loadMirrorStatus, loadModels, loadSkus } from './load'

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { message: string } | null; count?: number }
type Read = { table: string; from: number; to: number; orders: string[] }
let tables: Record<string, Row[]>
let errors: Record<string, string>
let reads: Read[]
const rpc = vi.fn()

/** Emulate PostgREST's cap and independent pages, including unstable tied rows. */
class Query implements PromiseLike<Result> {
  private columns = '*'
  private filters: Array<(row: Row) => boolean> = []
  private orders: Array<{ column: string; ascending: boolean }> = []
  private from = 0
  private to = 999
  private head = false
  constructor(private table: string) {}
  select(columns: string, options?: { head?: boolean; count?: string }) {
    this.columns = columns
    this.head = options?.head === true
    return this
  }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this }
  is(column: string, value: unknown) { this.filters.push(row => (row[column] ?? null) === value); return this }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false })
    return this
  }
  range(from: number, to: number) { this.from = from; this.to = to; return this }
  limit(count: number) { this.to = count - 1; return this }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.execute()
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
  private execute(): Result {
    reads.push({ table: this.table, from: this.from, to: this.to, orders: this.orders.map(order => order.column) })
    const failure = errors[`${this.table}:${this.from}`] ?? errors[this.table]
    if (failure) return { data: null, error: { message: failure } }
    const source = (tables[this.table] ?? []).filter(row => this.filters.every(filter => filter(row)))
    const rows = source.map((row, index) => ({ row, index })).sort((a, b) => {
      for (const { column, ascending } of this.orders) {
        const left = a.row[column] ?? ''
        const right = b.row[column] ?? ''
        const compared = typeof left === 'number' && typeof right === 'number'
          ? left - right : String(left).localeCompare(String(right))
        if (compared) return ascending ? compared : -compared
      }
      // SQL does not promise an order for tied keys; vary it between pages.
      return this.from === 0 ? a.index - b.index : b.index - a.index
    }).map(({ row }) => row)
    const count = rows.length
    const page = rows.slice(this.from, Math.min(this.to + 1, this.from + 1000))
    const data = this.columns === '*' ? page : page.map(row => Object.fromEntries(
      this.columns.split(',').map(column => column.trim()).map(column => [column, row[column]]),
    ))
    return { data: this.head ? null : data, error: null, count }
  }
}

function id(index: number) { return String(index).padStart(5, '0') }
function product(index: number, overrides: Row = {}): Row {
  return { erp_id: `sku-${id(index)}`, item_code: 'DUPLICATE-CODE', description: `SKU ${index}`, category: 'SOFA',
    model_erp_id: `model-${id(index)}`, module_code: '1S', active: true, removed_at: null,
    first_seen_at: '2026-09-01T00:00:00Z', price: 99999, price_grid: [{ height: '24', tier: 'PRICE_2', price: 99999 }],
    ...overrides }
}
function model(index: number, overrides: Row = {}): Row {
  return { erp_id: `model-${id(index)}`, model_code: 'DUPLICATE-MODEL', name: `Model ${index}`, category: 'SOFA',
    branding: 'ZANOTTI', active: true, removed_at: null, allowed_options: { sizes: ['24', '27"'] },
    first_seen_at: '2026-09-01T00:00:00Z', ...overrides }
}

beforeEach(() => {
  tables = {}
  errors = {}
  reads = []
  rpc.mockReset().mockResolvedValue({ data: [], error: null })
  createClient.mockReset().mockResolvedValue({ from: (table: string) => new Query(table), rpc })
})

describe('Product List readers', () => {
  it('loads every SKU and associated price/model past the 1,000 cap using exact ERP ids despite duplicate codes', async () => {
    tables.erp_products = Array.from({ length: 1005 }, (_, i) => product(i))
    tables.erp_product_models = Array.from({ length: 1005 }, (_, i) => model(i))
    tables.catalogue_skus = Array.from({ length: 1005 }, (_, i) => ({ erp_product_id: `sku-${id(i)}`, price: i === 1 ? null : String(i),
      offered: i % 2 === 0, price_grid: i === 1004 ? [{ height: '27”', tier: 'PRICE_3', price: '42.50' }] : null }))
    tables.catalogue_models = Array.from({ length: 1005 }, (_, i) => ({ erp_model_id: `model-${id(i)}`, offered: true }))
    tables.comm_brands = [{ id: 'brand', code: 'ZANOTTI', name: 'Zanotti', is_active: true, created_at: '2026-01-01' }]
    const skus = await loadSkus()
    expect(skus).toHaveLength(1005)
    expect(new Set(skus.map(sku => sku.erpId)).size).toBe(1005)
    expect(skus[0]).toMatchObject({ erpId: 'sku-00000', price: 0, modelName: 'Model 0', brand: 'ZANOTTI', modelOffered: true })
    expect(skus[1]).toMatchObject({ erpId: 'sku-00001', price: null, offered: false })
    expect(skus[1004]).toMatchObject({ erpId: 'sku-01004', price: 1004, modelName: 'Model 1004', grid: [{ height: '27”', tier: 'PRICE_3', price: 42.5 }] })
    for (const table of ['erp_products', 'erp_product_models', 'catalogue_skus', 'catalogue_models']) {
      expect(reads.filter(read => read.table === table).map(read => [read.from, read.to])).toEqual([[0, 999], [1000, 1999]])
    }
  })

  it('does not borrow ERP source prices, another SKU with the same code, or another model’s settings', async () => {
    tables.erp_products = [product(0), product(1), product(2, { category: 'BEDFRAME', branding: 'ZANOTTI' })]
    tables.erp_product_models = [model(0), model(1), model(2, { category: 'BEDFRAME' })]
    tables.catalogue_skus = [{ erp_product_id: 'sku-00000', price: 0, price_grid: [{ height: 'DEFAULT', tier: 'PRICE_2', price: 0 }], offered: true }]
    tables.catalogue_models = [{ erp_model_id: 'model-00000', offered: true, gift: false, enabled: { sizes: ['27"'] }, calc_category: null, brand_code: null }]
    tables.comm_brands = [{ id: 'brand', code: 'ZANOTTI', name: 'Zanotti', is_active: true }]
    const { models } = await loadModels()
    expect(models[0]).toMatchObject({ configured: true, offered: true, gift: false, giftOverride: false,
      allowed: { sizes: ['24', '27"'] }, enabled: { sizes: ['27"'] }, skus: [expect.objectContaining({ price: 0, offered: true })] })
    expect(models[1]).toMatchObject({ configured: false, offered: false, enabled: {}, skus: [expect.objectContaining({ erpId: 'sku-00001', price: null, grid: null, modelOffered: false })] })
    expect(models[2].skus[0].brand).toBeNull()
  })

  it('pages models and active brands and deterministically resolves duplicate model codes', async () => {
    tables.erp_product_models = Array.from({ length: 1002 }, (_, i) => model(i, { branding: i === 1001 ? 'Last brand' : null }))
    tables.catalogue_models = Array.from({ length: 1002 }, (_, i) => ({ erp_model_id: `model-${id(i)}`, offered: true }))
    tables.comm_brands = Array.from({ length: 1002 }, (_, i) => ({ id: id(i), code: `BRAND${i}`, name: i === 1001 ? 'Last brand' : `Brand ${i}`, is_active: true, created_at: '2026-01-01' }))
    const result = await loadModels()
    expect(result.models).toHaveLength(1002)
    expect(new Set(result.models.map(row => row.erpId)).size).toBe(1002)
    expect(result.models[1001]).toMatchObject({ erpId: 'model-01001', brand: 'BRAND1001', offered: true })
    expect(result.brands).toHaveLength(1002)
  })

  it('pages Maintenance pools and fabrics, joins prices by pool and value, and preserves independent tier mappings', async () => {
    tables.erp_maintenance_options = Array.from({ length: 1002 }, (_, i) => ({ erp_company_id: 1, pool: 'sofa_specials', value: `option-${id(i)}`, label: `Option ${i}`, sort_order: 0, price: 9999 }))
    tables.erp_maintenance_options.push({ erp_company_id: 1, pool: 'sofa_leg_heights', value: 'Default', sort_order: 0 },
      { erp_company_id: 1, pool: 'bedframe_leg_heights', value: 'Default', sort_order: 0 })
    tables.catalogue_option_prices = Array.from({ length: 1002 }, (_, i) => ({ erp_company_id: 1, pool: 'sofa_specials', value: `option-${id(i)}`, price: i === 0 ? null : String(i) }))
    tables.catalogue_option_prices.push({ erp_company_id: 1, pool: 'sofa_leg_heights', value: 'Default', price: 0 },
      { erp_company_id: 1, pool: 'bedframe_leg_heights', value: 'Default', price: -40 })
    tables.erp_fabrics = Array.from({ length: 1002 }, (_, i) => ({ erp_company_id: 1, erp_id: `fabric-${id(i)}`, fabric_code: 'SAME-CODE',
      sofa_tier: i === 0 ? null : 'PRICE_2', bedframe_tier: 'PRICE_3', price_tier: i === 0 ? 'PRICE_1' : null,
      active: i !== 1, removed_at: i === 2 ? '2026-09-24' : null }))
    const result = await loadMaintenance()
    expect(result.options).toHaveLength(1004)
    expect(new Set(result.options.map(option => `${option.pool}|${option.value}`)).size).toBe(1004)
    expect(result.options.find(option => option.value === 'option-00000')?.price).toBeNull()
    expect(result.options.find(option => option.value === 'option-01001')?.price).toBe(1001)
    expect(result.options.find(option => option.pool === 'sofa_leg_heights')?.price).toBe(0)
    expect(result.options.find(option => option.pool === 'bedframe_leg_heights')?.price).toBe(-40)
    expect(result.fabrics).toHaveLength(1002)
    expect(new Set(result.fabrics.map(fabric => fabric.erpId)).size).toBe(1002)
    expect(result.fabrics[0]).toMatchObject({ sofaTier: null, bedframeTier: 'PRICE_3', priceTier: 'PRICE_1' })
    expect(result.fabrics[1]).toMatchObject({ sofaTier: 'PRICE_2', bedframeTier: 'PRICE_3', priceTier: null, active: false })
    expect(result.fabrics[2].removed).toBe(true)
  })

  it('loads all combo definitions and prices past the cap with stable ordering', async () => {
    tables.erp_sofa_combos = Array.from({ length: 1002 }, (_, i) => ({ erp_company_id: 1, erp_id: `combo-${id(i)}`, base_model: '2376',
      slots_key: `[["${id(i)}"]]`, modules: [[id(i)]], tier: 'PRICE_2', heights: ['24'], effective_from: '2026-01-01', erp_created_at: '2026-01-01T00:00:00Z' }))
    tables.catalogue_combo_prices = tables.erp_sofa_combos.map((combo, i) => ({ erp_company_id: 1, base_model: combo.base_model, slots_key: combo.slots_key, tier: combo.tier, price_by_height: { '24': i } }))
    const combos = await loadCombos()
    expect(combos).toHaveLength(1002)
    expect(new Set(combos.map(combo => combo.erpId)).size).toBe(1002)
    expect(combos.find(combo => combo.erpId === 'combo-01001')?.prices).toEqual({ '24': 1001 })
  })

  it('chooses latest combo definitions with deterministic ties, keeps future definitions and only joins portal prices', async () => {
    const base = { erp_company_id: 1, base_model: '2376', slots_key: '[["1S"], ["1A", "2A"]]',
      modules: [['1S'], ['2A', '1A']], tier: null, heights: ['DEFAULT', '27”', '24'], price_by_height: { '24': 9999 },
      effective_from: '2026-09-01', erp_created_at: '2026-09-01T01:00:00Z' }
    tables.erp_sofa_combos = [
      { ...base, erp_id: 'a', label: 'Old' },
      { ...base, erp_id: 'b', effective_from: '2027-01-01', label: 'Future older revision' },
      { ...base, erp_id: 'c', effective_from: '2027-01-01', erp_created_at: '2026-09-01T02:00:00Z', label: 'Latest tied revision C' },
      { ...base, erp_id: 'd', effective_from: '2027-01-01', erp_created_at: '2026-09-01T02:00:00Z', label: 'Latest tied revision D' },
      { ...base, erp_id: 'e', tier: 'PRICE_1', label: 'P1' },
      { ...base, erp_id: 'f', tier: 'PRICE_3', label: 'Unpriced' },
      { ...base, erp_id: 'g', tier: 'PRICE_2', deleted_at: '2026-09-24', label: 'Deleted' },
      { ...base, erp_id: 'h', tier: 'PRICE_2', removed_at: '2026-09-24', label: 'Removed' },
    ]
    tables.catalogue_combo_prices = [
      { erp_company_id: 1, base_model: '2376', slots_key: base.slots_key, tier: '', price_by_height: { '27"': '1550.50', '24': 0, '75CM': 1600, DEFAULT: null, invalid: 'not a number' } },
      { erp_company_id: 1, base_model: '2376', slots_key: base.slots_key, tier: 'PRICE_1', price_by_height: { '24': 1200 } },
    ]
    tables.erp_product_models = [model(0, { model_code: '2376', name: 'Sofa model' })]
    const combos = await loadCombos()
    expect(combos).toHaveLength(3)
    expect(combos.find(combo => combo.tier === null)).toMatchObject({ erpId: 'd', modelName: 'Sofa model', effectiveFrom: '2027-01-01',
      heights: ['DEFAULT', '27”', '24'], slots: [['1S'], ['1A', '2A']], prices: { '27"': 1550.5, '24': 0, '75CM': 1600 } })
    expect(combos.find(combo => combo.tier === 'PRICE_1')?.prices).toEqual({ '24': 1200 })
    expect(combos.find(combo => combo.tier === 'PRICE_3')?.prices).toEqual({})
  })

  it('passes the exact costing window to the RPC and preserves quantities and monetary precision', async () => {
    rpc.mockResolvedValue({ data: [{ item_code: 'A', item_group: 'SOFA', product_name: 'Sofa', brand_code: null,
      lines: '3', bills: '2', qty: '1.5', revenue: '1200.25', in_sku_master: true, has_price: false, reason: 'no_height', erp_product_id: 'sku-a' }], error: null })
    expect(await loadCostingGaps('2026-09-01', '2026-10-01')).toEqual([{ item_code: 'A', item_group: 'SOFA', product_name: 'Sofa', brand_code: null,
      lines: 3, bills: 2, qty: 1.5, revenue: 1200.25, in_sku_master: true, has_price: false, reason: 'no_height', erp_product_id: 'sku-a' }])
    expect(rpc).toHaveBeenCalledWith('revenue_costing_gaps', { p_from: '2026-09-01', p_to: '2026-10-01' })
  })

  it('reports exact live mirror counts and the latest catalogue delivery rather than a sales delivery', async () => {
    tables.erp_products = Array.from({ length: 1002 }, (_, i) => product(i))
    tables.erp_products.push(product(1002, { removed_at: '2026-09-24' }))
    tables.erp_product_models = [model(0), model(1, { removed_at: '2026-09-24' })]
    tables.erp_maintenance_options = [{ pool: 'sofa_sizes', value: '24' }]
    tables.erp_fabrics = [{ erp_id: 'f1' }, { erp_id: 'f2' }]
    tables.erp_sofa_combos = [{ erp_id: 'c1' }, { erp_id: 'c2', deleted_at: '2026-09-24' }, { erp_id: 'c3', removed_at: '2026-09-24' }]
    tables.erp_sync_events = [
      { doc_no: 'catalogue', received_at: '2026-09-23T10:00:00Z', status: 'ok', message: 'Earlier catalogue' },
      { doc_no: 'catalogue', received_at: '2026-09-24T10:00:00Z', status: 'ok', message: 'Current catalogue' },
      { doc_no: 'SO-1', received_at: '2026-09-24T11:00:00Z', status: 'ok', message: 'Sales order' },
    ]
    expect(await loadMirrorStatus()).toEqual({ products: 1002, models: 1, options: 1, fabrics: 2, combos: 1,
      lastDeliveryAt: '2026-09-24T10:00:00Z', lastStatus: 'ok', lastMessage: 'Current catalogue' })
  })

  it('propagates second-page, sync status and RPC failures instead of claiming an empty or partial catalogue', async () => {
    tables.erp_products = Array.from({ length: 1000 }, (_, i) => product(i))
    errors['erp_products:1000'] = 'Second page failed'
    await expect(loadSkus()).rejects.toThrow('Second page failed')
    errors.erp_sync_events = 'Sync read failed'
    await expect(loadMirrorStatus()).rejects.toThrow('Sync read failed')
    rpc.mockResolvedValue({ data: null, error: { message: 'Gap read failed' } })
    await expect(loadCostingGaps('2026-09-01', '2026-10-01')).rejects.toThrow('Gap read failed')
  })
})
