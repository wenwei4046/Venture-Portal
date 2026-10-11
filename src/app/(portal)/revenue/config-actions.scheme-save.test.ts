import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-11, the user: the Revenue Team cost basis is set on Product List ›
// Costing Setting only. Rules › Scheme rules showed it as well, and its Save
// wrote back whatever its form held — 1 when the box was blank — over what
// Costing Setting had set. Fair's 0.7 must survive every Scheme rules save,
// including one sent by a page still open from before the row was taken away.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveSchemeRules } from './config-actions'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

// What Scheme rules sends for Fair on 2026-10-11: product, override and the
// deposit gate at 30%.
const FAIR = {
  scheme_id: 'scheme-fair',
  enable_product_revenue: 'on',
  enable_override: 'on',
  deposit_gate_on: 'on',
  deposit_threshold_pct: '30',
  group_sales_depth: '',
  override_depth: '',
  direct_line_limit: '',
  open_bill_basis: 'uplift_on_commission',
  default_rate_mode: 'variable',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'hr-user', role: 'hr', permissions: ['revenue'] })
})

describe('Rules › Scheme rules never writes the Revenue Team cost basis', () => {
  it('saves the switches and settings and leaves revenue_cost_divisor alone', async () => {
    const db = recordingSupabase()
    mocks.createClient.mockResolvedValue(db.client)
    await expect(saveSchemeRules(form(FAIR))).resolves.toEqual({ ok: true })
    const [write] = db.writes('comm_schemes')
    expect(write.op).toBe('update')
    expect(write.chain).toContainEqual(['eq', 'id', 'scheme-fair'])
    expect(write.values).toMatchObject({ enable_product_revenue: true, enable_override: true, deposit_threshold_pct: 0.3, default_rate_mode: 'variable' })
    expect(write.values).not.toHaveProperty('revenue_cost_divisor')
  })

  it('ignores a divisor sent by a page loaded before the row went', async () => {
    const db = recordingSupabase()
    mocks.createClient.mockResolvedValue(db.client)
    await expect(saveSchemeRules(form({ ...FAIR, revenue_cost_divisor: '1' }))).resolves.toEqual({ ok: true })
    expect(db.writes('comm_schemes')[0].values).not.toHaveProperty('revenue_cost_divisor')
  })

  it('no longer refuses a save over a divisor it does not keep', async () => {
    const db = recordingSupabase()
    mocks.createClient.mockResolvedValue(db.client)
    await expect(saveSchemeRules(form({ ...FAIR, revenue_cost_divisor: '0' }))).resolves.toEqual({ ok: true })
    expect(db.writes('comm_schemes')).toHaveLength(1)
  })
})
