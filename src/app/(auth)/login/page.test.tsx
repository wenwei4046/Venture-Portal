import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(), signOut: vi.fn(), profile: vi.fn(), redirect: vi.fn(), clearView: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: mocks.clearView }) }))
vi.mock('@/components/member/MemberLoginScreen', () => ({ default: () => null }))

import LoginPage from './page'
import MemberLoginScreen from '@/components/member/MemberLoginScreen'
import { VIEW_AS_COOKIE } from '@/lib/view-as'

async function submit() {
  const screen = await LoginPage({ searchParams: Promise.resolve({}) })
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

  it.each(['principal', 'finance', 'hr', 'dept_manager'])('keeps an active %s account in the existing portal', async role => {
    mocks.profile.mockResolvedValue({ data: { is_active: true, role } })
    await expect(submit()).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.clearView).toHaveBeenCalledWith(VIEW_AS_COOKIE)
    expect(mocks.clearView.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0])
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
