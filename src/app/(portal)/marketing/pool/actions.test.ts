import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-28 — Marketing's own pool opens an account's months and lines as Dept Pool does, Marketing's lines alone:
// the segment is the action's, never the ask's.

const mocks = vi.hoisted(() => ({
  requirePage: vi.fn(),
  requireActionOn: vi.fn(),
  adminClient: vi.fn(),
  readMonthlyDrill: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: mocks.requirePage, requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/admin', () => ({ adminClient: mocks.adminClient }))
vi.mock('../../reports/_lib/drill-reads', async (orig) => ({
  ...(await orig<object>()),
  readMonthlyDrill: mocks.readMonthlyDrill,
}))

import { openMarketingPoolRow } from './actions'

const ADMIN = { admin: true }
const USER = { id: 'sj', role: 'staff', permissions: ['marketing_pool'], actions: { 'marketing_pool.view': 'all' } }
const ask = (segment: unknown) =>
  ({ report: 'pnl', segment, from: '2026-01', to: '2026-10', rows: [{ code: '9094', side: null }] }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue(USER)
  mocks.adminClient.mockReturnValue(ADMIN)
  mocks.readMonthlyDrill.mockResolvedValue({ '9094': [] })
})

describe('openMarketingPoolRow', () => {
  it('asks for the page’s View before it reads anything', async () => {
    await openMarketingPoolRow(ask('marketing'))
    expect(mocks.requirePage).toHaveBeenCalledWith('/marketing/pool')
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/marketing/pool', 'marketing_pool', 'view')
  })

  it('reads Marketing’s lines through the service role, whatever segment the ask names', async () => {
    for (const segment of ['hr', '', 'corporate', 42]) {
      mocks.readMonthlyDrill.mockClear()
      expect(await openMarketingPoolRow(ask(segment))).toEqual({ ok: true, lines: { '9094': [] } })
      const [reader, user, clean] = mocks.readMonthlyDrill.mock.calls[0]
      expect(reader).toBe(ADMIN)
      expect(user).toBe(USER)
      expect(clean).toEqual({ report: 'pnl', segment: 'marketing', from: '2026-01', to: '2026-10', rows: [{ code: '9094', side: null }] })
    }
  })

  it('says why when the lines cannot be read', async () => {
    mocks.readMonthlyDrill.mockRejectedValue(new Error('timeout'))
    expect(await openMarketingPoolRow(ask('marketing'))).toEqual({ ok: false, reason: 'timeout' })
  })
})
