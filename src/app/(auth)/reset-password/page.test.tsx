import { beforeEach, describe, expect, it, vi } from 'vitest'

// The reset link's page (2026-11-14): the token is checked only on Save, under the person's own
// session — verifyOtp, an active login of their own, then the password — and they land where a
// sign-in lands.

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
  profile: vi.fn(), personal: vi.fn(), redirect: vi.fn(), clear: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp, getUser: mocks.getUser, getClaims: mocks.getClaims, updateUser: mocks.updateUser, signOut: mocks.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
    rpc: mocks.personal,
  }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: mocks.clear }) }))
vi.mock('@/components/member/MemberLoginScreen', () => ({ default: () => null }))
vi.mock('@/components/member/WelcomeForm', () => ({ default: () => null }))

import ResetPasswordPage from './page'
import WelcomeForm from '@/components/member/WelcomeForm'
import { VIEW_AS_COOKIE, VIEW_AS_PERSON_COOKIE } from '@/lib/view-as'
import { RESET_SHARED } from '@/lib/password-reset'

const HASH = 'a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233'

async function page(params: Record<string, string | undefined> = { token_hash: HASH, type: 'recovery' }) {
  return ResetPasswordPage({ searchParams: Promise.resolve(params) })
}
async function save(fields: Record<string, string>) {
  const screen = await page()
  const form = new FormData()
  for (const [k, v] of Object.entries({ token_hash: HASH, password: 'Hv-new-pass', confirm: 'Hv-new-pass', ...fields })) form.set(k, v)
  return screen.props.panel.body.props.action(form)
}
const nowSeconds = () => Math.floor(Date.now() / 1000)

describe('/reset-password — choosing a new password from the emailed link', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff' } } })
    mocks.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: 'recovery', timestamp: nowSeconds() - 60 }] } } })
    mocks.updateUser.mockResolvedValue({ data: {}, error: null })
    mocks.profile.mockResolvedValue({ data: { is_active: true } })
    mocks.personal.mockResolvedValue({ data: true, error: null })
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`) })
  })

  it('draws the form with the link’s token — and only for a recovery link that is whole', async () => {
    const screen = await page()
    expect(screen.props.panel.body.type).toBe(WelcomeForm)
    expect(screen.props.panel.body.props.token).toBe(HASH)
    expect(screen.props.panel.body.props.words.submit).toBe('Save new password')
    for (const params of [{}, { token_hash: HASH }, { token_hash: 'x', type: 'recovery' }, { token_hash: HASH, type: 'invite' }]) {
      const broken = await page(params)
      expect(broken.props.panel.title).toBe('This link is not complete.')
      expect(broken.props.panel.body).toBeNull()
    }
  })

  it('proves the link, sets the password under that session, and lands where a sign-in lands', async () => {
    await expect(save({})).rejects.toThrow('REDIRECT:/')
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'recovery' })
    expect(mocks.personal).toHaveBeenCalledWith('my_login_is_personal')
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'Hv-new-pass' })
    expect(mocks.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0])
    expect(mocks.clear).toHaveBeenCalledWith(VIEW_AS_COOKIE)
    expect(mocks.clear).toHaveBeenCalledWith(VIEW_AS_PERSON_COOKIE)
  })

  it('checks the two boxes before it spends the link', async () => {
    expect(await save({ password: '12345', confirm: '12345' })).toEqual({ error: 'Your password needs at least 6 characters.', verified: false })
    expect(await save({ confirm: 'other' })).toEqual({ error: 'The two passwords are not the same.', verified: false })
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
  })

  it('says an expired or used link in words, and sets nothing', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired' } })
    expect(await save({})).toEqual({ error: expect.stringContaining('expired or was already used'), verified: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('a shared office login changes no password by email — refused and signed out of this device', async () => {
    mocks.personal.mockResolvedValue({ data: false, error: null })
    expect(await save({})).toEqual({ error: RESET_SHARED, verified: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('an account switched off sets nothing and is signed out of this device', async () => {
    mocks.profile.mockResolvedValue({ data: { is_active: false } })
    expect(await save({})).toEqual({ error: 'Your account is not active. Please contact HR.', verified: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('a password that did not save may be tried again on the session the link opened, without the link', async () => {
    mocks.updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'unexpected_failure' } })
    expect(await save({})).toEqual({ error: 'Your password was not saved. Try again.', verified: true })
    mocks.verifyOtp.mockClear()
    await expect(save({ verified: '1' })).rejects.toThrow('REDIRECT:/')
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
  })

  it('never lets a session opened with a password set one without the current password', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: 'password', timestamp: nowSeconds() - 30 }] } } })
    expect(await save({ verified: '1' })).toEqual({ error: expect.stringContaining('expired or was already used'), verified: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})
