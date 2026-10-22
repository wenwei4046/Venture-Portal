import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelEdit } from '@/lib/catalogue/edits'

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), createClient: vi.fn(), from: vi.fn(), refresh: vi.fn(),
  select: vi.fn(), eq: vi.fn(), owned: vi.fn(), modelUpsert: vi.fn(), skuUpsert: vi.fn(), rpc: vi.fn(),
}))
vi.mock('@/lib/member/product-access', () => ({ requireProductList: mocks.permission, requireProductListEdit: mocks.permission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('server-only', () => ({}))

import { addCombo, removeCombos, saveCostSetting, saveModelSettings } from './actions'

/** A save refreshes the Product List's own page and every Comm Cal page a price moves. */
const REFRESHED = [['/member/products'], ['/revenue', 'layout']]

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
    expect(mocks.permission).toHaveBeenCalledOnce()
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
    expect(mocks.refresh.mock.calls).toEqual(REFRESHED)
  })

  it('preserves the model-only save without an unnecessary ownership query', async () => {
    expect(await saveModelSettings(edit({}))).toEqual({ saved: 1 })
    expect(mocks.from.mock.calls).toEqual([['catalogue_models']])
    expect(mocks.modelUpsert).toHaveBeenCalledOnce()
    expect(mocks.skuUpsert).not.toHaveBeenCalled()
    expect(mocks.refresh.mock.calls).toEqual(REFRESHED)
  })

  // 2026-10-19: a sofa's name is written only when the window sends one (it sends one only when it changed).
  it('writes a model name only when the edit carries one, tidied into capitals, blank as none', async () => {
    await saveModelSettings({ ...edit({}), modelName: '  Roma   Grande ' })
    expect(mocks.modelUpsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ erp_model_id: MODEL, model_name: 'ROMA GRANDE' }), { onConflict: 'erp_model_id' })
    mocks.modelUpsert.mockClear()
    await saveModelSettings({ ...edit({}), modelName: '' })
    expect(mocks.modelUpsert.mock.calls[0][0]).toMatchObject({ model_name: null })
    mocks.modelUpsert.mockClear()
    await saveModelSettings(edit({}))
    expect(mocks.modelUpsert.mock.calls[0][0]).not.toHaveProperty('model_name')
    await expect(saveModelSettings({ ...edit({}), modelName: 'x'.repeat(81) })).rejects.toThrow('A model name is at most 80 characters')
  })

  it('retains the permission gate before any database access', async () => {
    mocks.permission.mockRejectedValueOnce(new Error('Permission denied'))
    await expect(saveModelSettings(edit())).rejects.toThrow('Permission denied')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})

describe('Costing Setting', () => {
  const SCHEME = '9d6c1f7e-7c1d-4a8e-9f55-0b7d2d3f1a10'

  beforeEach(() => {
    mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: 3, error: null })
  })

  it("writes one sub-department's ratios through its one writer, Principal only", async () => {
    expect(await saveCostSetting(SCHEME, {
      divisor: '0.7',
      ratios: [{ erpId: 'p-1', ratio: '0.6' }, { erpId: 'p-2', ratio: '' }],
    })).toEqual({ saved: 3 })
    expect(mocks.permission).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('catalogue_save_cost_setting', {
      p_scheme: SCHEME, p_divisor: 0.7, p_ratios: [{ erp_product_id: 'p-1', ratio: 0.6 }], p_removes: ['p-2'],
    })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.refresh.mock.calls).toEqual(REFRESHED)
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
})

describe('Combo Pricing › Add combo', () => {
  beforeEach(() => {
    mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: 2, error: null })
  })

  const set = {
    baseModel: ' 8030 ',
    modules: [['1NA'], ['2NA']],
    label: '1NA + 2NA',
    prices: { PRICE_2: { '30': 500, '28': 0 }, PRICE_3: { '28': '620.50' } },
  }

  it('hands the database one set — model upper-cased, positive prices only — for product_list only', async () => {
    expect(await addCombo(set)).toEqual({ ok: true, prices: 2 })
    expect(mocks.permission).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('catalogue_add_combo', {
      p_base_model: '8030',
      p_modules: [['1NA'], ['2NA']],
      p_label: '1NA + 2NA',
      p_prices: { PRICE_2: { '30': 500 }, PRICE_3: { '28': 620.5 } },
    })
    expect(mocks.refresh.mock.calls).toEqual(REFRESHED)
  })

  it("answers the window's own refusals as a reason, before any write", async () => {
    expect(await addCombo({ ...set, modules: [['1NA']] })).toEqual({ ok: false, reason: 'Add at least two compartments.' })
    expect(await addCombo({ ...set, prices: { PRICE_2: { '30': 0 } } })).toEqual({ ok: false, reason: 'Fill at least one price.' })
    expect(await addCombo({ ...set, baseModel: '' })).toEqual({ ok: false, reason: 'Pick a sofa model.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("passes the database's refusals (22023) through as a reason, and throws anything else", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'This model already has a combo with these compartments.' } })
    expect(await addCombo(set)).toEqual({ ok: false, reason: 'This model already has a combo with these compartments.' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for table catalogue_combos' } })
    await expect(addCombo(set)).rejects.toThrow('Could not save the combo')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})

describe('Combo Pricing › Remove', () => {
  beforeEach(() => {
    mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: 2, error: null })
  })

  const key = '[["1NA"], ["2NA"]]'

  it('hands the database each set once — model upper-cased — for product_list only', async () => {
    expect(await removeCombos([
      { baseModel: ' 8030 ', slotsKey: key },
      { baseModel: '8030', slotsKey: key },
      { baseModel: '2376', slotsKey: '[["1A"], ["1S"]]' },
    ])).toEqual({ ok: true, removed: 2 })
    expect(mocks.permission).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('catalogue_remove_combos', {
      p_sets: [{ base_model: '8030', slots_key: key }, { base_model: '2376', slots_key: '[["1A"], ["1S"]]' }],
    })
    expect(mocks.refresh.mock.calls).toEqual(REFRESHED)
  })

  it('answers an empty or broken request as a reason, before any write', async () => {
    expect(await removeCombos([])).toEqual({ ok: false, reason: 'Pick a combo to remove.' })
    expect(await removeCombos([{ baseModel: '8030', slotsKey: 'not-a-key' }])).toEqual({ ok: false, reason: 'A combo row is incomplete' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("passes the database's refusals (22023, 42501) through as a reason, and throws anything else", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Model 8030 no longer has that combo. Refresh the page and try again.' } })
    expect(await removeCombos([{ baseModel: '8030', slotsKey: key }])).toEqual({ ok: false, reason: 'Model 8030 no longer has that combo. Refresh the page and try again.' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only the Principal can remove a combo.' } })
    expect(await removeCombos([{ baseModel: '8030', slotsKey: key }])).toEqual({ ok: false, reason: 'Only the Principal can remove a combo.' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } })
    await expect(removeCombos([{ baseModel: '8030', slotsKey: key }])).rejects.toThrow('Could not save the combos')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
