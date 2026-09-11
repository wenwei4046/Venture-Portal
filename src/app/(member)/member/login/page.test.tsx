import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import MemberLogin from './page'

describe('legacy member sign-in alias', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`) })
  })

  it('redirects old member bookmarks to the only production login', async () => {
    await expect(MemberLogin({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/login')
  })

  it('preserves an error as encoded text on the canonical login', async () => {
    const error = 'Session expired & sign in again'
    await expect(MemberLogin({ searchParams: Promise.resolve({ error }) }))
      .rejects.toThrow('REDIRECT:/login?error=Session+expired+%26+sign+in+again')
  })
})
