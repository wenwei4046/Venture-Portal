import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  listSubDepartments: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('./_lib/sub-departments', () => ({ listSubDepartments: mocks.listSubDepartments }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { addMember, changeMemberTitle } from './hierarchy-actions'
import { currentPeriodStart } from '@/lib/hierarchy-writes'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }

/** Exercise the action and actual membership writer against a small query fake. */
function database() {
  const source = {
    id: 'source-position', staff_id: 'person', scheme_id: 'fair-scheme',
    title_id: 'company-title', rank_id: 'source-rank', upline_staff_id: 'manager',
    rate_mode: 'fixed', effective_from: '2026-01-01', effective_to: null,
  }
  const tables: Record<string, Row[]> = {
    hr_staff_costs: [{ id: 'person', status: 'active', department_id: 'revenue', title_id: 'company-title', titles: { is_department_head: false } }],
    titles: [
      { id: 'company-title', name: 'Revenue Specialist', is_active: true, is_department_head: false },
      { id: 'ir-title', name: 'Revenue Specialist', is_active: true, is_department_head: false },
      { id: 'leader-title', name: 'Team Leader', is_active: true, is_department_head: false },
    ],
    comm_hierarchy: [source],
    comm_ranks: [
      { id: 'higher-rank', scheme_id: 'ir-scheme', title_id: 'ir-title', can_recruit: true, sort_order: 3 },
      { id: 'floor-rank', scheme_id: 'ir-scheme', title_id: 'ir-title', can_recruit: false, sort_order: 1 },
      { id: 'other-title-rank', scheme_id: 'fair-scheme', title_id: 'company-title', can_recruit: false, sort_order: 0 },
      { id: 'leader-floor', scheme_id: 'ir-scheme', title_id: 'leader-title', can_recruit: true, sort_order: 5 },
    ],
  }
  const writes: Array<{ table: string; row: Row }> = []
  const state = {
    insertError: null as DbError | null, readError: null as DbError | null,
    titleReadError: null as DbError | null, rpcError: null as DbError | null,
    /** Where the person is BASED — what `comm_home_sub_department` answers. */
    basedIn: 'fair' as string | null,
  }
  // The home lookup is a read every membership action now makes, so it is kept
  // off `writeRpc`: "nothing was written" has to stay a statement about writes.
  const writeRpc = vi.fn(async (_name: string, _args: Row) => ({ data: null, error: state.rpcError }))
  const rpc = vi.fn(async (name: string, args: Row) =>
    name === 'comm_home_sub_department' ? { data: state.basedIn, error: null } : writeRpc(name, args))
  const from = vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = []
    const result = () => ({ data: tables[table].filter(row => filters.every(filter => filter(row))), error: state.readError ?? (table === 'titles' ? state.titleReadError : null) })
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query },
      is: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query },
      maybeSingle: async () => { const response = result(); return { ...response, data: response.data[0] ?? null } },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      insert: async (row: Row) => {
        writes.push({ table, row })
        if (!state.insertError) tables[table].push({ ...row, effective_to: null })
        return { data: null, error: state.insertError }
      },
    }
    return query
  })
  return { from, rpc, writeRpc, tables, writes, state, source }
}

function form(overrides: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ staff_id: 'person', scheme_id: 'ir-scheme', title_id: 'ir-title', ...overrides })) {
    data.set(key, value)
  }
  return data
}

