import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import { getUser } from './auth'

const mocks = vi.hoisted(() => ({
  subject: 'signed-in-id' as string | null,
  cookie: '',
  row: null as Omit<User, 'permissions'> | null,
  maskLookup: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: mocks.cookie }) }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: mocks.subject ? { claims: { sub: mocks.subject } } : null }) },
    rpc: mocks.rpc,
    from: (table: string) => table === 'users'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: mocks.row }) }) }) }
      : { select: () => ({ eq: mocks.maskLookup }) },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.subject = 'signed-in-id'
  mocks.cookie = ''
  mocks.row = {
    id: 'signed-in-id', name: 'Principal', email: 'principal@example.com',
    role: 'principal', is_active: true, created_at: '', updated_at: '',
  }
  mocks.rpc.mockResolvedValue({ data: ['dashboard', 'revenue'] })
  mocks.maskLookup.mockResolvedValue({ data: [{ permission_key: 'member_portal' }, { permission_key: 'member_quote' }] })
})

describe('getUser view mask', () => {
  it('preserves the real Principal identity while using neutral Revenue View permissions', async () => {
    mocks.cookie = 'revenue_member'
    const user = await getUser()
    expect(user).toMatchObject({ id: 'signed-in-id', role: 'revenue_member', actualRole: 'principal', permissions: ['member_portal', 'member_quote'] })
    expect(mocks.maskLookup).toHaveBeenCalledWith('role', 'revenue_member')
  })

  it.each(['revenue_member', 'hr'])('never elevates a real %s account through a forged view cookie', async role => {
    mocks.row!.role = role as User['role']
    mocks.cookie = 'finance'
    const user = await getUser()
    expect(user?.role).toBe(role)
    expect(user?.actualRole).toBeUndefined()
    expect(user?.permissions).toEqual(['dashboard', 'revenue'])
  })

  it('ignores a forged Principal cookie rather than treating it as a role grant', async () => {
    mocks.row!.role = 'revenue_member'
    mocks.cookie = 'principal'
    const user = await getUser()
    expect(user?.role).toBe('revenue_member')
    expect(user?.actualRole).toBeUndefined()
    expect(mocks.maskLookup).not.toHaveBeenCalled()
  })

  it('does not create a Principal mask for an inactive account', async () => {
    mocks.row!.is_active = false
    mocks.cookie = 'revenue_member'
    expect(await getUser()).toBeNull()
  })

  it('requires verified identity even when a view cookie exists', async () => {
    mocks.subject = null
    mocks.cookie = 'revenue_member'
    expect(await getUser()).toBeNull()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.maskLookup).not.toHaveBeenCalled()
  })
})
