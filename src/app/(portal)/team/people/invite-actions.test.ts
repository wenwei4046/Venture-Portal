import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  viewingAs: false,
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: () => ({ auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
// Viewing as somebody writes nothing (2026-10-11); here nobody is.
vi.mock('@/lib/view-as-person', () => ({ viewingAsSomebody: async () => mocks.viewingAs }))

import { inviteUser } from './invite-actions'

type Row = Record<string, unknown>

const ONG = '5f0c2a8e-1b2c-4d3e-8f4a-0b1c2d3e4f5a'

function database() {
  const tables: Record<string, Row[]> = {
    users: [],
    hr_staff_costs: [{
      id: ONG, employee_name: 'ONG SIEW LAN', user_id: null, status: 'active', department_id: 'finance',
      titles: { name: 'SENIOR ACCOUNT EXECUTIVE', template_id: 'tpl-maker', permission_templates: { name: 'Finance · Maker', base_role: 'finance' } },
    }],
  }
  const writes: Array<{ table: string; row: Row; id?: unknown }> = []
  const state = { insertError: null as null | { message: string }, rpcError: null as null | { message: string } }
  const rpc = vi.fn(async () => ({ data: null, error: state.rpcError }))
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = []
    let patch: Row | null = null
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
      maybeSingle: async () => ({ data: tables[table].find(row => filters.every(([k, v]) => row[k] === v)) ?? null, error: null }),
      insert: async (row: Row) => {
        if (state.insertError) return { error: state.insertError }
        writes.push({ table, row })
        return { error: null }
      },
      update: (row: Row) => { patch = row; return query },
      then: (resolve: (value: { error: null }) => unknown) => {
        if (patch) writes.push({ table, row: patch, id: filters.find(([key]) => key === 'id')?.[1] })
        return Promise.resolve({ error: null }).then(resolve)
      },
    }
    return query
  })
  return { tables, writes, state, from, rpc }
}

const invite = (overrides: Record<string, unknown> = {}) =>
  inviteUser({ staffId: ONG, email: 'Siew@Houzs.com', password: 'Hv-7k2m9q', ...overrides })

describe('inviting somebody on the roster', () => {
  let db: ReturnType<typeof database>
  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    mocks.requirePermission.mockResolvedValue({
      id: 'principal',
      permissions: ['team_invite', 'permissions_manage'],
      actions: { 'accounts.view': 'all', 'accounts.create': 'all', 'accounts.manage': 'all' },
    })
    mocks.createClient.mockResolvedValue(db)
    mocks.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
  })

  it('creates the login with the account kind their title’s template hands out, and attaches it', async () => {
    expect(await invite()).toEqual({ ok: true, name: 'ONG SIEW LAN', email: 'siew@houzs.com' })
    expect(mocks.requirePermission).toHaveBeenCalledWith('accounts', 'create')
    expect(db.writes).toEqual([
      { table: 'users', row: { id: 'new-user', email: 'siew@houzs.com', name: 'ONG SIEW LAN', role: 'finance', department_id: 'finance' } },
      { table: 'hr_staff_costs', row: { user_id: 'new-user', email: 'siew@houzs.com' }, id: ONG },
    ])
    expect(db.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/team', 'layout')
  })

  it('saves the cells changed for this person alone', async () => {
    const cells = [{ function_key: 'audit_log', action: 'view', scope: 'all' }]
    expect((await invite({ cells })).ok).toBe(true)
    expect(db.rpc).toHaveBeenCalledWith('permission_user_cells_set', { p_user: 'new-user', p_cells: cells })
  })

  it('refuses per-person cells from somebody who may invite but not manage permissions', async () => {
    mocks.requirePermission.mockResolvedValue({ id: 'hr', permissions: ['team_invite'], actions: { 'accounts.view': 'all', 'accounts.create': 'all' } })
    const result = await invite({ cells: [{ function_key: 'audit_log', action: 'view', scope: 'all' }] })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('Only whoever manages permissions') })
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it.each([
    ['a title with no template', () => { (db.tables.hr_staff_costs[0].titles as Row).permission_templates = null }, 'has no permission template yet'],
    ['no title at all', () => { db.tables.hr_staff_costs[0].titles = null }, 'has no title yet'],
    ['somebody with a login already', () => { db.tables.hr_staff_costs[0].user_id = 'someone' }, 'already has a login'],
    ['somebody who has left', () => { db.tables.hr_staff_costs[0].status = 'inactive' }, 'no longer active'],
    ['an email already in use', () => { db.tables.users.push({ id: 'x', email: 'siew@houzs.com' }) }, 'already has an account'],
  ])('refuses %s before any credential exists', async (_label, arrange, reason) => {
    arrange()
    const result = await invite()
    expect(result).toEqual({ ok: false, reason: expect.stringContaining(reason) })
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it('answers a bad form with the drawer’s own words, not a throw', async () => {
    expect(await invite({ password: '123' })).toEqual({ ok: false, reason: 'Password must be at least 6 characters' })
    expect(await invite({ staffId: '' })).toEqual({ ok: false, reason: 'Pick somebody from the roster' })
  })

  it('deletes the credential again when a later step fails', async () => {
    db.state.rpcError = { message: 'cannot be set that way' }
    const result = await invite({ cells: [{ function_key: 'audit_log', action: 'view', scope: 'all' }] })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('cannot be set that way') })
    expect(mocks.deleteUser).toHaveBeenCalledWith('new-user')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  // A login is minted with the service role, around the read-only session (2026-10-11).
  it('mints nothing while viewing the portal as somebody', async () => {
    mocks.viewingAs = true
    expect(await invite()).toEqual({ ok: false, reason: 'Read-only while viewing as somebody — nothing is saved.' })
    expect(mocks.createUser).not.toHaveBeenCalled()
    mocks.viewingAs = false
  })
  it('requires the invite permission before reading anything', async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(invite()).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
