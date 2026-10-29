import { beforeEach, describe, expect, it, vi } from 'vitest'

// Claim & approve's two writes (2026-10-29, PR ③ of docs/module-spec-payment-requests.md): their department's requests
// sent to Finance, or back to their senders with one reason — behind Claims · Approve at Dept, never while viewing as,
// answered in words.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn, requireAuth: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { approveRequests, sendBackRequests } from './actions'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'sia', name: 'SIA JOSIAH', viewingAs: null })
})

describe('approveRequests', () => {
  it('asks Claim & approve, sends them to Finance and says how many', async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null })
    expect(await approveRequests([A, B, A])).toEqual({ ok: true, data: { approved: 2 } })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/claims', 'claims', 'approve', 'dept')
    expect(mocks.rpc).toHaveBeenCalledWith('payment_request_approve', { p_ids: [A, B] })
    expect(mocks.revalidate).toHaveBeenCalledWith('/payments/requests')
  })

  it('says the database’s refusal in its words; names nothing it cannot read', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'A request is no longer waiting for your approval — reload and try again.' } })
    expect(await approveRequests([A])).toEqual({ ok: false, reason: 'A request is no longer waiting for your approval — reload and try again.' })
    expect(await approveRequests(['nope'])).toEqual({ ok: false, reason: 'Which requests? Reload the page and try again.' })
    expect(await approveRequests([])).toEqual({ ok: false, reason: 'Which requests? Reload the page and try again.' })
  })

  it('writes nothing while viewing as somebody', async () => {
    mocks.requireActionOn.mockResolvedValue({ id: 'sia', viewingAs: { id: 'x', name: 'X' } })
    expect((await approveRequests([A])).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('sendBackRequests', () => {
  it('needs what to fix, then sends them back with it', async () => {
    expect(await sendBackRequests([A], '  ')).toEqual({ ok: false, reason: 'Say what to fix — they read it to send the request again.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: 1, error: null })
    expect(await sendBackRequests([A], ' The receipt is for September ')).toEqual({ ok: true, data: { sentBack: 1 } })
    expect(mocks.rpc).toHaveBeenCalledWith('payment_request_send_back', { p_ids: [A], p_reason: 'The receipt is for September' })
  })
})
