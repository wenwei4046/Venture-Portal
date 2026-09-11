import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(), profile: vi.fn(), eq: vi.fn(), signOut: vi.fn(),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: mocks.getClaims, signOut: mocks.signOut },
    from: () => ({ select: () => ({ eq: mocks.eq }) }),
  }),
}))

import { middleware } from '../../middleware'

describe('canonical login middleware', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getClaims.mockResolvedValue({ data: null })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.eq.mockReturnValue({ maybeSingle: mocks.profile })
  })

  it.each(['/member', '/member?page=quote', '/dashboard'])('sends an anonymous %s request to the single login', async path => {
    const response = await middleware(new NextRequest(`https://portal.example${path}`))
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login')
    expect(mocks.getClaims).toHaveBeenCalledOnce()
    expect(mocks.profile).not.toHaveBeenCalled()
  })

  it.each(['/login', '/member/login'])('allows the anonymous %s page to render or redirect', async path => {
    const response = await middleware(new NextRequest(`https://portal.example${path}`))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
  })

  it.each([
    ['revenue_member', '/member'],
    ['principal', '/dashboard'],
    ['finance', '/dashboard'],
    ['hr', '/dashboard'],
  ])('uses verified claim sub to route an active %s account', async (role, destination) => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'verified-account-id' } } })
    mocks.profile.mockResolvedValue({ data: { role, is_active: true } })
    const response = await middleware(new NextRequest('https://portal.example/login'))
    expect(response.headers.get('location')).toBe(`https://portal.example${destination}`)
    expect(mocks.getClaims).toHaveBeenCalledOnce()
    expect(mocks.eq).toHaveBeenCalledWith('id', 'verified-account-id')
  })

  it('signs out an inactive session before showing canonical login', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'inactive-account' } } })
    mocks.profile.mockResolvedValue({ data: { role: 'principal', is_active: false } })
    const response = await middleware(new NextRequest('https://portal.example/login'))
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
  })

  it('keeps the separately authenticated member scheduler out of interactive login', async () => {
    const response = await middleware(new NextRequest('https://portal.example/api/member-queue'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(mocks.getClaims).not.toHaveBeenCalled()
  })
})
