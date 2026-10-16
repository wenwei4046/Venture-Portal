import { beforeEach, describe, expect, it, vi } from 'vitest'

// The invite link's page (2026-10-16): the token is checked only on Activate,
// under the person's own session — verifyOtp, then the password — and they
// land where a sign-in lands.

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), profile: vi.fn(), redirect: vi.fn(), clear: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp, getUser: mocks.getUser, updateUser: mocks.updateUser, signOut: mocks.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: mocks.clear }) }))
vi.mock('@/components/member/MemberLoginScreen', () => ({ default: () => null }))
vi.mock('@/components/member/WelcomeForm', () => ({ default: () => null }))

import WelcomePage from './page'
import WelcomeForm from '@/components/member/WelcomeForm'
import { VIEW_AS_COOKIE, VIEW_AS_PERSON_COOKIE } from '@/lib/view-as'

const HASH = 'a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233'

async function page(params: Record<string, string> = { token_hash: HASH, type: 'invite' }) {
  return WelcomePage({ searchParams: Promise.resolve(params) })
}
async function activate(fields: Record<string, string>) {
  const screen = await page()
  const form = new FormData()
  for (const [k, v] of Object.entries({ token_hash: HASH, password: 'Hv-new-pass', confirm: 'Hv-new-pass', ...fields })) form.set(k, v)
  return screen.props.panel.body.props.action(form)
}

describe('/welcome — choosing the password an invite link asks for', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'invited', invited_at: '2026-10-16T01:00:00Z', email_confirmed_at: new Date().toISOString() } } })
    mocks.updateUser.mockResolvedValue({ data: {}, error: null })
    mocks.profile.mockResolvedValue({ data: { is_active: true } })
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`) })
  })

  it('draws the form with the link’s token — and only for a link that is whole', async () => {
    const screen = await page()
    expect(screen.props.panel.title).toBe('Set your password.')
    expect(screen.props.panel.body.type).toBe(WelcomeForm)
    expect(screen.props.panel.body.props.token).toBe(HASH)
    for (const params of [{}, { token_hash: HASH }, { token_hash: 'x', type: 'invite' }, { token_hash: HASH, type: 'recovery' }]) {
      const broken = await page(params)
      expect(broken.props.panel.title).toBe('This link is not complete.')
      expect(broken.props.panel.body).toBeNull()
    }
  })

  it('proves the link, sets the password under that session, and lands where a sign-in lands', async () => {
    await expect(activate({})).rejects.toThrow('REDIRECT:/')
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'invite' })
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'Hv-new-pass' })
    expect(mocks.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0])
    expect(mocks.clear).toHaveBeenCalledWith(VIEW_AS_COOKIE)
    expect(mocks.clear).toHaveBeenCalledWith(VIEW_AS_PERSON_COOKIE)
  })

  it('checks the two boxes before it spends the link', async () => {
    expect(await activate({ password: '12345', confirm: '12345' })).toEqual({ error: 'Your password needs at least 6 characters.', verified: false })
    expect(await activate({ confirm: 'something else' })).toEqual({ error: 'The two passwords are not the same.', verified: false })
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
  })

  it('says an expired or used link in words, and sets nothing', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', message: 'Email link is invalid or has expired' } })
    expect(await activate({})).toEqual({ error: expect.stringContaining('expired or was already used'), verified: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('a password that did not save may be tried again on the same fresh session, without the link', async () => {
    mocks.updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'unexpected_failure', message: 'boom' } })
    expect(await activate({})).toEqual({ error: 'Your password was not saved. Try again.', verified: true })
    mocks.verifyOtp.mockClear()
    await expect(activate({ verified: '1' })).rejects.toThrow('REDIRECT:/')
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
  })

  it('never lets an older session set a password without the current one — a shared computer’s, say', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'hr', invited_at: null, email_confirmed_at: '2026-04-01T00:00:00Z' } } })
    expect(await activate({ verified: '1' })).toEqual({ error: expect.stringContaining('expired or was already used'), verified: false })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'old', invited_at: '2026-09-01T00:00:00Z', email_confirmed_at: '2026-09-01T00:10:00Z' } } })
    expect(await activate({ verified: '1' })).toEqual({ error: expect.stringContaining('expired or was already used'), verified: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('an account switched off is signed out of this device again', async () => {
    mocks.profile.mockResolvedValue({ data: { is_active: false } })
    expect(await activate({})).toEqual({ error: 'Your account is not active. Please contact HR.', verified: false })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
