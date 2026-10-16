import { beforeEach, describe, expect, it, vi } from 'vitest'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { NOT_SENT, SHARED_EMAIL } from './email-change'

// Request to change email's Server Actions (2026-10-16): a login of one's own only, never while viewing as somebody,
// and Withdraw only for the request the sheet shows.

const m = vi.hoisted(() => ({
  user: { id: 'u1', is_active: true, email: 'ann@x.my' } as { id: string; is_active: boolean; email: string } | null,
  viewing: false,
  personal: true as boolean | null,
  rpc: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAccountUser: async () => m.user }))
vi.mock('@/lib/view-as-person', () => ({ viewingAsSomebody: async () => m.viewing }))
vi.mock('./personal-login', () => ({ askPersonalLogin: async () => m.personal }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: m.rpc }) }))

import { loadMyEmailChange, requestEmailChange, withdrawEmailChange } from './actions'

const waiting = { id: 'r1', ref: 'PF-2610-004', status: 'pending', to: 'ann.new@mail.com', from: 'ann@x.my', at: '2026-10-16T02:00:00Z', decidedAt: null, note: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'u1', is_active: true, email: 'ann@x.my' }
  m.viewing = false
  m.personal = true
  m.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'my_email_change') return { data: waiting, error: null }
    if (fn === 'request_my_email_change') return { data: { id: 'r1', ref: 'PF-2610-004' }, error: null }
    if (fn === 'att_cancel_request') return { data: { id: 'r1' }, error: null }
    return { data: null, error: { code: '42883', message: 'no such function' } }
  })
})
const called = (fn: string) => m.rpc.mock.calls.filter(c => c[0] === fn)

describe('loadMyEmailChange', () => {
  it('the email they sign in with, and their latest request', async () => {
    expect(await loadMyEmailChange()).toEqual({ email: 'ann@x.my', latest: waiting })
  })
  it('nothing for a shared login, or while viewing as somebody', async () => {
    m.personal = false
    expect(await loadMyEmailChange()).toBeNull()
    m.personal = true
    m.viewing = true
    expect(await loadMyEmailChange()).toBeNull()
    expect(called('my_email_change')).toHaveLength(0)
  })
})

describe('requestEmailChange', () => {
  it('sends the new email in lower case, and answers what the sheet now shows', async () => {
    expect(await requestEmailChange(' Ann.New@Mail.com ')).toEqual({ ok: true, mine: { email: 'ann@x.my', latest: waiting } })
    expect(called('request_my_email_change')).toEqual([['request_my_email_change', { p_email: 'ann.new@mail.com' }]])
  })
  it('asks the email first, then who is asking', async () => {
    expect(await requestEmailChange('ann@x')).toEqual({ ok: false, reason: 'Enter an email address like name@houzs.my.' })
    expect(await requestEmailChange('ANN@x.my')).toEqual({ ok: false, reason: 'That is already the email you sign in with.' })
    m.viewing = true
    expect(await requestEmailChange('ann.new@mail.com')).toEqual({ ok: false, reason: READ_ONLY_MESSAGE })
    m.viewing = false
    m.personal = false
    expect(await requestEmailChange('ann.new@mail.com')).toEqual({ ok: false, reason: SHARED_EMAIL })
    m.personal = null
    expect(await requestEmailChange('ann.new@mail.com')).toEqual({ ok: false, reason: NOT_SENT })
    m.user = null
    expect(await requestEmailChange('ann.new@mail.com')).toEqual({ ok: false, reason: 'Sign in with an active work account.' })
    expect(called('request_my_email_change')).toHaveLength(0)
  })
  it('says the database’s refusal in its own words', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'That email already belongs to another login.' } })
    expect(await requestEmailChange('dan@x.my')).toEqual({ ok: false, reason: 'That email already belongs to another login.' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'internal' } })
    expect(await requestEmailChange('dan.new@x.my')).toEqual({ ok: false, reason: NOT_SENT })
  })
})

describe('withdrawEmailChange', () => {
  it('withdraws the request the sheet shows', async () => {
    const res = await withdrawEmailChange('r1')
    expect(res.ok).toBe(true)
    expect(called('att_cancel_request')).toEqual([['att_cancel_request', { p_request: 'r1', p_note: '' }]])
  })
  it('never another request by its id', async () => {
    expect(await withdrawEmailChange('r-other')).toEqual({ ok: false, reason: 'That request is no longer waiting.' })
    expect(called('att_cancel_request')).toHaveLength(0)
  })
})
