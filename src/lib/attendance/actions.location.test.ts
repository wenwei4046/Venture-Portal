import { beforeEach, describe, expect, it, vi } from 'vitest'

// Settings › Locations' write (2026-10-20): the address is checked against Malaysia's list again on the server — a
// page's own check can be skipped — before att_save_setting is ever called.

const { rpc, gate } = vi.hoisted(() => ({ rpc: vi.fn(), gate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth', () => ({ requireActionOn: gate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))

import { saveSetting } from './actions'

const row = {
  name: 'Penang branch', addressLine1: 'No 83, Jalan Jambu 3', addressLine2: null, addressPostcode: '14000', addressCity: 'Bukit Mertajam',
  addressState: 'Pulau Pinang', addressCountry: 'Malaysia', state: 'Penang', radius: 150, lat: null, lng: null,
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { id: 'loc-1', label: 'Penang branch' }, error: null })
  gate.mockReset().mockResolvedValue({ id: 'hr' })
})

describe('saveSetting › location', () => {
  it('sends an address that is one place on the list, as it came', async () => {
    await expect(saveSetting('location', null, row)).resolves.toEqual({ ok: true, data: { id: 'loc-1', label: 'Penang branch' } })
    expect(gate).toHaveBeenCalledWith('/attendance/settings', 'attendance', 'edit')
    expect(rpc).toHaveBeenCalledWith('att_save_setting', { p_kind: 'location', p_id: null, p_row: row })
  })

  it('refuses one that is not, in words, and never calls the database', async () => {
    await expect(saveSetting('location', null, { ...row, addressPostcode: '11060' })).resolves.toEqual({
      ok: false, reason: '11060 is not a postcode of Bukit Mertajam, Pulau Pinang — pick them from the list.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lets a location with no address through, and leaves every other setting alone', async () => {
    await saveSetting('location', 'loc-1', { name: 'Anywhere', addressLine1: null, state: 'Selangor', radius: 150 })
    await saveSetting('holiday', null, { day: '2026-12-25', name: 'Christmas', kind: 'gazetted', states: 'All' })
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
