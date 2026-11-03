import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-31 — the user: "happisleep is the subbrand of akemi … i wnat make them into one". Rules › Brands keeps a
// brand's sub-brands, the ERP brandings that ARE it: Akemi's HAPPI SLEEP (erp_sync_brand_code reads them; migration
// 20261031200000). A save writes only what its form carries: the brand form has no note and no Active box, and every
// save wrote null over Akemi's note and true over the switch; a page opened before the Sub-brands box would have
// wiped HAPPI SLEEP the same way.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { upsertBrand } from './config-actions'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

// What Rules › Brands sends for Akemi, as production holds it on 2026-10-31.
const AKEMI = { scheme_id: 'scheme-fair', id: 'brand-akemi', code: 'akemi', name: 'Akemi', item_code_prefixes: 'AK-, AKE' }
const OTHERS = [
  { code: 'ZANOTTI', name: 'Zanotti', sub_brands: [] },
  { code: 'ERGOTEX', name: 'Ergotex', sub_brands: [] },
  { code: 'DUNLOP', name: 'Dunlopillo', sub_brands: null },
]
const othersRead = (call: RecordedCall) => (call.table === 'comm_brands' && call.op === 'select' ? { data: OTHERS } : {})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'hr-user', role: 'hr', permissions: ['revenue'] })
})

describe('Rules › Brands saves what its form carries', () => {
  it("keeps HAPPI SLEEP as Akemi's sub-brand, tidied — and nothing the form does not hold", async () => {
    const db = recordingSupabase(othersRead)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertBrand(form({ ...AKEMI, sub_brands: ' happi   sleep ' }))
    const [write] = db.writes('comm_brands')
    expect(write.op).toBe('update')
    expect(write.chain).toContainEqual(['eq', 'id', 'brand-akemi'])
    expect(write.values).toEqual({
      scheme_id: 'scheme-fair', code: 'AKEMI', name: 'Akemi', item_code_prefixes: ['AK-', 'AKE'], sub_brands: ['HAPPI SLEEP'],
    })
    // "Another brand" is any active brand of another code — not this row, nor another scheme's Akemi.
    const read = db.calls.find(c => c.table === 'comm_brands' && c.op === 'select')!
    expect(read.chain).toEqual(expect.arrayContaining([['eq', 'is_active', true], ['neq', 'code', 'AKEMI'], ['neq', 'id', 'brand-akemi']]))
  })

  it("refuses a word another brand is called by, and writes nothing", async () => {
    const db = recordingSupabase(othersRead)
    mocks.createClient.mockResolvedValue(db.client)
    await expect(upsertBrand(form({ ...AKEMI, sub_brands: 'HAPPI SLEEP, Dunlopillo' }))).rejects.toThrow(/DUNLOPILLO already names Dunlopillo/)
    expect(db.writes()).toHaveLength(0)
  })

  it('leaves the sub-brands, the note and the switch as they are when the form carries none', async () => {
    const db = recordingSupabase(othersRead)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertBrand(form(AKEMI))
    const [write] = db.writes('comm_brands')
    expect(write.values).toEqual({ scheme_id: 'scheme-fair', code: 'AKEMI', name: 'Akemi', item_code_prefixes: ['AK-', 'AKE'] })
    expect(db.calls.filter(c => c.table === 'comm_brands' && c.op === 'select')).toHaveLength(0)
  })

  it('still writes a note or a switch a form does send', async () => {
    const db = recordingSupabase(othersRead)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertBrand(form({ ...AKEMI, note: ' Ladder from Akemi ', is_active: 'off' }))
    expect(db.writes('comm_brands')[0].values).toMatchObject({ note: 'Ladder from Akemi', is_active: false })
  })

  it('adds a new brand with the sub-brands typed', async () => {
    const db = recordingSupabase(othersRead)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertBrand(form({ scheme_id: 'scheme-fair', code: 'HOUZS', name: 'Houzs', item_code_prefixes: '', sub_brands: 'houzs home' }))
    const [write] = db.writes('comm_brands')
    expect(write.op).toBe('insert')
    expect(write.values).toEqual({ scheme_id: 'scheme-fair', code: 'HOUZS', name: 'Houzs', item_code_prefixes: [], sub_brands: ['HOUZS HOME'] })
    const read = db.calls.find(c => c.table === 'comm_brands' && c.op === 'select')!
    expect(read.chain).not.toContainEqual(['neq', 'id', expect.anything()])
  })
})
