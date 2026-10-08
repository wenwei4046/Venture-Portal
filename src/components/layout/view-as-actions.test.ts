import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setViewAs } from './view-as-actions'
import { VIEW_AS_COOKIE, VIEW_AS_MIRROR_COOKIE } from '@/lib/view-as'

const mocks = vi.hoisted(() => ({
  authUser: { id: 'principal-id' } as { id: string } | null,
  row: { role: 'principal', is_active: true } as { role: string; is_active: boolean } | null,
  // What current_permissions() answers for the REAL account.
  perms: ['view_switch'] as string[],
  set: vi.fn(), delete: vi.fn(), cookies: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.authUser } }) },
    rpc: async () => ({ data: mocks.perms }),
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mocks.row }) }) }) }),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authUser = { id: 'principal-id' }
  mocks.row = { role: 'principal', is_active: true }
  mocks.perms = ['view_switch']
  mocks.cookies.mockResolvedValue({ set: mocks.set, delete: mocks.delete })
})

function form(role: string, destination?: string) {
  const data = new FormData()
  data.set('role', role)
  if (destination !== undefined) data.set('destination', destination)
  return data
}

describe('setViewAs', () => {
  it('opens Revenue View only after verifying the real active Principal', async () => {
    await expect(setViewAs(form('revenue_member', '/member-admin'))).rejects.toThrow('REDIRECT:/member')
    expect(mocks.set).toHaveBeenCalledWith(VIEW_AS_COOKIE, 'revenue_member', {
      httpOnly: true, sameSite: 'lax', path: '/', secure: false,
    })
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  // The copy other tabs read to notice the switch (useViewAsSync). Readable on
  // purpose; the server never trusts it.
  it('writes a readable copy of the view for the other tabs', async () => {
    await expect(setViewAs(form('hr'))).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.set).toHaveBeenCalledWith(VIEW_AS_MIRROR_COOKIE, 'hr', {
      httpOnly: false, sameSite: 'lax', path: '/', secure: false,
    })
  })

  it.each(['finance', 'hr'])('keeps %s views on the dashboard', async role => {
    await expect(setViewAs(form(role, '/revenue'))).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.set).toHaveBeenCalledWith(VIEW_AS_COOKIE, role, expect.any(Object))
  })

  it.each(['/member-admin', '/revenue', '/revenue/products'])('clears the mask before opening approved management destination %s', async destination => {
    await expect(setViewAs(form('principal', destination))).rejects.toThrow(`REDIRECT:${destination}`)
    expect(mocks.delete).toHaveBeenCalledWith(VIEW_AS_COOKIE)
    expect(mocks.set).not.toHaveBeenCalledWith(VIEW_AS_COOKIE, expect.anything(), expect.anything())
    // Written as `principal`, not deleted: "switched back" is news to other tabs.
    expect(mocks.set).toHaveBeenCalledWith(VIEW_AS_MIRROR_COOKIE, 'principal', expect.objectContaining({ httpOnly: false }))
  })

  it.each(['https://example.com', '//example.com', '/member-admin?next=https://example.com', '/revenue/products/../private'])('rejects unapproved redirect destination %s', async destination => {
    await expect(setViewAs(form('principal', destination))).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.delete).toHaveBeenCalledWith(VIEW_AS_COOKIE)
  })

  it.each([
    { row: { role: 'hr', is_active: true }, perms: [], destination: '/dashboard' },
    { row: { role: 'revenue_member', is_active: true }, perms: [], destination: '/member' },
    { row: { role: 'principal', is_active: false }, perms: ['view_switch'], destination: '/login' },
    // Full access (2026-10-08): a principal-kind account without view_switch.
    { row: { role: 'principal', is_active: true }, perms: ['approvals', 'treasury'], destination: '/dashboard' },
  ])('refuses changing views for $row.role active=$row.is_active holding $perms', async ({ row, perms, destination }) => {
    mocks.row = row
    mocks.perms = perms
    await expect(setViewAs(form('principal', '/member-admin'))).rejects.toThrow(`REDIRECT:${destination}`)
    expect(mocks.cookies).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('requires a signed-in identity', async () => {
    mocks.authUser = null
    await expect(setViewAs(form('revenue_member'))).rejects.toThrow('REDIRECT:/login')
    expect(mocks.cookies).not.toHaveBeenCalled()
  })

  it('does not mutate a mask for an unsupported or forged target role', async () => {
    await expect(setViewAs(form('admin'))).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.cookies).not.toHaveBeenCalled()
  })
})
