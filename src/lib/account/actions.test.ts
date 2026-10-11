import { beforeEach, describe, expect, it, vi } from 'vitest'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { SHARED_LOGIN } from './password'

// Change password's one Server Action (2026-10-12): who may, and the auth server asked in order —
// the current password proved by a sign-in first, the new one set only after.

const m = vi.hoisted(() => ({
  user: { id: 'u1', is_active: true } as { id: string; is_active: boolean } | null,
  viewing: false,
  personal: true,
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAccountUser: async () => m.user }))
vi.mock('@/lib/view-as-person', () => ({ viewingAsSomebody: async () => m.viewing }))
vi.mock('./personal-login', () => ({ loginIsPersonal: async () => m.personal }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser, signInWithPassword: m.signInWithPassword, updateUser: m.updateUser } }),
}))

import { changeMyPassword } from './actions'

const change = { current: 'old-pass', next: 'new-pass-1', confirm: 'new-pass-1' }

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'u1', is_active: true }
  m.viewing = false
  m.personal = true
  m.getUser.mockResolvedValue({ data: { user: { email: 'carrie@example.com' } }, error: null })
  m.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
  m.updateUser.mockResolvedValue({ data: { user: {} }, error: null })
})

const askedAuth = () => m.getUser.mock.calls.length + m.signInWithPassword.mock.calls.length + m.updateUser.mock.calls.length

describe('changeMyPassword', () => {
  it('proves the current password by signing in with it, then sets the new one', async () => {
    expect(await changeMyPassword(change)).toEqual({ ok: true })
    expect(m.signInWithPassword).toHaveBeenCalledWith({ email: 'carrie@example.com', password: 'old-pass' })
    expect(m.updateUser).toHaveBeenCalledWith({ password: 'new-pass-1', current_password: 'old-pass' })
    expect(m.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(m.updateUser.mock.invocationCallOrder[0])
  })

  it('changes nothing when the current password is wrong', async () => {
    m.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } })
    expect(await changeMyPassword(change)).toEqual({ ok: false, reason: 'Your current password is not right.' })
    expect(m.updateUser).not.toHaveBeenCalled()
  })

  it('refuses an incomplete change before the auth server is asked', async () => {
    expect(await changeMyPassword({ ...change, confirm: 'new-pass-2' })).toEqual({ ok: false, reason: 'The two new passwords do not match.' })
    expect(await changeMyPassword({ current: 'x', next: 'x', confirm: 'x' })).toMatchObject({ ok: false })
    // A hand-made request with no fields at all.
    expect(await changeMyPassword(undefined as never)).toEqual({ ok: false, reason: 'Enter your current password.' })
    expect(askedAuth()).toBe(0)
  })

  it('refuses a shared login, and nobody signed in', async () => {
    m.personal = false
    expect(await changeMyPassword(change)).toEqual({ ok: false, reason: SHARED_LOGIN })
    m.personal = true
    m.user = null
    expect(await changeMyPassword(change)).toEqual({ ok: false, reason: 'Sign in with an active work account.' })
    expect(askedAuth()).toBe(0)
  })

  it('changes nothing while the portal is viewing as somebody', async () => {
    m.viewing = true
    expect(await changeMyPassword(change)).toEqual({ ok: false, reason: READ_ONLY_MESSAGE })
    expect(askedAuth()).toBe(0)
  })

  it('says why the auth server refused the new one, and logs it without any password', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'weak_password', status: 422, reasons: ['pwned'], message: 'Password is known to be weak' } })
    const res = await changeMyPassword(change)
    expect(res).toMatchObject({ ok: false, reason: expect.stringMatching(/data leak/) })
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][1])).not.toMatch(/old-pass|new-pass/)
    log.mockRestore()
  })

  it('asks a session whose email is gone to sign in again', async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: { status: 403 } })
    expect(await changeMyPassword(change)).toMatchObject({ ok: false, reason: expect.stringMatching(/Sign in again/) })
    expect(m.signInWithPassword).not.toHaveBeenCalled()
  })
})
