import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-22 (the user, shown it drawn: 可以，照这个做): a new fund source is filed pending and its
// approval request queued after. When the request could not be queued, the source was "rolled back" with
// a .delete() — and fund_sources refuses every session's DELETE (fund_sources_no_delete USING (false)),
// so a source waited for an approval nobody could see. It is cancelled now — what Withdraw leaves of a
// pending source — and the answer says so.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createFundSourceFromDialog } from './actions'

/** HOUZS Century deposits RM 50,000 at 1% a month (Record fund in's dialog). */
const deposit = () => {
  const fd = new FormData()
  const fields = { source_type: 'subsidiary', from_id: 'co-hc', amount: '50000', cost_rate_percent: '1', lock_in_months: '12', effective_date: '2026-10-20' }
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

/** `requestError` — what the database says to the approval request; `cancelled` — the rows the cancel returns. */
function database(opts: { requestError?: string; cancelled?: unknown[] } = {}) {
  const db = recordingSupabase((call) => {
    if (call.table === 'fund_sources' && call.op === 'insert') return { data: { id: 'fs-new' } }
    if (call.table === 'approval_requests' && call.op === 'insert' && opts.requestError) return { error: { message: opts.requestError } }
    if (call.table === 'fund_sources' && call.op === 'update') return { data: opts.cancelled ?? [{ id: 'fs-new' }] }
    return { data: null }
  })
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'carrie', role: 'finance', permissions: ['treasury'] })
  vi.useFakeTimers({ now: new Date('2026-10-22T03:00:00Z'), toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('Record fund in, its approval request refused', () => {
  it('cancels the source it filed — never a delete — and says nothing was booked', async () => {
    const db = database({ requestError: 'new row violates row-level security policy for table "approval_requests"' })

    const res = await createFundSourceFromDialog(deposit())

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/Failed to queue approval: .*row-level security.*cancelled.*nothing was booked/)
    expect(db.writes('fund_sources').map((w) => w.op)).toEqual(['insert', 'update'])
    const cancel = db.writes('fund_sources')[1]
    expect(cancel.values).toEqual({ status: 'cancelled' })
    expect(cancel.chain).toEqual(expect.arrayContaining([['eq', 'id', 'fs-new'], ['eq', 'status', 'pending_approval']]))
  })

  it('if the cancel is refused too, it says the source is left to withdraw by hand', async () => {
    database({ requestError: 'duplicate key value', cancelled: [] })

    const res = await createFundSourceFromDialog(deposit())

    expect(res.ok === false && res.reason).toMatch(/could not be cancelled.*withdraw it/i)
  })

  it('a request that is queued leaves the source pending, as before', async () => {
    const db = database()

    const res = await createFundSourceFromDialog(deposit())

    expect(res).toEqual({ ok: true, id: 'fs-new' })
    expect(db.writes('fund_sources').map((w) => w.op)).toEqual(['insert'])
    expect(db.writes('approval_requests')[0].values).toMatchObject({ request_type: 'new_fund_source', reference_id: 'fs-new', status: 'pending' })
  })
})
