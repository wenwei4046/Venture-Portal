import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEmployeeDepartmentDestinations } from './employee-destinations'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), listSubDepartments: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('./sub-departments', () => ({ listSubDepartments: mocks.listSubDepartments }))

type Row = Record<string, unknown>
function client(data: Record<string, Row[]>, failAfterFirstPage = false) {
  const queries = new Map<string, { order: ReturnType<typeof vi.fn>; range: ReturnType<typeof vi.fn> }>()
  mocks.createClient.mockResolvedValue({ from: vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = []
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query }),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(async (start: number, end: number) => failAfterFirstPage && start > 0
        ? { data: null, error: { message: 'Unavailable' } }
        : { data: data[table].filter(row => filters.every(([key, value]) => row[key] === value)).slice(start, end + 1), error: null }),
    }
    queries.set(table, query)
    return query
  }) })
  return queries
}

const title = (id: string, department: string | null, extra: Row = {}): Row => ({
  id, name: id, department_id: department, is_active: true, is_department_head: false, ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listSubDepartments.mockResolvedValue([])
})

describe('employee department destinations', () => {
  it('offers active non-head titles only in their own department, plus global titles', async () => {
    client({
      departments: [{ id: 'hr', name: 'HR' }, { id: 'revenue', name: 'Revenue' }],
      titles: [title('General', null), title('HR Officer', 'hr'), title('Specialist', 'revenue'),
        title('Old role', 'hr', { is_active: false }), title('Head', 'hr', { is_department_head: true }),
        title('Hidden department role', 'not-visible')],
    })
    expect(await loadEmployeeDepartmentDestinations()).toEqual([
      { id: 'hr', name: 'HR', titles: [{ id: 'General', name: 'General' }, { id: 'HR Officer', name: 'HR Officer' }] },
      { id: 'revenue', name: 'Revenue', titles: [{ id: 'General', name: 'General' }, { id: 'Specialist', name: 'Specialist' }] },
    ])
  })

  it('includes departments and titles after the 1,000-row response cap', async () => {
    const queries = client({
      departments: Array.from({ length: 1001 }, (_, index) => ({ id: `department-${index}`, name: `Department ${index}` })),
      titles: Array.from({ length: 1001 }, (_, index) => title(`Title ${index}`, `department-${index}`)),
    })
    const destinations = await loadEmployeeDepartmentDestinations()
    expect(destinations).toHaveLength(1001)
    expect(destinations[1000]).toEqual({ id: 'department-1000', name: 'Department 1000', titles: [{ id: 'Title 1000', name: 'Title 1000' }] })
    for (const query of queries.values()) {
      expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]])
      expect(query.order).toHaveBeenLastCalledWith('id')
    }
  })

  it('requires a matching home-scheme rung for commission destinations', async () => {
    mocks.listSubDepartments.mockResolvedValue([
      { departmentId: 'revenue', schemeId: 'home-scheme', isHome: true },
      { departmentId: 'revenue', schemeId: 'other-scheme', isHome: false },
      { departmentId: 'not-ready', schemeId: null, isHome: true },
    ])
    client({
      departments: [{ id: 'revenue', name: 'Revenue', payroll_source: 'commission' },
        { id: 'not-ready', name: 'Not ready', payroll_source: 'commission' }],
      titles: [title('General', null), title('Specialist', 'revenue'), title('No rung', 'revenue')],
      comm_ranks: [{ scheme_id: 'home-scheme', title_id: 'Specialist' },
        { scheme_id: 'other-scheme', title_id: 'General' }],
    })
    expect(await loadEmployeeDepartmentDestinations()).toEqual([
      { id: 'revenue', name: 'Revenue', titles: [{ id: 'Specialist', name: 'Specialist' }] },
      { id: 'not-ready', name: 'Not ready', titles: [] },
    ])
  })

  it('does not return incomplete transfer choices when a later page fails', async () => {
    client({
      departments: [{ id: 'hr', name: 'HR' }],
      titles: Array.from({ length: 1001 }, (_, index) => title(`Role ${index}`, 'hr')),
    }, true)
    await expect(loadEmployeeDepartmentDestinations()).rejects.toThrow('Could not load departments and titles for employee transfers.')
  })
})
