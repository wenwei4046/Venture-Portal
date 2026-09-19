import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { SubDepartment } from './sub-departments'

/** Serializable choices shared by the chart and Team tab's membership menu. */
export interface MembershipDestination {
  subDepartmentId: string
  name: string
  slug: string
  departmentId: string
  departmentName: string
  schemeId: string
  isHome: boolean
  titles: Array<{ id: string; name: string }>
  memberStaffIds: string[]
  /** Active non-directors in this parent department; checked again when saving. */
  eligibleStaffIds: string[]
  unavailableReason: string | null
}

interface Title {
  id: string
  name: string
  is_active: boolean
  is_department_head: boolean
}

interface EligibleStaff {
  id: string
  department_id: string
  titles: { is_department_head: boolean } | Array<{ is_department_head: boolean }> | null
}

interface MembershipRung {
  scheme_id: string
  title_id: string
  titles: Title | Title[] | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** PostgREST caps one response at 1,000 rows; every caller orders by a unique key. */
async function allRows<T>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
}): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw new Error('Could not load the departments available for membership.')
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

/**
 * Read all destinations visible to the signed-in account, using its RLS client.
 * A person may retain multiple sub-department memberships inside their parent
 * department. The home chart remains the roster and cannot be joined manually.
 */
export async function loadMembershipDestinations(
  subDepartments: SubDepartment[],
): Promise<MembershipDestination[]> {
  const active = subDepartments.filter(
    (sub): sub is SubDepartment & { schemeId: string } => sub.schemeId !== null,
  )
  if (active.length === 0) return []

  const supabase = (await createClient()) as unknown as SupabaseClient
  const departmentIds = [...new Set(active.map(sub => sub.departmentId))]
  const schemeIds = [...new Set(active.map(sub => sub.schemeId))]
  const [departments, staff, ladder, memberships] = await Promise.all([
    allRows<{ id: string; name: string }>(supabase.from('departments').select('id, name')
      .in('id', departmentIds).eq('payroll_source', 'commission').order('id')),
    allRows<EligibleStaff>(supabase.from('hr_staff_costs').select('id, department_id, titles (is_department_head)')
      .in('department_id', departmentIds).eq('status', 'active').order('id')),
    allRows<MembershipRung>(supabase.from('comm_ranks').select('scheme_id, title_id, titles (id, name, is_active, is_department_head)')
      .in('scheme_id', schemeIds).order('sort_order').order('id')),
    allRows<{ scheme_id: string; staff_id: string }>(supabase.from('comm_hierarchy').select('scheme_id, staff_id')
      .in('scheme_id', schemeIds).is('effective_to', null).order('id')),
  ])

  const departmentNames = new Map(departments.map(department => [department.id, department.name]))
  const eligibleByDepartment = new Map<string, string[]>()
  for (const person of staff) {
    if (one(person.titles)?.is_department_head) continue
    const eligible = eligibleByDepartment.get(person.department_id) ?? []
    eligible.push(person.id)
    eligibleByDepartment.set(person.department_id, eligible)
  }

  const titlesByScheme = new Map<string, Map<string, { id: string; name: string }>>()
  for (const rung of ladder) {
    const title = one(rung.titles)
    if (!title?.is_active || title.is_department_head) continue
    const titles = titlesByScheme.get(rung.scheme_id) ?? new Map()
    titles.set(title.id, { id: title.id, name: title.name })
    titlesByScheme.set(rung.scheme_id, titles)
  }

  const membersByScheme = new Map<string, Set<string>>()
  for (const membership of memberships) {
    const members = membersByScheme.get(membership.scheme_id) ?? new Set()
    members.add(membership.staff_id)
    membersByScheme.set(membership.scheme_id, members)
  }

  return active.filter(sub => departmentNames.has(sub.departmentId)).map(sub => {
    const titles = [...(titlesByScheme.get(sub.schemeId)?.values() ?? [])]
    const eligibleStaffIds = eligibleByDepartment.get(sub.departmentId) ?? []
    // The home chart includes roster members even before a matching rung exists.
    const memberStaffIds = sub.isHome
      ? [...new Set([...eligibleStaffIds, ...(membersByScheme.get(sub.schemeId) ?? [])])]
      : [...(membersByScheme.get(sub.schemeId) ?? [])]
    return {
      subDepartmentId: sub.id,
      name: sub.name,
      slug: sub.slug,
      departmentId: sub.departmentId,
      departmentName: departmentNames.get(sub.departmentId)!,
      schemeId: sub.schemeId,
      isHome: sub.isHome,
      titles,
      memberStaffIds,
      eligibleStaffIds,
      unavailableReason: sub.isHome
        ? 'Membership here follows the department roster automatically.'
        : titles.length === 0 ? 'Set up a title on this sub-department’s ladder first.' : null,
    }
  }).sort((a, b) => a.departmentName.localeCompare(b.departmentName) || a.name.localeCompare(b.name))
}
