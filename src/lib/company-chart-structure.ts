import { buildSpaceTeams } from './hierarchy-space-layout'
import type { ChartPerson } from '@/app/(portal)/team/hierarchy/_components/TeamOrgChart'

export const COMPANY_CARD_HEIGHT = 148
export const companyStaffId = (person: ChartPerson) => person.staffId ?? person.id
export const companyZoneId = (person: ChartPerson) => JSON.stringify([person.department, person.subDepartment ?? null])
export const companyZoneName = (person: ChartPerson) => [person.department ?? 'No department', person.subDepartment].filter(Boolean).join(' · ')

/** Identity belongs to staff; placement, title and reporting belong to a role. */
export function companyChartStructure(people: ChartPerson[]) {
  const byId = new Map(people.map(person => [person.id, person]))
  const leaderIds = new Set(people.filter(person => person.isDepartmentHead).map(person => person.id))
  for (const person of people) {
    for (const id of person.leadIds) if (byId.has(id)) leaderIds.add(id)
    const parent = person.reportsTo ? byId.get(person.reportsTo) : null
    if (parent && companyZoneId(parent) !== companyZoneId(person)) leaderIds.add(parent.id)
  }
  // Keep actual ancestors above leadership as well, without inventing a CEO.
  for (const id of leaderIds) {
    const parent = byId.get(id)?.reportsTo
    if (parent && byId.has(parent)) leaderIds.add(parent)
  }
  const departmentPeople = people.filter(person => !leaderIds.has(person.id))
  const departments = [...new Map(departmentPeople.map(person => [companyZoneId(person), {
    id: companyZoneId(person), name: companyZoneName(person),
  }])).values()].sort((a, b) => a.name.localeCompare(b.name))
  const teams = buildSpaceTeams(departmentPeople.map(person => ({
    id: person.id, name: person.name, departmentId: companyZoneId(person), parentId: person.reportsTo,
  })))
  const teamByPerson = new Map(teams.flatMap(team => team.memberIds.map(id => [id, team] as const)))
  const rolesByStaff = new Map<string, ChartPerson[]>()
  for (const person of people) {
    const id = companyStaffId(person)
    rolesByStaff.set(id, [...(rolesByStaff.get(id) ?? []), person])
  }
  return { leaderIds, departments, teams, teamByPerson, rolesByStaff }
}
