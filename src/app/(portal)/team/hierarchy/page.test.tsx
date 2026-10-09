import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeamHierarchyPage from './page'

vi.mock('server-only', () => ({}))

type Result = { data: unknown[] | null; error: { message: string } | null }
const adapters = vi.hoisted(() => ({
  results: new Map<string, Result>(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  permission: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requirePermission: adapters.permission }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: (fn: string, args?: unknown) => adapters.rpc(fn, args),
    from: (table: string) => {
      let from: number | undefined, to: number | undefined
      const query = {
        select: (...args: unknown[]) => record('select', args),
        eq: (...args: unknown[]) => record('eq', args),
        is: (...args: unknown[]) => record('is', args),
        order: (...args: unknown[]) => record('order', args),
        range: (start: number, end: number) => { from = start; to = end; return record('range', [start, end]) },
        then: (resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) => {
          const response = adapters.results.get(table) ?? { data: [], error: null }
          return Promise.resolve({ ...response, data: from === undefined ? response.data : response.data?.slice(from, to! + 1) ?? null }).then(resolve, reject)
        },
      }
      function record(method: string, args: unknown[]) {
        adapters.calls.push({ table, method, args })
        return query
      }
      return query
    },
  }),
}))
vi.mock('./_components/HierarchyView', () => ({ default: () => null }))

function data(table: string, rows: unknown[]) {
  adapters.results.set(table, { data: rows, error: null })
}

/** HR: the roster's own key, every Team action. */
const HR = { permissions: ['team'], actions: { 'team.view': 'all', 'team.create': 'all', 'team.edit': 'all', 'team.manage': 'all' } }
/** A Department head: Team · View at Dept, no Salary tick — the directory (PR4b). */
const HEAD = { permissions: ['dept_pool', 'team_directory'], actions: { 'team.view': 'dept' } }

beforeEach(() => {
  vi.clearAllMocks()
  adapters.results.clear()
  adapters.calls = []
  adapters.permission.mockResolvedValue(HR)
  const staff = (id: string, titleId: string, titleName: string, head = false) => ({
    id, employee_name: id, employee_code: id.toUpperCase(), reports_to: null,
    designation: null, title_id: titleId, department_id: 'revenue',
    titles: { name: titleName, level_id: head ? null : 'manager', is_department_head: head },
    departments: { name: 'Revenue', payroll_source: 'commission' },
  })
  data('hr_staff_costs', [staff('rachael', 'leader', 'Team Leader'), staff('chea', 'leader', 'Team Leader'), staff('peter', 'director', 'Revenue Director', true)])
  data('title_levels', [{ id: 'manager', rank: 4, name: 'Manager' }, { id: 'head', rank: 6, name: 'Head' }, { id: 'executive', rank: 2, name: 'Executive' }])
  data('titles', [{ id: 'leader', name: 'Team Leader', department_id: 'revenue', level_id: 'manager', is_active: true, departments: { name: 'Revenue' } }])
  data('comm_sub_departments', [
    { id: 'fair', name: 'Fair', department_id: 'revenue', created_at: '2026-01-01' },
    { id: 'ir', name: 'IR', department_id: 'revenue', created_at: '2026-02-01' },
  ])
  data('comm_schemes', [{ id: 'fair-scheme', sub_department_id: 'fair' }, { id: 'ir-scheme', sub_department_id: 'ir' }])
  data('comm_ranks', [
    { scheme_id: 'fair-scheme', title_id: 'leader', can_recruit: true },
    { scheme_id: 'ir-scheme', title_id: 'ir-head', can_recruit: true },
    { scheme_id: 'ir-scheme', title_id: 'specialist', can_recruit: false },
  ])
  data('comm_sub_department_directors', [{ staff_id: 'peter', sub_department_id: 'fair' }, { staff_id: 'peter', sub_department_id: 'ir' }])
  data('comm_hierarchy', [
    { id: 'ir-head-position', staff_id: 'rachael', scheme_id: 'ir-scheme', upline_staff_id: null, title_id: 'ir-head', titles: [{ name: 'Head of IR', level_id: 'head' }] },
    { id: 'ir-member-position', staff_id: 'chea', scheme_id: 'ir-scheme', upline_staff_id: 'rachael', title_id: 'specialist', titles: { name: 'Relationship Specialist', level_id: 'executive' } },
  ])
})

