import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import { answerShareRequest, cancelShareRequest, loadShareContext, loadShareRequests, sendShareRequest } from './share-server'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ getMemberUser: mocks.getUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

const ORDER = '9561b2c9-5b7f-4228-9378-286ff4ff2b44'
const ANTHONY = '79516ca3-333e-420d-988a-bef4228a178a'
const REQUEST = 'a1b2c3d4-0000-4000-8000-000000000001'
const SUB = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const ROW = {
  id: REQUEST, status: 'partner', orderId: ORDER, orderNo: 'HC-SO-2610-298', periodMonth: '2026-10', subDepartmentId: SUB,
  owner: { id: 'owner', name: 'LUCAS' }, note: '', createdAt: '2026-10-21T02:00:00Z', updatedAt: '2026-10-21T02:00:00Z',
  decidedAt: null, decidedByName: null, decisionNote: null, mine: 'owner', bill: null,
  parts: [{ id: ANTHONY, name: 'ANTHONY', pct: 0.5, answer: 'pending', answeredAt: null, note: null }], holders: [], events: [],
}

function user(overrides: Partial<User> = {}): User {
  return { id: 'u1', name: 'LUCAS', email: 'lucas@example.com', role: 'revenue_member', is_active: true, created_at: '', updated_at: '', permissions: [], ...overrides } as User
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue(user())
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: ROW, error: null })
})

describe('share order on the member side', () => {
  it('sends the parts as the database takes them, under the caller’s own session', async () => {
    const res = await sendShareRequest({ orderId: ORDER, parts: [{ staffId: ANTHONY, pct: 0.50004 }], note: '  together  ' })
    expect(res).toMatchObject({ ok: true, data: { id: REQUEST, status: 'partner' } })
    expect(mocks.rpc).toHaveBeenCalledWith('member_share_order_send', { p_order: ORDER, p_parts: [{ staffId: ANTHONY, pct: 0.5 }], p_note: 'together' })
  })

  it('refuses a send whose Requests page’s Create box is unticked, before asking the database', async () => {
    mocks.getUser.mockResolvedValue(user({ closed: ['rev.requests.create'] } as Partial<User>))
    const res = await sendShareRequest({ orderId: ORDER, parts: [{ staffId: ANTHONY, pct: 0.5 }], note: '' })
    expect(res).toEqual({ ok: false, error: 'Sending a share request is not open to your account.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('answers what was sent to them whatever their Requests box says — answering is not sending', async () => {
    mocks.getUser.mockResolvedValue(user({ closed: ['rev.requests.create'] } as Partial<User>))
    await answerShareRequest(REQUEST, true, null)
    expect(mocks.rpc).toHaveBeenCalledWith('member_share_order_answer', { p_request: REQUEST, p_accept: true, p_note: null })
  })

  it('writes nothing for the Principal — their Revenue app is View as, read only', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'principal' }))
    for (const res of [
      await sendShareRequest({ orderId: ORDER, parts: [{ staffId: ANTHONY, pct: 0.5 }], note: '' }),
      await answerShareRequest(REQUEST, false, 'no'),
      await cancelShareRequest(REQUEST),
    ]) expect(res).toEqual({ ok: false, error: 'Read-only while viewing as.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reads the viewed member’s for the Principal, and nobody else’s for a member', async () => {
    mocks.rpc.mockResolvedValue({ data: [ROW], error: null })
    mocks.getUser.mockResolvedValue(user({ role: 'principal' }))
    await loadShareRequests({ staffId: ANTHONY, subDepartmentId: SUB })
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_share_requests', { p_staff: ANTHONY, p_sub_department: SUB })
    mocks.getUser.mockResolvedValue(user())
    await loadShareRequests()
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_share_requests', { p_staff: null, p_sub_department: null })
    expect(await loadShareRequests({ staffId: ANTHONY, subDepartmentId: SUB })).toEqual({ ok: false, error: 'Only Principal can select another member to view.' })
  })

  it('says the database’s own refusals in words, and nothing else it says', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Oct 2026 is in payroll, so who shares HC-SO-2610-298 cannot change.' } })
    expect(await sendShareRequest({ orderId: ORDER, parts: [{ staffId: ANTHONY, pct: 0.5 }], note: '' }))
      .toEqual({ ok: false, error: 'Oct 2026 is in payroll, so who shares HC-SO-2610-298 cannot change.' })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function public.member_share_order_send does not exist' } })
    expect(await sendShareRequest({ orderId: ORDER, parts: [{ staffId: ANTHONY, pct: 0.5 }], note: '' }))
      .toEqual({ ok: false, error: 'The share request could not be sent. Please try again.' })
  })

  it('checks the shape of what the phone sent', async () => {
    expect(await sendShareRequest({ orderId: 'nope', parts: [], note: '' })).toEqual({ ok: false, error: 'That bill is not there.' })
    expect(await sendShareRequest({ orderId: ORDER, parts: [], note: '' })).toEqual({ ok: false, error: 'Pick who to share it with.' })
    expect(await sendShareRequest({ orderId: ORDER, parts: [{ staffId: 'x', pct: 0.5 }], note: '' })).toEqual({ ok: false, error: 'Give each colleague a part of the bill.' })
    expect(await sendShareRequest({ orderId: ORDER, parts: [{ staffId: ANTHONY, pct: 0.5 }], note: 'x'.repeat(501) })).toEqual({ ok: false, error: 'Keep the note to 500 characters.' })
    expect(await loadShareContext('nope')).toEqual({ ok: false, error: 'That bill is not there.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reads a bill’s share sheet for its salesperson', async () => {
    mocks.rpc.mockResolvedValue({ data: { orderId: ORDER, orderNo: 'HC-SO-2610-298', total: 5800, blocked: null, request: null, holders: [], team: [] }, error: null })
    expect(await loadShareContext(ORDER)).toMatchObject({ ok: true, data: { orderNo: 'HC-SO-2610-298', total: 5800 } })
    expect(mocks.rpc).toHaveBeenCalledWith('member_share_order_context', { p_order: ORDER, p_staff: null })
  })
})