describe('addMember with a selected destination title on the chart or Team tab', () => {
  let db: ReturnType<typeof database>
  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    mocks.createClient.mockResolvedValue(db)
    mocks.requirePermission.mockResolvedValue({ id: 'actor' })
    mocks.listSubDepartments.mockResolvedValue([
      { id: 'fair', name: 'Fair', schemeId: 'fair-scheme', departmentId: 'revenue', isHome: true },
      { id: 'ir', name: 'IR', schemeId: 'ir-scheme', departmentId: 'revenue', isHome: false },
    ])
  })

  it('adds an independent destination membership at its title floor without changing the original', async () => {
    const original = { ...db.source }
    expect(await addMember(form())).toEqual({ ok: true, note: null })
    expect(mocks.requirePermission).toHaveBeenCalledWith('revenue', 'edit')
    expect(db.writes).toEqual([{
      table: 'comm_hierarchy',
      row: {
        scheme_id: 'ir-scheme', staff_id: 'person', title_id: 'ir-title',
        upline_staff_id: null, rank_id: 'floor-rank', rate_mode: null,
        effective_from: currentPeriodStart(), created_by: 'actor',
      },
    }])
    expect(db.tables.comm_hierarchy).toHaveLength(2)
    expect(db.source).toEqual(original)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/revenue', 'layout')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/team', 'layout')
  })

  it('requires permission before reading or writing membership data', async () => {
    const denied = new Error('Permission denied')
    mocks.requirePermission.mockRejectedValueOnce(denied)
    await expect(addMember(form())).rejects.toBe(denied)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it('adds a Specialist as Team Leader in IR while preserving their other memberships and company title', async () => {
    db.tables.comm_hierarchy.push({ ...db.source, id: 'events-position', scheme_id: 'events-scheme' })
    const originalMemberships = db.tables.comm_hierarchy.map(row => ({ ...row }))
    const originalRoster = { ...db.tables.hr_staff_costs[0] }

    expect(await addMember(form({ title_id: 'leader-title' }))).toEqual({ ok: true, note: null })
    expect(db.writes).toEqual([{
      table: 'comm_hierarchy',
      row: {
        scheme_id: 'ir-scheme', staff_id: 'person', title_id: 'leader-title',
        upline_staff_id: null, rank_id: 'leader-floor', rate_mode: null,
        effective_from: currentPeriodStart(), created_by: 'actor',
      },
    }])
    expect(db.tables.comm_hierarchy.slice(0, 2)).toEqual(originalMemberships)
    expect(db.tables.hr_staff_costs[0]).toEqual(originalRoster)
  })

  it('rejects missing input and home or inactive schemes without writing', async () => {
    expect(await addMember(form({ staff_id: '' }))).toMatchObject({ ok: false })
    expect(await addMember(form({ title_id: '' }))).toMatchObject({ ok: false })
    expect(await addMember(form({ scheme_id: 'fair-scheme' }))).toMatchObject({ ok: false, note: expect.stringContaining('roster') })
    expect(await addMember(form({ scheme_id: 'retired-scheme' }))).toMatchObject({ ok: false, note: expect.stringContaining('active scheme') })
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['inactive staff', { status: 'inactive' }, 'no longer active'],
    ['another payroll department', { department_id: 'hr' }, 'current department'],
    ['department heads', { titles: { is_department_head: true } }, 'directors'],
  ])('rejects %s even when a stale client sends them', async (_name, patch, message) => {
    Object.assign(db.tables.hr_staff_costs[0], patch)
    expect(await addMember(form())).toMatchObject({ ok: false, note: expect.stringContaining(message) })
    expect(db.writes).toEqual([])
  })

  it('rejects a title that exists only on another scheme', async () => {
    expect(await addMember(form({ title_id: 'company-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('no rung') })
    expect(db.writes).toEqual([])
  })

  it.each([
    ['retired', { is_active: false }],
    ['director', { is_department_head: true }],
    ['missing', { id: 'deleted-title' }],
  ])('rejects a %s selected title even if its destination rung remains', async (_label, patch) => {
    Object.assign(db.tables.titles[2], patch)
    expect(await addMember(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('no longer an active member title') })
    expect(db.writes).toEqual([])
    expect(db.tables.comm_hierarchy).toEqual([db.source])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a title whose destination rung was removed after the menu opened', async () => {
    db.tables.comm_ranks = db.tables.comm_ranks.filter(row => row.id !== 'leader-floor')
    expect(await addMember(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('no rung') })
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a title lookup failure without opening a membership', async () => {
    db.state.titleReadError = { code: '42501', message: 'permission denied' }
    expect(await addMember(form())).toMatchObject({ ok: false, note: expect.stringContaining('Could not check the selected title') })
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a second destination membership while retaining both memberships', async () => {
    await addMember(form())
    mocks.revalidatePath.mockClear()
    expect(await addMember(form())).toMatchObject({ ok: false, note: expect.stringContaining('already a member') })
    expect(db.writes).toHaveLength(1)
    expect(db.tables.comm_hierarchy).toHaveLength(2)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a concurrent duplicate from the database without claiming success', async () => {
    db.state.insertError = { code: '23P01', message: 'one_position_per_scheme' }
    expect(await addMember(form())).toMatchObject({ ok: false, note: expect.stringContaining('already have a membership') })
    expect(db.tables.comm_hierarchy).toEqual([db.source])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('returns database denials and read failures without claiming success', async () => {
    db.state.insertError = { code: '42501', message: 'permission denied' }
    expect(await addMember(form())).toMatchObject({ ok: false, note: expect.stringContaining('not allowed') })
    db.state.readError = { code: '42501', message: 'permission denied' }
    expect(await addMember(form())).toMatchObject({ ok: false, note: expect.stringContaining('roster details') })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('returns an actionable failure if a destination lookup throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.listSubDepartments.mockRejectedValueOnce(new Error('network failure'))
    expect(await addMember(form())).toEqual({ ok: false, note: 'Could not add this person. Please try again.' })
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('changeMemberTitle on the current sub-department card', () => {
  let db: ReturnType<typeof database>
  let position: Row
  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    position = {
      ...db.source, id: 'ir-position', scheme_id: 'ir-scheme', title_id: 'ir-title',
      rank_id: 'floor-rank', upline_staff_id: 'ir-manager', rate_mode: 'variable',
    }
    db.tables.comm_hierarchy.push(position)
    mocks.createClient.mockResolvedValue(db)
    mocks.requirePermission.mockResolvedValue({ id: 'actor' })
    mocks.listSubDepartments.mockResolvedValue([
      { id: 'fair', name: 'Fair', schemeId: 'fair-scheme', departmentId: 'revenue', isHome: true },
      { id: 'ir', name: 'IR', schemeId: 'ir-scheme', departmentId: 'revenue', isHome: false },
      { id: 'hr', name: 'HR', schemeId: 'hr-scheme', departmentId: 'hr', isHome: false },
    ])
  })

  it('changes only IR to Team Leader through the effective-dated writer and raises to its title floor', async () => {
    const originalMemberships = db.tables.comm_hierarchy.map(row => ({ ...row }))
    const originalRoster = { ...db.tables.hr_staff_costs[0] }
    const request = form({ title_id: 'leader-title', rank_id: 'other-title-rank', rate_mode: 'fixed', upline_staff_id: 'someone-else' })

    expect(await changeMemberTitle(request)).toEqual({ ok: true, note: null })
    expect(db.writeRpc).toHaveBeenCalledExactlyOnceWith('comm_replace_membership_position', {
      p_position_id: 'ir-position', p_title_id: 'leader-title', p_rank_id: 'leader-floor',
      p_rate_mode: 'variable', p_upline_staff_id: 'ir-manager', p_actor: 'actor',
    })
    // No raw row write: the transactional RPC alone closes/replaces the old
    // position, preserving the months already computed from its old title.
    expect(db.writes).toEqual([])
    expect(db.tables.comm_hierarchy).toEqual(originalMemberships)
    expect(db.tables.hr_staff_costs[0]).toEqual(originalRoster)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/revenue', 'layout')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/team', 'layout')
  })

  it('retains an existing rank above the new title floor', async () => {
    db.tables.comm_ranks.push({ id: 'earned-rank', scheme_id: 'ir-scheme', title_id: 'leader-title', can_recruit: true, sort_order: 9 })
    position.rank_id = 'earned-rank'
    expect(await changeMemberTitle(form({ title_id: 'leader-title' }))).toEqual({ ok: true, note: null })
    expect(db.writeRpc).toHaveBeenCalledWith('comm_replace_membership_position', expect.objectContaining({
      p_rank_id: 'earned-rank', p_title_id: 'leader-title', p_rate_mode: 'variable', p_upline_staff_id: 'ir-manager',
    }))
  })

  it('does not rewrite an already selected title or accept browser rank/mode changes', async () => {
    expect(await changeMemberTitle(form({ rank_id: 'leader-floor', rate_mode: 'fixed' }))).toEqual({ ok: true, note: null })
    expect(db.writeRpc).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['missing person', { staff_id: '' }, 'Pick a person'],
    ['missing scheme', { scheme_id: '' }, 'Pick a person'],
    ['missing title', { title_id: '' }, 'Pick a person'],
    ['home', { scheme_id: 'fair-scheme' }, 'People Management'],
    ['inactive scheme', { scheme_id: 'retired-scheme' }, 'no active scheme'],
    ['foreign department', { scheme_id: 'hr-scheme' }, 'current department'],
    ['title from another scheme', { title_id: 'company-title' }, 'no rung'],
  ])('rejects %s without writing', async (_label, overrides, note) => {
    expect(await changeMemberTitle(form(overrides))).toMatchObject({ ok: false, note: expect.stringContaining(note) })
    expect(db.writeRpc).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['inactive', { status: 'inactive' }, 'no longer active'],
    ['moved to another department', { department_id: 'hr' }, 'current department'],
    ['department head', { titles: { is_department_head: true } }, 'directors'],
  ])('rejects somebody who became %s after their menu opened', async (_label, patch, note) => {
    Object.assign(db.tables.hr_staff_costs[0], patch)
    expect(await changeMemberTitle(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining(note) })
    expect(db.writeRpc).not.toHaveBeenCalled()
  })

  it.each([
    ['retired', { is_active: false }],
    ['director', { is_department_head: true }],
    ['missing', { id: 'deleted-title' }],
  ])('rejects a %s title even if a rung still references it', async (_label, patch) => {
    Object.assign(db.tables.titles[2], patch)
    expect(await changeMemberTitle(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('no longer an active member title') })
    expect(db.writeRpc).not.toHaveBeenCalled()
  })

  it.each(['missing', 'closed'])('rejects a %s current membership even when another department has one', async kind => {
    if (kind === 'missing') db.tables.comm_hierarchy = [db.source]
    else position.effective_to = '2026-08-31'
    expect(await changeMemberTitle(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('no longer a member') })
    expect(db.writeRpc).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it('refuses to carry a malformed cross-scheme current rank into the replacement', async () => {
    position.rank_id = 'other-title-rank'
    expect(await changeMemberTitle(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('current rank is not on') })
    expect(db.writeRpc).not.toHaveBeenCalled()
  })

  it('refuses a title whose rung was removed after the menu opened', async () => {
    db.tables.comm_ranks = db.tables.comm_ranks.filter(row => row.id !== 'leader-floor')
    expect(await changeMemberTitle(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('no rung') })
    expect(db.writeRpc).not.toHaveBeenCalled()
  })

  it('returns a readable database refusal without claiming success or issuing a separate row write', async () => {
    db.state.rpcError = { code: '42501', message: 'permission denied' }
    const originalMemberships = db.tables.comm_hierarchy.map(row => ({ ...row }))
    expect(await changeMemberTitle(form({ title_id: 'leader-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('not allowed') })
    expect(db.tables.comm_hierarchy).toEqual(originalMemberships)
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('returns roster and title lookup failures without writing', async () => {
    db.state.readError = { code: '42501', message: 'permission denied' }
    expect(await changeMemberTitle(form())).toMatchObject({ ok: false, note: expect.stringContaining('roster details') })
    db.state.readError = null
    db.state.titleReadError = { code: '42501', message: 'permission denied' }
    expect(await changeMemberTitle(form())).toMatchObject({ ok: false, note: expect.stringContaining('selected title') })
    expect(db.writeRpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('checks permission before reading or changing a title', async () => {
    const denied = new Error('Permission denied')
    mocks.requirePermission.mockRejectedValueOnce(denied)
    await expect(changeMemberTitle(form({ title_id: 'leader-title' }))).rejects.toBe(denied)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(db.writeRpc).not.toHaveBeenCalled()
  })
})
