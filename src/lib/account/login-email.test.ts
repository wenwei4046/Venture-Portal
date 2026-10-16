import { beforeEach, describe, expect, it, vi } from 'vitest'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { loginMoveOf, loginMoveRefusal } from './login-move'

// Request to change email (2026-10-16): HR's last approval of a login's email moves the login first, with the
// service role, only when the database says this is that step and this approver may decide it — and back when the
// decision did not go through, unless it was approved after all.

vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({
  viewing: false,
  rpc: vi.fn(),
  updateUserById: vi.fn(),
  loginRow: null as { email: string } | null,
}))
vi.mock('@/lib/view-as-person', () => ({ viewingAsSomebody: async () => m.viewing }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: () => ({
    auth: { admin: { updateUserById: m.updateUserById } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.loginRow, error: null }) }) }) }),
  }),
}))

import { moveBackUnlessApproved, moveLoginForApproval } from './login-email'

const facts = { user_id: 'u-ann', from: 'ann@x.my', to: 'Ann.New@Mail.com' }

beforeEach(() => {
  vi.clearAllMocks()
  m.viewing = false
  m.loginRow = null
  m.rpc.mockResolvedValue({ data: facts, error: null })
  m.updateUserById.mockResolvedValue({ data: { user: {} }, error: null })
})

describe('moveLoginForApproval', () => {
  it('asks the database under the approver’s session, then moves the login, confirmed', async () => {
    expect(await moveLoginForApproval('r1')).toEqual({ kind: 'moved', userId: 'u-ann', from: 'ann@x.my', to: 'ann.new@mail.com' })
    expect(m.rpc).toHaveBeenCalledWith('att_login_email_change', { p_request: 'r1' })
    expect(m.updateUserById).toHaveBeenCalledWith('u-ann', { email: 'ann.new@mail.com', email_confirm: true })
  })

  it('moves nothing for any other step', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null })
    expect(await moveLoginForApproval('r1')).toEqual({ kind: 'none' })
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('passes on the database’s refusal, and moves nothing', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Nobody decides their own request.' } })
    expect(await moveLoginForApproval('r1')).toEqual({ kind: 'refused', reason: 'Nobody decides their own request.' })
    m.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal' } })
    expect(await moveLoginForApproval('r1')).toEqual({ kind: 'refused', reason: 'The request could not be decided.' })
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('never while viewing as somebody', async () => {
    m.viewing = true
    expect(await moveLoginForApproval('r1')).toEqual({ kind: 'refused', reason: READ_ONLY_MESSAGE })
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('says why the auth server refused, and that nothing was decided', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.updateUserById.mockResolvedValue({ data: null, error: { code: 'email_exists', status: 422, message: 'exists' } })
    expect(await moveLoginForApproval('r1')).toEqual({ kind: 'refused', reason: 'That email already belongs to another login. Nothing was decided.' })
  })
})

describe('moveBackUnlessApproved', () => {
  const moved = { kind: 'moved' as const, userId: 'u-ann', from: 'ann@x.my', to: 'ann.new@mail.com' }

  it('moves the login back when the request was not approved', async () => {
    m.loginRow = { email: 'ann@x.my' }
    expect(await moveBackUnlessApproved(moved)).toBeNull()
    expect(m.updateUserById).toHaveBeenCalledWith('u-ann', { email: 'ann@x.my', email_confirm: true })
  })

  it('leaves it when the login row already reads the new email — approved after all', async () => {
    m.loginRow = { email: 'ann.new@mail.com' }
    expect(await moveBackUnlessApproved(moved)).toBeNull()
    expect(m.updateUserById).not.toHaveBeenCalled()
  })

  it('says so when it could not be put back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.loginRow = { email: 'ann@x.my' }
    m.updateUserById.mockResolvedValue({ data: null, error: { code: 'unexpected_failure', status: 500 } })
    expect(await moveBackUnlessApproved(moved)).toBe('Their login could not be moved back — they sign in with ann.new@mail.com until it is. Try Approve again.')
  })
})

describe('loginMoveOf / loginMoveRefusal', () => {
  it('reads the database’s answer', () => {
    expect(loginMoveOf(null)).toBeNull()
    expect(loginMoveOf({ user_id: 'u', to: '' })).toBeNull()
    expect(loginMoveOf({ user_id: 'u', from: null, to: 'A@B.my' })).toEqual({ userId: 'u', from: '', to: 'a@b.my' })
  })
  it('words the auth server’s refusals', () => {
    expect(loginMoveRefusal('user_not_found')).toBe('Their login is no longer there. Nothing was decided.')
    expect(loginMoveRefusal(undefined)).toBe('Their login could not be moved to the new email, so nothing was decided. Please try again.')
  })
})
