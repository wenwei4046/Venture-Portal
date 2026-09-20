import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMembershipDestinations } from './membership-destinations'
import type { SubDepartment } from './sub-departments'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

const subDepartments: SubDepartment[] = [
  { id: 'fair', name: 'Fair', slug: 'fair', departmentId: 'revenue', schemeId: 'fair-scheme', createdAt: '2026-08-31T00:00:00Z', isHome: true },
  { id: 'ir', name: 'IR', slug: 'ir', departmentId: 'revenue', schemeId: 'ir-scheme', createdAt: '2026-09-10T00:00:00Z', isHome: false },
]

function client(failingPage = false) {
  const data: Record<string, unknown[]> = {
    departments: [{ id: 'revenue', name: 'Revenue' }],
    hr_staff_costs: Array.from({ length: 1001 }, (_, index) => ({
      id: `person-${index}`, department_id: 'revenue', home_sub_department_id: null,
      titles: { is_department_head: false },
    })),
    comm_ranks: [{ scheme_id: 'ir-scheme', title_id: 'specialist', titles: {
      id: 'specialist', name: 'Revenue Specialist', is_active: true, is_department_head: false,
    } }],
    comm_hierarchy: Array.from({ length: 1001 }, (_, index) => ({
      scheme_id: 'ir-scheme', staff_id: `person-${index}`,
    })),
  }
  const queries = new Map<string, { order: ReturnType<typeof vi.fn>; range: ReturnType<typeof vi.fn> }>()
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(async (start: number, end: number) => failingPage && table === 'comm_hierarchy' && start === 1000
        ? { data: null, error: { message: 'Unavailable' } }
        : { data: data[table].slice(start, end + 1), error: null }),
    }
    queries.set(table, query)
    return query
  })
  mocks.createClient.mockResolvedValue({ from })
  return queries
}

beforeEach(() => vi.clearAllMocks())

describe('membership destination pagination', () => {
  it('keeps staff eligibility and existing memberships beyond the first 1,000 rows', async () => {
    const queries = client()
    const destinations = await loadMembershipDestinations(subDepartments)
    const ir = destinations.find(destination => destination.subDepartmentId === 'ir')!
    expect(ir.eligibleStaffIds).toHaveLength(1001)
    expect(ir.eligibleStaffIds).toContain('person-1000')
    expect(ir.memberStaffIds).toHaveLength(1001)
    expect(ir.memberStaffIds).toContain('person-1000')
    expect(ir.titles).toEqual([{ id: 'specialist', name: 'Revenue Specialist' }])
    // Nobody chose a base, so all 1,001 fall back to the department's oldest.
    const fair = destinations.find(destination => destination.subDepartmentId === 'fair')!
    expect(fair.homeStaffIds).toHaveLength(1001)
    expect(ir.homeStaffIds).toEqual([])
    for (const table of ['hr_staff_costs', 'comm_hierarchy']) {
      expect(queries.get(table)?.range.mock.calls).toEqual([[0, 999], [1000, 1999]])
    }
    for (const query of queries.values()) expect(query.order).toHaveBeenLastCalledWith('id')
  })

  it('rejects a failed later page instead of returning incomplete membership choices', async () => {
    client(true)
    await expect(loadMembershipDestinations(subDepartments)).rejects.toThrow('Could not load the departments available for membership.')
  })
})
