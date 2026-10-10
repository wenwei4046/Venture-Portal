import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(),
  select: vi.fn(), is: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.permission, requireAction: mocks.permission, requireAnyAction: mocks.permission, requirePayrollPayoutsAction: mocks.permission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))

import { saveKpiItems } from './kpi-actions'

const SCHEME = '9d6c1f7e-7c1d-4a8e-9f55-0b7d2d3f1a10'
const ITEM = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.permission.mockResolvedValue({ id: 'hr-user' })
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from })
  mocks.rpc.mockResolvedValue({ data: 2, error: null })
  // erp_products → select → is → or → order → order → limit
  const chain = { select: mocks.select, is: mocks.is, or: mocks.or, order: mocks.order, limit: mocks.limit }
  mocks.from.mockReturnValue(chain)
  mocks.select.mockReturnValue(chain)
  mocks.is.mockReturnValue(chain)
  mocks.or.mockReturnValue(chain)
  mocks.order.mockReturnValue(chain)
  mocks.limit.mockResolvedValue({ data: [], error: null, count: 0 })
})

describe('Rules › KPI items — saving', () => {
  it('asks for Revenue · Manage (the rules), then writes through the one writer', async () => {
    expect(await saveKpiItems(SCHEME, {
      adds: [{ source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', amount: '200' }],
      changes: [{ id: ITEM, amount: '250' }],
      removes: [],
    })).toEqual({ ok: true, saved: 2 })
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('revenue', 'manage')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('catalogue_save_kpi_items', {
      p_scheme: SCHEME,
      p_adds: [{ source: 'option', option_pool: 'bedframe_specials', option_value: 'HB Straight', kpi_amount: 200 }],
      p_changes: [{ id: ITEM, kpi_amount: 250 }],
      p_removes: [],
    })
    // Rules and every Comm Cal month read the list.
    expect(mocks.refresh.mock.calls).toEqual([['/revenue', 'layout']])
  })

  it('is refused before any database work without the permission', async () => {
    mocks.permission.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(saveKpiItems(SCHEME, { adds: [], changes: [], removes: [ITEM] })).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('answers a draft it cannot save with a reason, not a throw — production hides thrown messages', async () => {
    expect(await saveKpiItems(SCHEME, {
      adds: [{ source: 'sku', erpId: 'p-1', amount: '', label: 'AK-CS PILLOW' }], changes: [], removes: [],
    })).toEqual({ ok: false, reason: 'AK-CS PILLOW: give it a KPI amount' })
    expect(await saveKpiItems(SCHEME, { adds: [], changes: [], removes: [] }))
      .toEqual({ ok: false, reason: 'Nothing to save' })
    expect(await saveKpiItems('fair', { adds: [], changes: [], removes: [ITEM] }))
      .toEqual({ ok: false, reason: 'No sub-department chosen.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("passes the writer's own refusals through, and names an item already on the list", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'A KPI item changed since the page was opened. Reload and try again.' } })
    expect(await saveKpiItems(SCHEME, { adds: [], changes: [], removes: [ITEM] }))
      .toEqual({ ok: false, reason: 'A KPI item changed since the page was opened. Reload and try again.' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "no_overlapping_kpi_option"' } })
    expect(await saveKpiItems(SCHEME, { adds: [{ source: 'sku', erpId: 'p-1', amount: '5' }], changes: [], removes: [] }))
      .toEqual({ ok: false, reason: 'That item is already a KPI item of this sub-department.' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23503', message: 'SKU p-9 is not in the SKU Master' } })
    expect(await saveKpiItems(SCHEME, { adds: [{ source: 'sku', erpId: 'p-9', amount: '5' }], changes: [], removes: [] }))
      .toEqual({ ok: false, reason: 'SKU p-9 is not in the SKU Master' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('throws on a fault nobody can act on', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'connection reset' } })
    await expect(saveKpiItems(SCHEME, { adds: [], changes: [], removes: [ITEM] }))
      .rejects.toThrow('Could not save the KPI items: connection reset')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
