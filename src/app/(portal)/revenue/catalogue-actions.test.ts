import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelEdit } from '@/lib/catalogue/edits'

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), createClient: vi.fn(), from: vi.fn(), refresh: vi.fn(),
  select: vi.fn(), eq: vi.fn(), owned: vi.fn(), modelUpsert: vi.fn(), skuUpsert: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.permission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('server-only', () => ({}))

import { saveModelSettings } from './catalogue-actions'

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
