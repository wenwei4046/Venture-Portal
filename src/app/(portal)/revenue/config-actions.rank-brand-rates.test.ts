import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-11-11 — 2990s, a brand that follows its own commission scheme (the user: "它的 top rank 抽成是 8%（以此类推，
// 每级往下调 1%）"). Rules › Ranks keeps each rank's rate for such a brand in comm_rank_defs.brand_rates, keyed by
// the brand's id. A save writes only the brands its form carries a box for — a page opened before the brand existed,
// or a save of the rank's own rate alone, leaves the brand rates as they are — and a copied scheme carries them under
// the copied brands' ids.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createSubDepartment, upsertRankDef } from './config-actions'

const BRAND = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

// Fair's catalogue, lettered and ordered as the database holds it — so a save re-letters nothing.
const def = (id: string, label: string, rate: number, sort: number, brandRates: Record<string, number> = {}) =>
  ({ id, label, product_rate: rate, group_incentive_amount: 0, group_subsidy_cap: 0, sort_order: sort, brand_rates: brandRates })
const CATALOGUE = [
  def('rank-tl', 'Rank A', 0.09, 20, { [BRAND]: 0.08, [OTHER]: 0.02 }),
  def('rank-rs', 'Rank B', 0.05, 10, { [BRAND]: 0.04 }),
]
const answer = (call: RecordedCall) => {
  if (call.op !== 'select') return {}
  if (call.table === 'comm_brands') return { data: [{ id: BRAND, name: '2990s' }] }
  if (call.table === 'comm_rank_defs') return { data: CATALOGUE }
  return {}
}
const TL = { scheme_id: 'scheme-fair', id: 'rank-tl', product_rate: '9', group_incentive_amount: '0', group_subsidy_cap: '0' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'hr-user', role: 'hr', permissions: ['revenue'] })
})

describe('Rules › Ranks saves a rank’s rate for a brand on its own scheme', () => {
  it('asks only for the scheme’s active brands on their own scheme', async () => {
    const db = recordingSupabase(answer)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertRankDef(form({ ...TL, [`brand_rate_${BRAND}`]: '8.5' }))
    const read = db.calls.find(c => c.table === 'comm_brands' && c.op === 'select')!
    expect(read.chain).toEqual(expect.arrayContaining([['eq', 'scheme_id', 'scheme-fair'], ['eq', 'own_scheme', true], ['eq', 'is_active', true]]))
  })

  it('writes the typed percentage as a rate, every other brand’s rate as it was', async () => {
    const db = recordingSupabase(answer)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertRankDef(form({ ...TL, [`brand_rate_${BRAND}`]: '8.5' }))
    const [write] = db.writes('comm_rank_defs')
    expect(write.op).toBe('update')
    expect(write.chain).toEqual(expect.arrayContaining([['eq', 'id', 'rank-tl'], ['eq', 'scheme_id', 'scheme-fair']]))
    expect(write.values).toEqual({
      product_rate: 0.09, group_incentive_amount: 0, group_subsidy_cap: 0,
      brand_rates: { [BRAND]: 0.085, [OTHER]: 0.02 },
    })
  })

  it('clears the rank’s own rate when the box is emptied — it then follows the rank below', async () => {
    const db = recordingSupabase(answer)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertRankDef(form({ ...TL, [`brand_rate_${BRAND}`]: '' }))
    expect(db.writes('comm_rank_defs')[0].values).toMatchObject({ brand_rates: { [OTHER]: 0.02 } })
  })

  it('writes no brand rates at all when none moved, or when the form carries no box', async () => {
    const same = recordingSupabase(answer)
    mocks.createClient.mockResolvedValue(same.client)
    await upsertRankDef(form({ ...TL, product_rate: '9.5', [`brand_rate_${BRAND}`]: '8' }))
    expect(same.writes('comm_rank_defs')[0].values).toEqual({ product_rate: 0.095, group_incentive_amount: 0, group_subsidy_cap: 0 })

    // A page opened before the brand existed: the rank's own rate saves, 2990s' stays 8%.
    const old = recordingSupabase(answer)
    mocks.createClient.mockResolvedValue(old.client)
    await upsertRankDef(form({ ...TL, product_rate: '9.5' }))
    expect(old.writes('comm_rank_defs')[0].values).toEqual({ product_rate: 0.095, group_incentive_amount: 0, group_subsidy_cap: 0 })
  })

  it('refuses a rate that is no percentage, naming the brand, and writes nothing', async () => {
    const db = recordingSupabase(answer)
    mocks.createClient.mockResolvedValue(db.client)
    await expect(upsertRankDef(form({ ...TL, [`brand_rate_${BRAND}`]: '120' }))).rejects.toThrow('2990s rate must be between 0 and 100%')
    expect(db.writes()).toHaveLength(0)
  })

  it('gives a new rank the rate typed for the brand', async () => {
    const db = recordingSupabase(answer)
    mocks.createClient.mockResolvedValue(db.client)
    await upsertRankDef(form({ scheme_id: 'scheme-fair', product_rate: '7', [`brand_rate_${BRAND}`]: '6' }))
    const [write] = db.writes('comm_rank_defs')
    expect(write.op).toBe('insert')
    expect(write.values).toMatchObject({ scheme_id: 'scheme-fair', product_rate: 0.07, brand_rates: { [BRAND]: 0.06 } })
  })
})

