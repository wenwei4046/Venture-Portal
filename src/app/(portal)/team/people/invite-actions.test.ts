import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  viewingAs: false,
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  inviteUserByEmail: vi.fn(),
  generateLink: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: () => ({
    auth: {
      admin: {
        createUser: mocks.createUser, deleteUser: mocks.deleteUser, inviteUserByEmail: mocks.inviteUserByEmail,
        generateLink: mocks.generateLink, getUserById: mocks.getUserById, updateUserById: mocks.updateUserById,
      },
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', 'venture-portal-chi.vercel.app']]) }))
// Viewing as somebody writes nothing (2026-10-11); here nobody is.
vi.mock('@/lib/view-as-person', () => ({ viewingAsSomebody: async () => mocks.viewingAs }))

import { inviteUser, reinviteUser } from './invite-actions'

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
    expect(await invite()).toEqual({ ok: true, mode: 'password', name: 'ONG SIEW LAN', email: 'siew@houzs.com' })
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'siew@houzs.com', password: 'Hv-7k2m9q', email_confirm: true, user_metadata: { name: 'ONG SIEW LAN' },
    })
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.any(String), 'accounts', 'create')
    // The portal user and the person's login are ONE call under the caller's session (2026-10-20).
    expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(db.rpc).toHaveBeenCalledWith('account_attach_login', { p_staff: ONG, p_login: 'new-user', p_email: 'siew@houzs.com' })
    expect(db.writes).toEqual([])
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

// The user's first choice (2026-10-16): Send Invite Link — they choose their own password from it.
describe('inviting by link', () => {
  let db: ReturnType<typeof database>
  const HASH = 'a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233'
  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    mocks.requirePermission.mockResolvedValue({
      id: 'principal', permissions: ['team_invite'], actions: { 'accounts.view': 'all', 'accounts.create': 'all' },
    })
    mocks.createClient.mockResolvedValue(db)
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'invited-user' } }, error: null })
    mocks.generateLink.mockResolvedValue({ data: { user: { id: 'linked-user' }, properties: { hashed_token: HASH } }, error: null })
  })
  const byLink = (overrides: Record<string, unknown> = {}) => invite({ mode: 'link', password: undefined, ...overrides })

  it('has Supabase email it, makes no password, and attaches the login as a password invite does', async () => {
    expect(await byLink()).toEqual({ ok: true, mode: 'link', name: 'ONG SIEW LAN', email: 'siew@houzs.com', emailed: true })
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith('siew@houzs.com', { data: { name: 'ONG SIEW LAN' } })
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.generateLink).not.toHaveBeenCalled()
    expect(db.rpc).toHaveBeenCalledWith('account_attach_login', { p_staff: ONG, p_login: 'invited-user', p_email: 'siew@houzs.com' })
    expect(db.writes).toEqual([])
  })

  it('when Supabase will not email the address, makes the same login with no email and hands back our own link', async () => {
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { code: 'email_address_not_authorized', message: 'not authorized' } })
    expect(await byLink()).toEqual({
      ok: true, mode: 'link', name: 'ONG SIEW LAN', email: 'siew@houzs.com', emailed: false,
      link: `https://venture-portal-chi.vercel.app/welcome?token_hash=${HASH}&type=invite`,
      why: expect.stringContaining('until an email service is connected'),
    })
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: 'invite', email: 'siew@houzs.com', options: { data: { name: 'ONG SIEW LAN' } } })
    expect(db.rpc).toHaveBeenCalledWith('account_attach_login', { p_staff: ONG, p_login: 'linked-user', p_email: 'siew@houzs.com' })
  })

  it('refuses an address that already signs in, and makes no link for it', async () => {
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists', message: 'exists' } })
    expect(await byLink()).toEqual({ ok: false, reason: 'That email already has an account.' })
    expect(mocks.generateLink).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it('deletes the invited login again when the portal user cannot be made', async () => {
    db.state.rpcError = { message: 'denied' }
    expect(await byLink()).toEqual({ ok: false, reason: expect.stringContaining('denied') })
    expect(mocks.deleteUser).toHaveBeenCalledWith('invited-user')
  })
})

