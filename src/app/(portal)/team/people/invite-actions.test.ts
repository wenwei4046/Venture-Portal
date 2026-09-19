import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: () => ({ auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { inviteUser } from './invite-actions'

type Row = Record<string, unknown>

function database() {
  const tables: Record<string, Row[]> = {
    users: [],
    departments: [{ id: 'revenue', name: 'Revenue Department', payroll_source: 'commission' }],
    titles: [
      { id: 'head-title', is_department_head: true },
      { id: 'member-title', is_department_head: false },
    ],
    hr_staff_costs: [
      { id: 'principal', employee_name: 'Principal', departments: { name: 'Director Office', payroll_source: 'fixed' } },
      { id: 'existing', employee_name: 'Existing Director', user_id: null, department_id: 'revenue', title_id: 'head-title' },
    ],
  }
  const writes: Array<{ table: string; row: Row; id?: unknown }> = []
  const selections: Array<{ table: string; columns: string }> = []
  const state = { titleReadError: false }
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = []
    let patch: Row | null = null
    const result = () => {
      const error = table === 'titles' && state.titleReadError ? { message: 'Permission denied' } : null
      return { data: error ? [] : tables[table].filter(row => filters.every(([key, value]) => row[key] === value)), error }
    }
    const query = {
      select: (columns: string) => { selections.push({ table, columns }); return query },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
      maybeSingle: async () => { const response = result(); return { ...response, data: response.data[0] ?? null } },
      insert: async (row: Row) => { writes.push({ table, row }); return { error: null } },
      update: (row: Row) => { patch = row; return query },
      then: (resolve: (value: { error: null }) => unknown) => {
        if (patch) writes.push({ table, row: patch, id: filters.find(([key]) => key === 'id')?.[1] })
        return Promise.resolve({ error: null }).then(resolve)
      },
    }
    return query
  })
  return { tables, writes, selections, state, from }
}

function form(overrides: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    name: 'Revenue Director', email: 'director@example.test', password: 'test-password',
    role: 'hr', department_id: 'revenue', title_id: 'head-title', reports_to: 'principal',
    ...overrides,
  })) data.set(key, value)
  return data
}

describe('invite reporting preflight for Revenue department heads', () => {
  let db: ReturnType<typeof database>
  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    mocks.requirePermission.mockResolvedValue({ id: 'actor' })
    mocks.createClient.mockResolvedValue(db)
    mocks.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
  })

  it('allows a newly selected head title to report to a company manager', async () => {
    await inviteUser(form())
    expect(mocks.requirePermission).toHaveBeenCalledWith('team_invite')
    expect(mocks.createUser).toHaveBeenCalledOnce()
    expect(db.writes.find(write => write.table === 'hr_staff_costs')).toMatchObject({
      row: { title_id: 'head-title', reports_to: 'principal', department_id: 'revenue' },
    })
    expect(db.selections).toContainEqual({ table: 'titles', columns: 'is_department_head' })
  })

  it('uses an existing director’s saved title when the invite leaves title and department blank', async () => {
    await inviteUser(form({ staff_id: 'existing', title_id: '', department_id: '' }))
    expect(mocks.createUser).toHaveBeenCalledOnce()
    const write = db.writes.find(write => write.table === 'hr_staff_costs')
    expect(write).toMatchObject({ id: 'existing', row: { reports_to: 'principal', user_id: 'new-user' } })
    expect(write?.row).not.toHaveProperty('title_id')
    expect(db.selections.find(selection => selection.table === 'hr_staff_costs')?.columns).toContain('title_id')
  })

  it('uses the chosen head title when the existing roster title is an ordinary member', async () => {
    db.tables.hr_staff_costs[1].title_id = 'member-title'
    await inviteUser(form({ staff_id: 'existing' }))
    expect(mocks.createUser).toHaveBeenCalledOnce()
    expect(db.writes.find(write => write.table === 'hr_staff_costs')).toMatchObject({
      id: 'existing', row: { title_id: 'head-title', reports_to: 'principal' },
    })
  })

  it.each([
    ['new member', {}],
    ['existing director changing to a member title', { staff_id: 'existing' }],
  ])('rejects a %s crossing the commission boundary before creating credentials', async (_label, overrides) => {
    await expect(inviteUser(form({ ...overrides, title_id: 'member-title', is_department_head: 'true' })))
      .rejects.toThrow('commission upline')
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it.each([
    ['unavailable', false, 'missing-title', 'That title is no longer available'],
    ['unreadable', true, 'head-title', 'Could not check their reporting title'],
  ])('fails before creating credentials when the effective title is %s', async (_label, readError, titleId, message) => {
    db.state.titleReadError = readError
    await expect(inviteUser(form({ title_id: titleId }))).rejects.toThrow(message)
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it('requires invite permission before reading title facts or creating credentials', async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error('Permission denied'))
    await expect(inviteUser(form())).rejects.toThrow('Permission denied')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
  })
})
