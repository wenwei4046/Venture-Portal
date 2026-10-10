import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import { redirect } from 'next/navigation'
import { getMemberUser, getUser, requirePayrollPayouts } from './auth'

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
  // The Principal account holds view_switch (role default since 2026-10-08).
  mocks.rpc.mockResolvedValue({ data: ['dashboard', 'revenue', 'view_switch'] })
  mocks.maskLookup.mockResolvedValue({ data: [{ permission_key: 'member_portal' }, { permission_key: 'member_quote' }] })
})

describe('getUser view mask', () => {
  it('in the member app, preserves the real Principal identity while using neutral Revenue View permissions', async () => {
    mocks.cookie = 'revenue_member'
    const user = await getMemberUser()
    expect(user).toMatchObject({ id: 'signed-in-id', role: 'revenue_member', actualRole: 'principal', canSwitchView: true, permissions: ['member_portal', 'member_quote'] })
    expect(mocks.maskLookup).toHaveBeenCalledWith('role', 'revenue_member')
  })

  // 2026-09-27: the member app open in another tab set this cookie, and the
  // Product List's tabs, judged as a salesperson, bounced to Overview.
  it('outside the member app, ignores the Revenue View — the Principal stays the Principal', async () => {
    mocks.cookie = 'revenue_member'
    const user = await getUser()
    expect(user).toMatchObject({ id: 'signed-in-id', role: 'principal', canSwitchView: true, permissions: ['dashboard', 'revenue', 'view_switch'] })
    expect(user?.actualRole).toBeUndefined()
    expect(mocks.maskLookup).not.toHaveBeenCalled()
  })

  // 2026-10-11, the user: "switch view is still can be edit, full access means = ultimate access" —
  // HR's and Finance's views are lenses: the view's shell over the account's own power.
  it.each(['hr', 'finance'])('draws the %s view over the account’s own power', async view => {
    mocks.cookie = view
    mocks.rpc.mockImplementation(async (fn: string) => ({
      data: fn === 'current_permissions' ? ['dashboard', 'revenue', 'view_switch']
        : fn === 'current_actions' ? { 'revenue.view': 'all', 'revenue.manage': 'all' }
        : fn === 'current_sensitive_fields' ? ['salary', 'nric', 'bank']
        : null,
    }))
    const user = await getUser()
    expect(user).toMatchObject({
      role: view, actualRole: 'principal', canSwitchView: true,
      permissions: ['dashboard', 'revenue', 'view_switch'],
      actions: { 'revenue.view': 'all', 'revenue.manage': 'all' },
      sensitive: ['salary', 'nric', 'bank'],
    })
    expect(mocks.maskLookup).not.toHaveBeenCalled()
  })

  it.each(['revenue_member', 'hr'])('never elevates a real %s account through a forged view cookie', async role => {
    mocks.row!.role = role as User['role']
    mocks.rpc.mockResolvedValue({ data: ['dashboard', 'revenue'] })
    mocks.cookie = 'finance'
    const user = await getUser()
    expect(user?.role).toBe(role)
    expect(user?.actualRole).toBeUndefined()
    expect(user?.permissions).toEqual(['dashboard', 'revenue'])
  })

  // 2026-10-08: switching views is Ultimate full access's key, not the role.
  // Full access is a principal-kind account without it — never masked, no
  // switcher, whatever cookie the browser still carries.
  it('never masks a principal-kind account without view_switch (Full access)', async () => {
    mocks.rpc.mockResolvedValue({ data: ['dashboard', 'revenue'] })
    mocks.cookie = 'hr'
    const user = await getUser()
    expect(user).toMatchObject({ role: 'principal', canSwitchView: false, permissions: ['dashboard', 'revenue'] })
    expect(user?.actualRole).toBeUndefined()
  })

  it('lets any account holding view_switch switch, and keeps the key across the mask', async () => {
    mocks.row!.role = 'staff'
    mocks.cookie = 'finance'
    const user = await getUser()
    expect(user).toMatchObject({ role: 'finance', actualRole: 'staff', canSwitchView: true })
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
    expect(await getMemberUser()).toBeNull()
  })

  it('requires verified identity even when a view cookie exists', async () => {
    mocks.subject = null
    mocks.cookie = 'revenue_member'
    expect(await getMemberUser()).toBeNull()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.maskLookup).not.toHaveBeenCalled()
  })
})

// 2026-10-02: Payroll Requests, the payroll bank file, the Invoice Pool — the
// surfaces that are about what one named person is paid.
describe('requirePayrollPayouts', () => {
  const signedInAs = (role: User['role'], permissions: string[]) => {
    mocks.row!.role = role
    mocks.rpc.mockResolvedValue({ data: permissions })
  }

  it('lets a treasury account through once it holds Payroll payouts', async () => {
    signedInAs('finance', ['treasury', 'payroll_payouts'])
    const user = await requirePayrollPayouts('treasury')
    expect(user.permissions).toContain('payroll_payouts')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('sends a treasury account without it back to the dashboard', async () => {
    signedInAs('finance', ['treasury'])
    await requirePayrollPayouts('treasury')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('lets HR through on HR Costing alone: the payroll vouchers are theirs', async () => {
    signedInAs('hr', ['hr_costing'])
    await requirePayrollPayouts('hr_costing', 'treasury')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('asks for the page permission first: Payroll payouts by itself opens nothing', async () => {
    signedInAs('dept_manager', ['payroll_payouts'])
    await requirePayrollPayouts('treasury')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})