// An invite link never used (2026-10-16): a new one, or the password now.
describe('inviting again', () => {
  let db: ReturnType<typeof database>
  const HASH = 'b4f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233'
  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    db.tables.hr_staff_costs[0].user_id = 'pending-user'
    mocks.requirePermission.mockResolvedValue({
      id: 'principal', permissions: ['team_invite'], actions: { 'accounts.view': 'all', 'accounts.create': 'all' },
    })
    mocks.createClient.mockResolvedValue(db)
    mocks.getUserById.mockResolvedValue({
      data: { user: { id: 'pending-user', email: 'siew@houzs.com', invited_at: '2026-10-16T01:00:00Z', email_confirmed_at: null } }, error: null,
    })
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'pending-user' } }, error: null })
    mocks.generateLink.mockResolvedValue({ data: { user: { id: 'pending-user' }, properties: { hashed_token: HASH } }, error: null })
    mocks.updateUserById.mockResolvedValue({ data: { user: { id: 'pending-user' } }, error: null })
  })

  it('sends a new link to the login’s own email, and touches no row of the portal', async () => {
    expect(await reinviteUser({ staffId: ONG, mode: 'link' })).toEqual({ ok: true, mode: 'link', name: 'ONG SIEW LAN', email: 'siew@houzs.com', emailed: true })
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith('siew@houzs.com', { data: { name: 'ONG SIEW LAN' } })
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/team', 'layout')
  })

  it('hands back a new link when Supabase will not email it', async () => {
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { code: 'over_email_send_rate_limit', message: 'slow down' } })
    const result = await reinviteUser({ staffId: ONG, mode: 'link' })
    expect(result).toMatchObject({ ok: true, emailed: false, link: `https://venture-portal-chi.vercel.app/welcome?token_hash=${HASH}&type=invite` })
  })

  it('sets the password now, which ends the invite', async () => {
    expect(await reinviteUser({ staffId: ONG, mode: 'password', password: 'Hv-abcdefg' })).toEqual({ ok: true, mode: 'password', name: 'ONG SIEW LAN', email: 'siew@houzs.com' })
    expect(mocks.updateUserById).toHaveBeenCalledWith('pending-user', { password: 'Hv-abcdefg', email_confirm: true })
  })

  it.each([
    ['somebody who has chosen their password', () => mocks.getUserById.mockResolvedValue({ data: { user: { id: 'pending-user', email: 'siew@houzs.com', invited_at: '2026-10-16T01:00:00Z', email_confirmed_at: '2026-10-16T02:00:00Z' } }, error: null }), 'already set a password'],
    ['a login made with a password', () => mocks.getUserById.mockResolvedValue({ data: { user: { id: 'pending-user', email: 'siew@houzs.com', invited_at: null, email_confirmed_at: '2026-10-16T02:00:00Z' } }, error: null }), 'already set a password'],
    ['somebody with no login at all', () => { db.tables.hr_staff_costs[0].user_id = null }, 'invite them instead'],
  ])('does not invite again %s', async (_label, arrange, reason) => {
    arrange()
    expect(await reinviteUser({ staffId: ONG, mode: 'link' })).toEqual({ ok: false, reason: expect.stringContaining(reason) })
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })

  it('asks a set password for six characters, and the gate before anything', async () => {
    expect(await reinviteUser({ staffId: ONG, mode: 'password', password: '123' })).toEqual({ ok: false, reason: 'Password must be at least 6 characters' })
    mocks.requirePermission.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(reinviteUser({ staffId: ONG, mode: 'link' })).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.any(String), 'accounts', 'create')
  })
})

// HR invites (2026-10-20 — the user: HR "supposed to be 是要能够 invite user 的"): Permissions · Create is enough,
// but a full-access title — a Principal-kind template, or one that ticks Manage permissions — is given a login only
// by whoever manages permissions: the inviter types the email and may set the password, so it would be theirs.
describe('inviting as HR — Permissions · Create, not Manage permissions', () => {
  let db: ReturnType<typeof database>
  const HR = { id: 'li-sean', permissions: ['team', 'team_invite'], actions: { 'accounts.view': 'all', 'accounts.create': 'all' } }
  const PRINCIPAL = { id: 'principal', permissions: ['team_invite', 'permissions_manage'], actions: { 'accounts.view': 'all', 'accounts.create': 'all', 'accounts.manage': 'all' } }
  const onTemplate = (template: Row) => { (db.tables.hr_staff_costs[0].titles as Row).permission_templates = template }
  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    mocks.requirePermission.mockResolvedValue(HR)
    mocks.createClient.mockResolvedValue(db)
    mocks.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'invited-user' } }, error: null })
    mocks.getUserById.mockResolvedValue({
      data: { user: { id: 'pending-user', email: 'siew@houzs.com', invited_at: '2026-10-20T01:00:00Z', email_confirmed_at: null } }, error: null,
    })
  })

  it('gives somebody on an everyday title a login, by link or by password', async () => {
    expect(await invite({ mode: 'link', password: undefined })).toMatchObject({ ok: true, mode: 'link', emailed: true })
    expect(db.rpc).toHaveBeenCalledWith('account_attach_login', { p_staff: ONG, p_login: 'invited-user', p_email: 'siew@houzs.com' })
    expect(await invite()).toMatchObject({ ok: true, mode: 'password' })
  })

  it.each([
    ['a Principal-kind template', { name: 'Ultimate full access', base_role: 'principal', permission_template_grants: [] }],
    ['a template that manages permissions', { name: 'People lead', base_role: 'staff', permission_template_grants: [{ function_key: 'accounts', action: 'manage' }] }],
  ])('refuses a full-access title — %s — before any login exists', async (_label, template) => {
    onTemplate(template)
    expect(await invite()).toEqual({
      ok: false,
      reason: `SENIOR ACCOUNT EXECUTIVE is a full-access title (${template.name}): only whoever manages permissions gives it a login.`,
    })
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('whoever manages permissions gives a full-access title its login, as before', async () => {
    mocks.requirePermission.mockResolvedValue(PRINCIPAL)
    onTemplate({ name: 'Ultimate full access', base_role: 'principal', permission_template_grants: [{ function_key: 'accounts', action: 'manage' }] })
    expect(await invite()).toMatchObject({ ok: true, mode: 'password' })
    expect(db.rpc).toHaveBeenCalledWith('account_attach_login', { p_staff: ONG, p_login: 'new-user', p_email: 'siew@houzs.com' })
  })

  it('does not invite a full-access login again — a new link or a password from HR would make it HR’s', async () => {
    db.tables.hr_staff_costs[0].user_id = 'pending-user'
    onTemplate({ name: 'Ultimate full access', base_role: 'principal', permission_template_grants: [] })
    for (const mode of ['link', 'password'] as const) {
      expect(await reinviteUser({ staffId: ONG, mode, password: 'Hv-abcdefg' })).toEqual({
        ok: false, reason: expect.stringContaining('only whoever manages permissions gives it a login'),
      })
    }
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    // An everyday title's pending login is HR's to invite again.
    onTemplate({ name: 'Finance · Maker', base_role: 'finance', permission_template_grants: [] })
    expect(await reinviteUser({ staffId: ONG, mode: 'link' })).toMatchObject({ ok: true, mode: 'link' })
  })
})
