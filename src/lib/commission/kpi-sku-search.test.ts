import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchSkuMaster } from './kpi-sku-search'

// Rules › KPI items' SKU search (2026-10-11): read from the browser under the
// reader's own session — never a Server Action, which a section picked while it
// ran made Next drop, and a Back during the refresh stuck on the skeleton.

const m = {
  from: vi.fn(), select: vi.fn(), is: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(),
}
const sb = { from: m.from } as unknown as SupabaseClient

beforeEach(() => {
  vi.resetAllMocks()
  // erp_products → select → is → or → order → order → limit
  const chain = { select: m.select, is: m.is, or: m.or, order: m.order, limit: m.limit }
  m.from.mockReturnValue(chain)
  m.select.mockReturnValue(chain)
  m.is.mockReturnValue(chain)
  m.or.mockReturnValue(chain)
  m.order.mockReturnValue(chain)
  m.limit.mockResolvedValue({ data: [], error: null, count: 0 })
})

describe('Rules › KPI items — finding a SKU', () => {
  it('searches the live SKU Master by code or description, twenty at most, and counts the rest', async () => {
    m.limit.mockResolvedValueOnce({
      data: [
        { erp_id: 'p-1', item_code: 'AK-CS AIRLOFT COMFY PIL', description: 'Cool Silk Airloft', category: 'ACC', active: true },
        { erp_id: 'p-2', item_code: 'AK-CS LATEX PIL', description: null, category: null, active: false },
      ],
      error: null,
      count: 34,
    })
    expect(await searchSkuMaster(sb, '  pil  ')).toEqual({
      ok: true,
      total: 34,
      hits: [
        { erpId: 'p-1', code: 'AK-CS AIRLOFT COMFY PIL', description: 'Cool Silk Airloft', category: 'ACC', active: true },
        { erpId: 'p-2', code: 'AK-CS LATEX PIL', description: null, category: null, active: false },
      ],
    })
    expect(m.from).toHaveBeenCalledExactlyOnceWith('erp_products')
    // No price ever: Rules does not show what a product costs.
    expect(m.select).toHaveBeenCalledExactlyOnceWith('erp_id, item_code, description, category, active', { count: 'exact' })
    expect(m.is).toHaveBeenCalledExactlyOnceWith('removed_at', null)
    expect(m.or).toHaveBeenCalledExactlyOnceWith('item_code.ilike."*pil*",description.ilike."*pil*"')
    expect(m.limit).toHaveBeenCalledExactlyOnceWith(20)
  })

  it('asks nothing for an empty search', async () => {
    expect(await searchSkuMaster(sb, '   ')).toEqual({ ok: true, hits: [], total: 0 })
    expect(m.from).not.toHaveBeenCalled()
  })

  it('says so when the search fails, or the network does', async () => {
    m.limit.mockResolvedValueOnce({ data: null, error: { message: 'timeout' }, count: null })
    expect(await searchSkuMaster(sb, 'pillow')).toEqual({ ok: false, reason: 'The SKU Master could not be searched just now. Try again.' })
    m.limit.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await searchSkuMaster(sb, 'pillow')).toEqual({ ok: false, reason: 'The SKU Master could not be searched just now. Try again.' })
  })
})
