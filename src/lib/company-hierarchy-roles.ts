import type { ChartPerson } from '@/app/(portal)/team/hierarchy/_components/TeamOrgChart'
import type { Rung } from './ladder'
import { revenuePath } from './revenue'

export interface CompanyChartSubDepartment {
  id: string
  name: string
  slug: string
  departmentId: string
  schemeId: string | null
  isHome: boolean
}

export interface CompanyChartMembership {
  staffId: string
  schemeId: string
  uplineStaffId: string | null
  titleId: string | null
  title: { name: string; levelId: string | null } | null
}

export interface CompanyChartRank {
  schemeId: string
  titleId: string | null
  canRecruit: boolean
}

interface RoleInput {
  /** Active roster only, one card per actual person. Kept unchanged for Table/Levels. */
  people: readonly ChartPerson[]
  departmentIds: ReadonlyMap<string, string | null>
  subDepartments: readonly CompanyChartSubDepartment[]
  /** Open memberships from active schemes, as on Revenue's loadTeam chart. */
  memberships: readonly CompanyChartMembership[]
  ranks: readonly CompanyChartRank[]
  levels: readonly Rung[]
  directors: readonly { staffId: string; subDepartmentId: string }[]
}

/**
 * Home roles keep global staff IDs and reporting lines. Additional roles have
 * their own title and scheme-scoped IDs, and can only be edited on Revenue.
 */
export function companyHierarchyRoles({ people, departmentIds, subDepartments, memberships, ranks, levels, directors }: RoleInput): ChartPerson[] {
  const byStaff = new Map(people.map(person => [person.id, person]))
  const homeByDepartment = new Map(subDepartments.filter(sub => sub.isHome).map(sub => [sub.departmentId, sub]))
  const byMembership = new Map(memberships.map(membership => [`${membership.schemeId}:${membership.staffId}`, membership]))
  const levelById = new Map(levels.map(level => [level.id, level]))
  const recruit = new Map<string, boolean>()
  for (const rank of ranks) {
    if (!rank.titleId) continue
    const key = `${rank.schemeId}:${rank.titleId}`
    recruit.set(key, (recruit.get(key) ?? false) || rank.canRecruit)
  }
  const directorsOf = (sub: CompanyChartSubDepartment, staffId: string): string[] => directors
    .filter(assignment => assignment.subDepartmentId === sub.id && assignment.staffId !== staffId)
    .map(assignment => byStaff.get(assignment.staffId))
    .filter((head): head is ChartPerson => !!head && head.isDepartmentHead && departmentIds.get(head.id) === sub.departmentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(head => head.id)
  const membershipRole = (membership: CompanyChartMembership) => {
    const level = membership.title?.levelId ? levelById.get(membership.title.levelId) : undefined
    return {
      // A missing local title stays missing; another sub-department's or the
      // roster's title must never fill in a secondary role.
      title: membership.title?.name ?? null,
      levelRank: level?.rank ?? null,
      levelName: level?.name ?? null,
      canRecruit: membership.titleId ? recruit.get(`${membership.schemeId}:${membership.titleId}`) ?? false : false,
    }
  }

  const primary = people.map(person => {
    const departmentId = departmentIds.get(person.id)
    const home = departmentId ? homeByDepartment.get(departmentId) : undefined
    if (!person.commissionDept || person.isDepartmentHead || !home) return { ...person, staffId: person.id }
    return {
      ...person,
      // The home membership is a synchronized projection. Its copy may lag;
      // the active roster remains authoritative for this writable role.
      staffId: person.id,
      subDepartment: home.name,
      ...(home.schemeId ? { schemeId: home.schemeId } : {}),
      membershipHref: revenuePath(home.slug, 'hierarchy'),
      leadIds: directorsOf(home, person.id),
    }
  })

  const secondary = subDepartments.filter(sub => !sub.isHome && sub.schemeId).flatMap(sub => people.flatMap(person => {
    if (!person.commissionDept || person.isDepartmentHead || departmentIds.get(person.id) !== sub.departmentId) return []
    const membership = byMembership.get(`${sub.schemeId}:${person.id}`)
    if (!membership) return []
    return [{
      ...person,
      ...membershipRole(membership),
      id: `${sub.schemeId}:${person.id}`,
      staffId: person.id,
      subDepartment: sub.name,
      schemeId: sub.schemeId!,
      membershipHref: revenuePath(sub.slug, 'hierarchy'),
      secondaryRole: true,
      leadIds: directorsOf(sub, person.id),
      // Preserve a dangling scoped ID if their upline is inactive or absent;
      // never attach this role to that person's unrelated home card.
      reportsTo: membership.uplineStaffId ? `${sub.schemeId}:${membership.uplineStaffId}` : null,
    }]
  }))
  return [...primary, ...secondary]
}
