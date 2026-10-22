import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import { redirect } from 'next/navigation'
import { getMemberUser, getUser, requireActionOn, requirePage, requirePayrollPayouts } from './auth'

const mocks = vi.hoisted(() => ({
  subject: 'signed-in-id' as string | null,
  cookie: '',
  person: '',
  header: {} as Record<string, string>,
  row: null as Omit<User, 'permissions'> | null,
  maskLookup: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => ({ value: name === 'vp-view-as-person' ? mocks.person : mocks.cookie }) }),
  headers: async () => ({ get: (name: string) => mocks.header[name] ?? null }),
}))
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
  mocks.person = ''
  mocks.header = {}
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
    signedInAs('staff', ['payroll_payouts'])
    await requirePayrollPayouts('treasury')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})

// View as a person (2026-10-11, the user: "can set a function is view as a user, same like
// in revenue app, i can view as a member"): the portal drawn as one account, read-only.
describe('getUser while viewing as a person', () => {
  const CARRIE = '3bff3ae3-d0a8-418c-b2b1-a2aa5fdd5419'
  const asCarrie = {
    id: CARRIE, name: 'ONG MEI SHUANG', email: 'carrie@example.com', role: 'finance', department_id: 'fin-dept',
    permissions: ['billing', 'claims', 'dashboard', 'treasury', 'venture_pool'],
    actions: { 'treasury.view': 'all', 'treasury.create': 'all', 'claims.view': 'own' },
    sensitive: ['bank'],
    tabs: { ticks: null, boxes: [], cells: true },
  }

  beforeEach(() => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'view_as_person' ? { data: asCarrie, error: null } : { data: ['dashboard', 'revenue', 'view_switch'], error: null })
  })

  it('draws the portal as that person — their kind, keys, actions, tabs and sensitive fields', async () => {
    mocks.person = CARRIE
    const user = await getUser()
    expect(user).toMatchObject({
      id: CARRIE, name: 'ONG MEI SHUANG', role: 'finance', department_id: 'fin-dept',
      permissions: asCarrie.permissions, actions: asCarrie.actions, sensitive: ['bank'],
      actualRole: 'principal', canSwitchView: true, viewingAs: { id: CARRIE, name: 'ONG MEI SHUANG' },
    })
    expect(user?.tabs).toContain('fin.payments.view')
    expect(mocks.rpc).toHaveBeenCalledWith('view_as_person', { p_user: CARRIE })
  })

  it('takes precedence over HR’s or Finance’s view', async () => {
    mocks.person = CARRIE
    mocks.cookie = 'hr'
    expect((await getUser())?.viewingAs?.id).toBe(CARRIE)
  })

  it('is the portal’s only: the member app and the account itself are never viewed as somebody', async () => {
    mocks.person = CARRIE
    expect((await getMemberUser())?.viewingAs).toBeUndefined()
    expect(mocks.rpc).not.toHaveBeenCalledWith('view_as_person', expect.anything())
  })

  it('is nothing for an account that may not switch views, or when the database refuses', async () => {
    mocks.person = CARRIE
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'view_as_person' ? { data: asCarrie, error: null } : { data: ['dashboard', 'revenue'], error: null })
    expect((await getUser())?.viewingAs).toBeUndefined()
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'view_as_person' ? { data: null, error: { message: 'Only whoever may switch views can view as somebody else' } } : { data: ['dashboard', 'view_switch'], error: null })
    const user = await getUser()
    expect(user?.viewingAs).toBeUndefined()
    expect(user?.id).toBe('signed-in-id')
  })

  it('reads no cookie that is not an account id', async () => {
    mocks.person = 'not-an-id'
    await getUser()
    expect(mocks.rpc).not.toHaveBeenCalledWith('view_as_person', expect.anything())
  })
})

// Writes follow the tab boxes of the page (2026-10-11, the user: "yes separate by tab").
describe('a page’s writes follow its own tabs’ boxes', () => {
  // A template saved on tabs: Payments may create, Receipt is only viewed.
  const savedOnTabs = { ticks: ['fin.overview.view', 'fin.payments.view', 'fin.payments.create', 'fin.receipt.view'], boxes: [], cells: false }
  const answers = (tabs: unknown) => async (fn: string) => ({
    data: fn === 'current_permissions' ? ['dashboard', 'treasury']
      : fn === 'current_actions' ? { 'treasury.view': 'all', 'treasury.create': 'all' }
      : fn === 'current_tabs' ? tabs
      : null,
    error: null,
  })

  beforeEach(() => {
    mocks.row!.role = 'finance'
    mocks.rpc.mockImplementation(answers(savedOnTabs))
  })

  it('a page narrows the account to its own tabs’ boxes', async () => {
    expect((await requirePage('/receipts')).actions?.['treasury.create']).toBeUndefined()
    expect((await requirePage('/payments')).actions?.['treasury.create']).toBe('all')
  })

  it('a write follows the page its gate names (2026-10-11, plan C)', async () => {
    await requireActionOn('/receipts', 'treasury', 'create')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
    vi.mocked(redirect).mockClear()
    await requireActionOn('/payments', 'treasury', 'create')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('a write offered on several pages counts while any of them keeps it', async () => {
    await requireActionOn(['/receipts', '/fund-in'], 'treasury', 'create')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
    vi.mocked(redirect).mockClear()
    await requireActionOn(['/receipts', '/payments'], 'treasury', 'create')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('whatever page the request says it came from — a Referer is the sender\'s to write', async () => {
    mocks.header = { 'next-action': 'a1', referer: 'https://portal.example/payments?tab=draft' }
    await requireActionOn('/receipts', 'treasury', 'create')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
    vi.mocked(redirect).mockClear()
    mocks.header = { 'next-action': 'a1' }
    await requireActionOn('/receipts', 'treasury', 'create')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('never narrows an account whose tabs are worked out from its cells', async () => {
    mocks.rpc.mockImplementation(answers(null))
    expect((await requirePage('/receipts')).actions?.['treasury.create']).toBe('all')
    await requireActionOn('/receipts', 'treasury', 'create')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('but a box of their own held back narrows them, over a template not saved on tabs too', async () => {
    mocks.rpc.mockImplementation(answers({ ticks: null, boxes: [{ tab: 'fin.receipt', action: 'create', granted: false }], cells: true }))
    expect((await requirePage('/receipts')).actions?.['treasury.create']).toBeUndefined()
  })
})
