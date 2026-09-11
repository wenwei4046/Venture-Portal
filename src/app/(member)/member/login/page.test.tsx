import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(), signOut: vi.fn(), profile: vi.fn(), redirect: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/components/member/MemberLoginScreen', () => ({ default: () => null }))

import MemberLogin from './page'

async function submit() {
  const screen = await MemberLogin({ searchParams: Promise.resolve({}) })
  const form = new FormData()
  form.set('email', '  staff@example.invalid  ')
  form.set('password', ' password with spaces ')
  return screen.props.action(form)
}

describe('live member sign-in routing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.signIn.mockResolvedValue({ data: { user: { id: 'signed-in-user' } }, error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`) })
  })

  it('opens the member workspace for an active Revenue Member', async () => {
    mocks.profile.mockResolvedValue({ data: { is_active: true, role: 'revenue_member' } })
    await expect(submit()).rejects.toThrow('REDIRECT:/member')
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'staff@example.invalid', password: ' password with spaces ' })
  })

  it.each(['principal', 'finance', 'hr', 'dept_manager'])('keeps an active %s account in the existing portal', async role => {
    mocks.profile.mockResolvedValue({ data: { is_active: true, role } })
    await expect(submit()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it.each([null, { is_active: false, role: 'revenue_member' }])('signs out a missing or inactive profile', async data => {
    mocks.profile.mockResolvedValue({ data })
    await expect(submit()).resolves.toEqual({ error: 'Your account is not active. Please contact HR.' })
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('returns a generic credentials error without reading a profile', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: 'invalid credentials' } })
    await expect(submit()).resolves.toEqual({ error: 'The email or password is incorrect. Please try again.' })
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
