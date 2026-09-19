import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  listSubDepartments: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('./_lib/sub-departments', () => ({ listSubDepartments: mocks.listSubDepartments }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { addMember, addMemberWithCurrentTitle } from './hierarchy-actions'
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
      { id: 'company-title', is_active: true, is_department_head: false },
      { id: 'ir-title', is_active: true, is_department_head: false },
    ],
    comm_hierarchy: [source],
    comm_ranks: [
      { id: 'higher-rank', scheme_id: 'ir-scheme', title_id: 'ir-title', can_recruit: true, sort_order: 3 },
      { id: 'floor-rank', scheme_id: 'ir-scheme', title_id: 'ir-title', can_recruit: false, sort_order: 1 },
      { id: 'other-title-rank', scheme_id: 'fair-scheme', title_id: 'company-title', can_recruit: false, sort_order: 0 },
    ],
  }
  const writes: Array<{ table: string; row: Row }> = []
  const state = { insertError: null as DbError | null, readError: null as DbError | null }
  const from = vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = []
    const result = () => ({ data: tables[table].filter(row => filters.every(filter => filter(row))), error: state.readError })
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
  return { from, tables, writes, state, source }
}

function form(overrides: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ staff_id: 'person', scheme_id: 'ir-scheme', title_id: 'ir-title', ...overrides })) {
    data.set(key, value)
  }
  return data
}

