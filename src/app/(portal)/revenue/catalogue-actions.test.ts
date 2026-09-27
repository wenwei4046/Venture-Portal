import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelEdit } from '@/lib/catalogue/edits'

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), createClient: vi.fn(), from: vi.fn(), refresh: vi.fn(),
  select: vi.fn(), eq: vi.fn(), owned: vi.fn(), modelUpsert: vi.fn(), skuUpsert: vi.fn(), rpc: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.permission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('server-only', () => ({}))

import { saveCostSetting, saveKpiItems, saveModelSettings } from './catalogue-actions'

const MODEL = 'e64c8f43-7d7a-4bbe-b167-3e6a8e4d4264'
const edit = (skuOffered: Record<string, boolean> = { 'own-sku': true }): ModelEdit => ({
  erpModelId: MODEL, offered: true, enabled: { sizes: ['24', '25"'] }, gift: false,
  calcCategory: 'Sofa', brandCode: 'ZANOTTI', skuOffered,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.permission.mockResolvedValue({ id: 'principal' })
  mocks.createClient.mockResolvedValue({ from: mocks.from })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ in: mocks.owned })
  mocks.owned.mockResolvedValue({ data: [{ erp_id: 'own-sku' }], error: null })
  mocks.modelUpsert.mockResolvedValue({ error: null })
  mocks.skuUpsert.mockResolvedValue({ error: null })
  mocks.from.mockImplementation(table => {
    if (table === 'erp_products') return { select: mocks.select }
    if (table === 'catalogue_models') return { upsert: mocks.modelUpsert }
    if (table === 'catalogue_skus') return { upsert: mocks.skuUpsert }
    throw new Error(`Unexpected table ${table}`)
  })
})

describe('Modular settings ownership validation', () => {
  it('refuses a foreign SKU before writing any model settings or SKU ticks', async () => {
    await expect(saveModelSettings(edit({ 'own-sku': true, 'foreign-sku': false })))
      .rejects.toThrow('1 SKU(s) do not belong to this model')
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('product_list')
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('erp_id')
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('model_erp_id', MODEL)
    expect(mocks.owned).toHaveBeenCalledExactlyOnceWith('erp_id', ['own-sku', 'foreign-sku'])
    expect(mocks.modelUpsert).not.toHaveBeenCalled()
    expect(mocks.skuUpsert).not.toHaveBeenCalled()
    expect(mocks.from.mock.calls).toEqual([['erp_products']])
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('does not write when ownership cannot be verified because the read fails', async () => {
    mocks.owned.mockResolvedValueOnce({ data: null, error: { message: 'Read denied' } })
    await expect(saveModelSettings(edit())).rejects.toThrow('Could not save the SKU ticks: Read denied')
    expect(mocks.modelUpsert).not.toHaveBeenCalled()
    expect(mocks.skuUpsert).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('preserves valid model settings and SKU tick payloads after ownership is verified', async () => {
    expect(await saveModelSettings(edit())).toEqual({ saved: 2 })
    expect(mocks.from.mock.calls).toEqual([['erp_products'], ['catalogue_models'], ['catalogue_skus']])
    expect(mocks.modelUpsert).toHaveBeenCalledExactlyOnceWith({
      erp_model_id: MODEL, offered: true, enabled: { sizes: ['24', '25"'] }, gift: false,
      calc_category: 'Sofa', brand_code: 'ZANOTTI', updated_by: 'principal', updated_at: expect.any(String),
    }, { onConflict: 'erp_model_id' })
    expect(mocks.skuUpsert).toHaveBeenCalledExactlyOnceWith([
      { erp_product_id: 'own-sku', offered: true, updated_by: 'principal', updated_at: expect.any(String) },
    ], { onConflict: 'erp_product_id' })
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith('/revenue', 'layout')
  })

  it('preserves the model-only save without an unnecessary ownership query', async () => {
    expect(await saveModelSettings(edit({}))).toEqual({ saved: 1 })
    expect(mocks.from.mock.calls).toEqual([['catalogue_models']])
    expect(mocks.modelUpsert).toHaveBeenCalledOnce()
    expect(mocks.skuUpsert).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('retains the permission gate before any database access', async () => {
    mocks.permission.mockRejectedValueOnce(new Error('Permission denied'))
    await expect(saveModelSettings(edit())).rejects.toThrow('Permission denied')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})

describe('Costing Setting and Add-on / KPI Items', () => {
  const SCHEME = '9d6c1f7e-7c1d-4a8e-9f55-0b7d2d3f1a10'
  const ITEM = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: 3, error: null })
  })

  it("writes one sub-department's ratios through its one writer, Principal only", async () => {
    expect(await saveCostSetting(SCHEME, {
      divisor: '0.7',
      ratios: [{ erpId: 'p-1', ratio: '0.6' }, { erpId: 'p-2', ratio: '' }],
    })).toEqual({ saved: 3 })
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('product_list')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('catalogue_save_cost_setting', {
      p_scheme: SCHEME, p_divisor: 0.7, p_ratios: [{ erp_product_id: 'p-1', ratio: 0.6 }], p_removes: ['p-2'],
    })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith('/revenue', 'layout')
  })

  it('refuses a bad ratio, and a missing sub-department, before any write', async () => {
    await expect(saveCostSetting(SCHEME, { ratios: [{ erpId: 'p-1', ratio: '0', label: 'AK-ULTIMATE (K)' }] }))
      .rejects.toThrow('AK-ULTIMATE (K): a ratio must be above 0 and at most 10')
    await expect(saveCostSetting('fair', { ratios: [{ erpId: 'p-1', ratio: '0.6' }] })).rejects.toThrow('No sub-department chosen')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('says plainly when two SKUs share a code', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_comm_cost_ratio_code"' } })
    await expect(saveCostSetting(SCHEME, { ratios: [{ erpId: 'p-1', ratio: '0.6' }] }))
      .rejects.toThrow('Two SKUs share that code')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('writes KPI items as rows the database takes', async () => {
    await saveKpiItems(SCHEME, {
      adds: [{ source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', amount: '200' }],
      changes: [{ id: ITEM, amount: '250' }],
      removes: [],
    })
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('product_list')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('catalogue_save_kpi_items', {
      p_scheme: SCHEME,
      p_adds: [{ source: 'option', option_pool: 'bedframe_specials', option_value: 'HB Straight', kpi_amount: 200 }],
      p_changes: [{ id: ITEM, kpi_amount: 250 }],
      p_removes: [],
    })
  })

  it("passes the writer's own refusal through, and names an item added twice", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'A KPI item changed since the page was opened. Reload and try again.' } })
    await expect(saveKpiItems(SCHEME, { adds: [], changes: [], removes: [ITEM] }))
      .rejects.toThrow('A KPI item changed since the page was opened. Reload and try again.')
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "no_overlapping_kpi_option"' } })
    await expect(saveKpiItems(SCHEME, { adds: [{ source: 'sku', erpId: 'p-1', amount: '5' }], changes: [], removes: [] }))
      .rejects.toThrow('That item is already a KPI item of this sub-department')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
