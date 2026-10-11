import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-08: a new fund source may not start in the future — and "the
// future" was measured from the SERVER's today (UTC). From midnight until
// 08:00 in the office, a deposit received today was refused.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createFundSource } from './actions'

const deposit = (effective_date: string) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries({ source_type: 'director_loan', from_freetext_name: 'Mr Liang', amount: '60000', cost_rate_percent: '1', lock_in_months: '', effective_date })) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  mocks.createClient.mockResolvedValue(recordingSupabase().client)
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('a fund source starting today, keyed after midnight', () => {
  it("is accepted: today is the office's, not the server's", async () => {
    const db = recordingSupabase((call) => (call.op === 'insert' ? { data: { id: 'fs-new' } } : { data: null }))
    mocks.createClient.mockResolvedValue(db.client)
    await expect(inTimeZoneAsync('UTC', () => createFundSource(deposit('2026-11-01')))).rejects.toThrow('NEXT_REDIRECT')
    expect(db.writes('fund_sources')[0].values).toMatchObject({ effective_date: '2026-11-01' })
  })

  it('tomorrow is still the future', async () => {
    await expect(inTimeZoneAsync('UTC', () => createFundSource(deposit('2026-11-02')))).rejects.toThrow('Effective date cannot be in the future')
  })
})