describe('addMember with an explicit title on the Team tab', () => {
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
    expect(mocks.requirePermission).toHaveBeenCalledWith('revenue')
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

  it('rejects missing input and home or inactive schemes without writing', async () => {
    expect(await addMember(form({ staff_id: '' }))).toMatchObject({ ok: false })
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

describe('quick-add with the source card’s current title', () => {
  let db: ReturnType<typeof database>
  const sourceForm = (overrides: Record<string, string> = {}) => form({ source_scheme_id: 'fair-scheme', ...overrides })

  beforeEach(() => {
    vi.clearAllMocks()
    db = database()
    db.tables.comm_ranks.push({
      id: 'company-title-floor', scheme_id: 'ir-scheme', title_id: 'company-title', can_recruit: false, sort_order: 0,
    })
    mocks.createClient.mockResolvedValue(db)
    mocks.requirePermission.mockResolvedValue({ id: 'actor' })
    mocks.listSubDepartments.mockResolvedValue([
      { id: 'fair', name: 'Fair', schemeId: 'fair-scheme', departmentId: 'revenue', isHome: true },
      { id: 'ir', name: 'IR', schemeId: 'ir-scheme', departmentId: 'revenue', isHome: false },
      { id: 'events', name: 'Events', schemeId: 'events-scheme', departmentId: 'revenue', isHome: false },
      { id: 'hr', name: 'HR', schemeId: 'hr-scheme', departmentId: 'hr', isHome: false },
    ])
  })

  it('ignores a submitted title and preserves the source title, rank and upline', async () => {
    const original = { ...db.source }
    expect(await addMemberWithCurrentTitle(sourceForm({ title_id: 'ir-title' }))).toEqual({ ok: true, note: null })
    expect(db.writes).toEqual([{
      table: 'comm_hierarchy',
      row: {
        scheme_id: 'ir-scheme', staff_id: 'person', title_id: 'company-title',
        upline_staff_id: null, rank_id: 'company-title-floor', rate_mode: null,
        effective_from: currentPeriodStart(), created_by: 'actor',
      },
    }])
    expect(db.source).toEqual(original)
    expect(db.tables.comm_hierarchy).toHaveLength(2)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/revenue', 'layout')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/team', 'layout')
  })

  it('copies the source sub-department’s independent title rather than the company title', async () => {
    const independent = { ...db.source, id: 'events-position', scheme_id: 'events-scheme', title_id: 'ir-title' }
    db.tables.comm_hierarchy.push(independent)
    const original = db.tables.comm_hierarchy.map(row => ({ ...row }))
    expect(await addMemberWithCurrentTitle(sourceForm({ source_scheme_id: 'events-scheme', title_id: 'company-title' }))).toEqual({ ok: true, note: null })
    expect(db.writes[0].row).toMatchObject({ title_id: 'ir-title', rank_id: 'floor-rank' })
    expect(db.tables.comm_hierarchy.slice(0, 2)).toEqual(original)
  })

  it('uses the current source membership title even if the card has become stale', async () => {
    db.source.title_id = 'ir-title'
    expect(await addMemberWithCurrentTitle(sourceForm({ title_id: 'company-title' }))).toEqual({ ok: true, note: null })
    expect(db.writes[0].row).toMatchObject({ title_id: 'ir-title', rank_id: 'floor-rank' })
  })

  it('falls back to the current roster title only for a home card without an open position', async () => {
    db.tables.comm_hierarchy = []
    const request = sourceForm()
    request.delete('title_id')
    expect(await addMemberWithCurrentTitle(request)).toEqual({ ok: true, note: null })
    expect(db.writes[0].row).toMatchObject({ title_id: 'company-title', rank_id: 'company-title-floor' })
  })

  it.each([
    ['missing source', { source_scheme_id: '' }, 'current sub-department'],
    ['retired source', { source_scheme_id: 'retired-scheme' }, 'source sub-department has no active scheme'],
    ['foreign source', { source_scheme_id: 'hr-scheme' }, 'current department'],
    ['source without membership', { source_scheme_id: 'events-scheme' }, 'no longer a member'],
    ['home destination', { scheme_id: 'fair-scheme' }, 'roster'],
    ['foreign destination', { scheme_id: 'hr-scheme' }, 'current department'],
    ['retired destination', { scheme_id: 'retired-scheme' }, 'no active scheme'],
  ])('refuses %s without writing', async (_label, overrides, message) => {
    expect(await addMemberWithCurrentTitle(sourceForm(overrides))).toMatchObject({ ok: false, note: expect.stringContaining(message) })
    expect(db.writes).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not copy a closed source membership', async () => {
    db.tables.comm_hierarchy.push({ ...db.source, scheme_id: 'events-scheme', effective_to: '2026-08-31' })
    expect(await addMemberWithCurrentTitle(sourceForm({ source_scheme_id: 'events-scheme' }))).toMatchObject({ ok: false, note: expect.stringContaining('no longer a member') })
    expect(db.writes).toEqual([])
  })

  it('does not substitute a roster title for a source membership with no title', async () => {
    db.tables.comm_hierarchy[0].title_id = null
    expect(await addMemberWithCurrentTitle(sourceForm())).toMatchObject({ ok: false, note: expect.stringContaining('no current title') })
    expect(db.writes).toEqual([])
  })

  it('refuses a home card without either a membership or a roster title', async () => {
    db.tables.comm_hierarchy = []
    db.tables.hr_staff_costs[0].title_id = null
    expect(await addMemberWithCurrentTitle(sourceForm())).toMatchObject({ ok: false, note: expect.stringContaining('no current title') })
    expect(db.writes).toEqual([])
  })

  it.each([
    ['retired', { is_active: false }],
    ['director', { is_department_head: true }],
    ['missing', { id: 'deleted-title' }],
  ])('refuses a %s source title even if the destination ladder still has a rung', async (_label, patch) => {
    Object.assign(db.tables.titles[0], patch)
    expect(await addMemberWithCurrentTitle(sourceForm())).toMatchObject({ ok: false, note: expect.stringContaining('not an active member title') })
    expect(db.writes).toEqual([])
  })

  it('refuses an incompatible destination without substituting one of its other titles', async () => {
    db.tables.comm_ranks = db.tables.comm_ranks.filter(row => row.id !== 'company-title-floor')
    expect(await addMemberWithCurrentTitle(sourceForm({ title_id: 'ir-title' }))).toMatchObject({ ok: false, note: expect.stringContaining('no rung') })
    expect(db.writes).toEqual([])
    expect(db.tables.comm_hierarchy).toEqual([db.source])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['inactive staff', { status: 'inactive' }, 'no longer active'],
    ['moved staff', { department_id: 'hr' }, 'current department'],
    ['department head', { titles: { is_department_head: true } }, 'directors'],
  ])('rechecks %s against the current roster', async (_label, patch, message) => {
    Object.assign(db.tables.hr_staff_costs[0], patch)
    expect(await addMemberWithCurrentTitle(sourceForm())).toMatchObject({ ok: false, note: expect.stringContaining(message) })
    expect(db.writes).toEqual([])
  })

  it('retains duplicate protection for quick-add', async () => {
    await addMemberWithCurrentTitle(sourceForm())
    expect(await addMemberWithCurrentTitle(sourceForm())).toMatchObject({ ok: false, note: expect.stringContaining('already a member') })
    expect(db.writes).toHaveLength(1)
  })

  it('checks permission before resolving the source title', async () => {
    const denied = new Error('Permission denied')
    mocks.requirePermission.mockRejectedValueOnce(denied)
    await expect(addMemberWithCurrentTitle(sourceForm())).rejects.toBe(denied)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })
})