describe('company hierarchy role loading', () => {
  it('passes separate role cards to the chart while keeping Table and Levels on the active roster', async () => {
    const view = await TeamHierarchyPage()
    expect(adapters.permission).toHaveBeenCalledWith('team', 'team_directory')
    expect(view.props).toMatchObject({ canEdit: true, chartOnly: false })
    expect(adapters.rpc).not.toHaveBeenCalled()
    expect(view.props.people).toHaveLength(3)
    expect(view.props.chartPeople).toHaveLength(5)
    expect(view.props.titles[0].people).toBe(2)
    expect(view.props.people.find((person: { id: string }) => person.id === 'rachael')).toMatchObject({ title: 'Team Leader' })
    expect(view.props.chartPeople.find((person: { id: string }) => person.id === 'ir-scheme:rachael')).toMatchObject({
      staffId: 'rachael', title: 'Head of IR', levelRank: 6, secondaryRole: true, membershipHref: '/revenue/ir/hierarchy',
    })
    expect(view.props.chartPeople.find((person: { id: string }) => person.id === 'ir-scheme:chea')).toMatchObject({ reportsTo: 'ir-scheme:rachael' })
    expect(adapters.calls).toEqual(expect.arrayContaining([
      { table: 'hr_staff_costs', method: 'eq', args: ['status', 'active'] },
      { table: 'comm_hierarchy', method: 'is', args: ['effective_to', null] },
      { table: 'comm_hierarchy', method: 'eq', args: ['comm_schemes.is_active', true] },
      { table: 'comm_hierarchy', method: 'is', args: ['comm_schemes.effective_to', null] },
    ]))
  })

  it.each(['comm_hierarchy', 'comm_sub_departments', 'comm_schemes', 'comm_sub_department_directors'])('rejects a failed %s read instead of silently dropping roles', async table => {
    adapters.results.set(table, { data: null, error: { message: 'Read failed' } })
    await expect(TeamHierarchyPage()).rejects.toThrow(/Could not load .*Read failed/)
  })

  it('reads memberships beyond the first database page while ignoring people absent from the active roster', async () => {
    const extras = Array.from({ length: 1000 }, (_, index) => ({
      id: `former-${index}`, staff_id: `inactive-${index}`, scheme_id: 'ir-scheme',
      upline_staff_id: null, title_id: null, titles: null,
    }))
    data('comm_hierarchy', [...extras, ...adapters.results.get('comm_hierarchy')!.data!])
    const view = await TeamHierarchyPage()
    expect(view.props.chartPeople).toHaveLength(5)
    expect(view.props.chartPeople.some((person: { id: string }) => person.id === 'ir-scheme:rachael')).toBe(true)
    expect(adapters.calls).toContainEqual({ table: 'comm_hierarchy', method: 'range', args: [1000, 1999] })
  })

  // PR4b (2026-10-10): Team · View without the Salary tick — the whole
  // company's chart from team_org_chart(), names and titles, read only.
  it('draws a directory reader the chart alone, from team_org_chart, without the staff table or Revenue\'s rows', async () => {
    adapters.permission.mockResolvedValue(HEAD)
    const person = (id: string, title: string, head = false, reportsTo: string | null = null) => ({
      id, employee_name: id, employee_code: id.toUpperCase(), reports_to: reportsTo, designation: null, title_id: title,
      department_id: 'revenue', titles: { name: title, level_id: head ? null : 'manager', is_department_head: head },
      departments: { name: 'Revenue', payroll_source: 'commission' },
    })
    adapters.rpc.mockImplementation(async (fn: string) => fn === 'team_org_chart'
      ? { data: {
          people: [person('peter', 'Revenue Director', true), person('rachael', 'Team Leader'), person('chea', 'Team Leader', false, 'rachael')],
          sub_departments: [{ id: 'fair', name: 'Fair', department_id: 'revenue', created_at: '2026-01-01' }],
          directors: [{ staff_id: 'peter', sub_department_id: 'fair' }],
        }, error: null }
      : { data: null, error: { message: `unexpected rpc ${fn}` } })
    const view = await TeamHierarchyPage()
    expect(view.props).toMatchObject({ canEdit: false, chartOnly: true })
    expect(view.props.chartPeople.map((p: { id: string }) => p.id).sort()).toEqual(['chea', 'peter', 'rachael'])
    // The top of the tree hangs from the sub-department's director, as on HR's chart.
    expect(view.props.chartPeople.find((p: { id: string }) => p.id === 'rachael')).toMatchObject({ leadIds: ['peter'] })
    expect(adapters.calls.some(c => c.table === 'hr_staff_costs' || c.table.startsWith('comm_'))).toBe(false)
  })
})
