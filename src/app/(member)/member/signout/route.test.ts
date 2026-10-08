import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}))

import { POST } from './route'

describe('member sign-out returns to canonical login', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it('signs out a same-origin request and redirects to /login', async () => {
    const request = new NextRequest('https://portal.example/member/signout', { method: 'POST' })
    request.headers.set('origin', 'https://portal.example')
    const response = await POST(request)
    expect(mocks.signOut).toHaveBeenCalledOnce()
    // This phone only: a global sign-out ended the account on every device.
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://portal.example/login')
  })

  it.each([null, 'https://another.example'])('keeps the origin guard for %s', async origin => {
    const request = new NextRequest('https://portal.example/member/signout', { method: 'POST' })
    if (origin) request.headers.set('origin', origin)
    const response = await POST(request)
    expect(response.status).toBe(403)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
