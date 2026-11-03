import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// Payment request's several at once (PR ④, 2026-10-29): what Create payments starts from — each PV's requests read
// again as one Create PV reads them, and whether Billing back is open — and several rejected with one reason, one
// refused said by its id while the rest go on.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), requireAnyActionOn: vi.fn(), mayActOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requireActionOn: mocks.requireActionOn,
  requireAnyActionOn: mocks.requireAnyActionOn,
  requirePermission: mocks.requireActionOn,
  mayActOn: mocks.mayActOn,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { openRequestsForPvs, rejectPaymentRequests } from './actions'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const request = (id: string, payee: string) => ({ id, requestNo: `PRQ-${id.slice(0, 4)}`, status: 'with_finance', kind: 'claim', requesterName: payee, payeeName: payee, total: 10, items: [], shares: [], files: [] })

function database(rpc: (fn: string, args: { p_ids?: string[]; p_request?: string }) => { data?: unknown; error?: { message: string } | null }) {
  const db = recordingSupabase(() => ({}), (fn, args) => rpc(fn, args as { p_ids?: string[]; p_request?: string }))
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'fin' })
  mocks.requireAnyActionOn.mockResolvedValue({ id: 'fin' })
  mocks.mayActOn.mockResolvedValue(true)
})

describe('openRequestsForPvs', () => {
  it('reads each PV’s requests again as one Create PV reads them, and whether Billing back is open', async () => {
    const db = database((_fn, args) => ({ data: { requests: (args.p_ids ?? []).map((id) => request(id, id === C ? 'SIA JOSIAH' : 'KHO WEI JIE')) } }))
    mocks.mayActOn.mockResolvedValue(false)
    const res = await openRequestsForPvs([[A, B], [C]])
    expect(res).toMatchObject({ ok: true, canBillBack: false })
    expect(res.ok && res.groups.map((g) => g.map((r) => r.id))).toEqual([[A, B], [C]])
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/payments/requests', 'treasury', 'create')
    expect(mocks.mayActOn).toHaveBeenCalledWith(['/ba', '/billing-allocator', '/statements'], 'billing', 'create')
    expect(db.rpcs.map((r) => [r.fn, r.args])).toEqual([['payment_requests_for_pv', { p_ids: [A, B] }], ['payment_requests_for_pv', { p_ids: [C] }]])
  })

  it('a PV whose requests are no longer all with Finance stops the window, said in words', async () => {
    database((_fn, args) => (args.p_ids?.includes(C) ? { error: { message: 'A request is no longer waiting for Finance — reload and try again.' } } : { data: { requests: [request(A, 'KHO WEI JIE')] } }))
    expect(await openRequestsForPvs([[A], [C]])).toEqual({ ok: false, reason: 'A request is no longer waiting for Finance — reload and try again.' })
  })

  it('names its requests, and up to 20 PVs', async () => {
    const db = database(() => ({}))
    expect(await openRequestsForPvs([])).toEqual({ ok: false, reason: 'Which requests? Reload the page and try again.' })
    expect(await openRequestsForPvs([[A], ['nonsense']])).toEqual({ ok: false, reason: 'Which requests? Reload the page and try again.' })
    expect(await openRequestsForPvs(Array.from({ length: 21 }, () => [A]))).toEqual({ ok: false, reason: 'Up to 20 PVs at once, 20 requests a PV — tick fewer.' })
    expect(db.rpcs).toHaveLength(0)
  })
})

describe('rejectPaymentRequests', () => {
  it('rejects each with the one reason — one refused is said by its id, the rest go on', async () => {
    const db = database((_fn, args) => (args.p_request === B ? { error: { message: 'This request is not waiting for Finance' } } : {}))
    const res = await rejectPaymentRequests([A, B, C, A], '  The ticket is for September  ')
    expect(res).toEqual({ ok: true, rejected: 2, failed: [{ id: B, reason: 'This request is not waiting for Finance' }] })
    expect(mocks.requireAnyActionOn).toHaveBeenCalledWith('/payments/requests', ['treasury', 'void'], ['treasury', 'approve'])
    expect(db.rpcs.map((r) => r.args)).toEqual([A, B, C].map((id) => ({ p_request: id, p_reason: 'The ticket is for September' })))
  })

  it('asks for a reason, and which requests', async () => {
    const db = database(() => ({}))
    expect(await rejectPaymentRequests([A], '   ')).toEqual({ ok: false, reason: 'Say why — each requester reads it to fix the request.' })
    expect(await rejectPaymentRequests([], 'Fix it')).toEqual({ ok: false, reason: 'Which requests? Reload the page and try again.' })
    expect(db.rpcs).toHaveLength(0)
  })
})
