import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(), signOut: vi.fn(), reset: vi.fn(), profile: vi.fn(), redirect: vi.fn(), clearView: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut, resetPasswordForEmail: mocks.reset },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: mocks.clearView }) }))
vi.mock('@/components/member/MemberLoginScreen', () => ({ default: () => null }))

import LoginPage from './page'
import MemberLoginScreen from '@/components/member/MemberLoginScreen'
import { VIEW_AS_COOKIE, VIEW_AS_PERSON_COOKIE, VIEW_AS_PERSON_MARK } from '@/lib/view-as'

async function submit(params: { next?: string } = {}) {
  const screen = await LoginPage({ searchParams: Promise.resolve(params) })
  const form = new FormData()
  form.set('email', '  staff@example.invalid  ')
  form.set('password', ' password with spaces ')
  return screen.props.action(form)
}

describe('canonical sign-in routing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.signIn.mockResolvedValue({ data: { user: { id: 'signed-in-user' } }, error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`) })
  })

  it('renders the existing Warm Editorial screen at the single entry and passes an error unchanged', async () => {
    const error = 'Your session expired. 100% safe to sign in again.'
    const screen = await LoginPage({ searchParams: Promise.resolve({ error }) })
    expect(screen.type).toBe(MemberLoginScreen)
    expect(screen.props.initialError).toBe(error)
    expect(screen.props.preview).toBeUndefined()
    expect(screen.props.action).toBeTypeOf('function')
  })

  it('opens the member workspace for an active Revenue Member', async () => {
    mocks.profile.mockResolvedValue({ data: { is_active: true, role: 'revenue_member' } })
    await expect(submit()).rejects.toThrow('REDIRECT:/member')
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'staff@example.invalid', password: ' password with spaces ' })
    expect(mocks.clearView).toHaveBeenCalledWith(VIEW_AS_COOKIE)
  })

  it.each(['principal', 'finance', 'hr'])('keeps an active %s account in the existing portal', async role => {
    mocks.profile.mockResolvedValue({ data: { is_active: true, role } })
    await expect(submit()).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.clearView).toHaveBeenCalledWith(VIEW_AS_COOKIE)
    // The next account on a shared PC never inherits a read-only browser (2026-10-11).
    expect(mocks.clearView).toHaveBeenCalledWith(VIEW_AS_PERSON_COOKIE)
    expect(mocks.clearView).toHaveBeenCalledWith(VIEW_AS_PERSON_MARK)
    expect(mocks.clearView.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0])
  })

  it('returns to the installed HR app it was sent from, and nowhere else', async () => {
    mocks.profile.mockResolvedValue({ data: { is_active: true, role: 'hr' } })
    await expect(submit({ next: '/hr-app' })).rejects.toThrow('REDIRECT:/hr-app')
    for (const next of ['https://evil.example', '//evil.example', '/hr-app/../payments', '/payments']) {
      mocks.redirect.mockClear()
      await expect(submit({ next })).rejects.toThrow('REDIRECT:/dashboard')
    }
  })

  it('returns to the Finance app it was sent from (2026-10-15), and to none of its insides', async () => {
    mocks.profile.mockResolvedValue({ data: { is_active: true, role: 'finance' } })
    await expect(submit({ next: '/fin-app' })).rejects.toThrow('REDIRECT:/fin-app')
    for (const next of ['/fin-app/../payments', '/fin-app/daily/payments', '/fin-appx']) {
      mocks.redirect.mockClear()
      await expect(submit({ next })).rejects.toThrow('REDIRECT:/dashboard')
    }
  })

  it.each([null, { is_active: false, role: 'revenue_member' }])('signs out a missing or inactive profile', async data => {
    mocks.profile.mockResolvedValue({ data })
    await expect(submit()).resolves.toEqual({ error: 'Your account is not active. Please contact HR.' })
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.clearView).not.toHaveBeenCalled()
  })

  it('rejects an authentication response without a user', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: null })
    await expect(submit()).resolves.toEqual({ error: 'The email or password is incorrect. Please try again.' })
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(mocks.clearView).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('returns a generic credentials error without reading a profile', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: 'invalid credentials' } })
    await expect(submit()).resolves.toEqual({ error: 'The email or password is incorrect. Please try again.' })
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.clearView).not.toHaveBeenCalled()
  })
})

describe('Forgot password — the reset link (2026-11-14)', () => {
  async function ask(email: string) {
    const screen = await LoginPage({ searchParams: Promise.resolve({}) })
    const form = new FormData()
    form.set('email', email)
    return screen.props.resetAction(form)
  }
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.reset.mockResolvedValue({ data: {}, error: null })
  })

  it('asks Supabase to email the login, and answers the same whether it has one or not', async () => {
    await expect(ask('  Someone@Gmail.com ')).resolves.toEqual({ error: '', sent: expect.stringContaining('If someone@gmail.com has an account') })
    expect(mocks.reset).toHaveBeenCalledWith('someone@gmail.com')
    expect(mocks.signIn).not.toHaveBeenCalled()
  })

  it('sends nothing for an address that is not one', async () => {
    await expect(ask('principal')).resolves.toEqual({ error: expect.any(String) })
    expect(mocks.reset).not.toHaveBeenCalled()
  })

  it('words a rate limit, and anything else as try again', async () => {
    mocks.reset.mockResolvedValue({ data: null, error: { code: 'over_email_send_rate_limit', status: 429 } })
    await expect(ask('a@b.com')).resolves.toEqual({ error: expect.stringContaining('Wait a minute') })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.reset.mockResolvedValue({ data: null, error: { code: 'unexpected_failure', status: 500 } })
    await expect(ask('a@b.com')).resolves.toEqual({ error: 'The email could not be sent. Please try again shortly.' })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