describe('a copied scheme carries the brand and its rates', () => {
  it('makes the brand again on its own scheme, and each rank’s rate under the new brand’s id', async () => {
    const NEW_BRAND = '33333333-3333-4333-8333-333333333333'
    let made = 0
    const db = recordingSupabase(call => {
      if (call.table === 'comm_sub_departments') return call.op === 'insert' ? { data: { id: 'sub-new' } } : { data: [] }
      if (call.table === 'comm_schemes') return call.op === 'insert' ? { data: { id: 'scheme-new' } } : { data: { id: 'scheme-fair', enable_kpi: false } }
      if (call.table === 'comm_rank_defs') {
        if (call.op === 'select') return { data: CATALOGUE.map(({ id, product_rate, group_incentive_amount, group_subsidy_cap, label, sort_order, brand_rates }) => ({ id, product_rate, group_incentive_amount, group_subsidy_cap, label, sort_order, brand_rates })) }
        if (call.op === 'insert') return { data: { id: `new-rank-${++made}` } }
        return {}
      }
      if (call.table === 'comm_brands') {
        if (call.op === 'select') return { data: [{ id: BRAND, code: '2990S', name: '2990s', item_code_prefixes: [], sub_brands: ['2990S SOFA'], ref_prefixes: [], hc_bill_pct: null, note: null, is_active: true, own_scheme: true, erp_company_id: 2 }] }
        if (call.op === 'insert') return { data: { id: NEW_BRAND } }
      }
      return {}
    })
    mocks.createClient.mockResolvedValue(db.client)
    await createSubDepartment(form({ department_id: 'dept-revenue', name: 'Outlet', clone_from_scheme_id: 'scheme-fair' }))

    const brand = db.writes('comm_brands').find(w => w.op === 'insert')!
    expect(brand.values).toMatchObject({ scheme_id: 'scheme-new', code: '2990S', own_scheme: true, erp_company_id: 2, sub_brands: ['2990S SOFA'] })

    // The ranks are copied without the old ids' rates …
    const inserted = db.writes('comm_rank_defs').filter(w => w.op === 'insert')
    expect(inserted).toHaveLength(2)
    for (const w of inserted) expect(w.values).not.toHaveProperty('brand_rates')
    // … and take them once the brand exists: 2990s' under its new id, the brand that was not copied dropped.
    const rated = db.writes('comm_rank_defs').filter(w => w.op === 'update')
    expect(rated.map(w => [w.chain.find(c => c[0] === 'eq')?.[2], w.values])).toEqual([
      ['new-rank-1', { brand_rates: { [NEW_BRAND]: 0.08 } }],
      ['new-rank-2', { brand_rates: { [NEW_BRAND]: 0.04 } }],
    ])
  })
})
