import { describe, expect, it } from 'vitest'
import type { ChartPerson } from '@/app/(portal)/team/hierarchy/_components/TeamOrgChart'
import { companyChartStructure, companyStaffId, companyZoneId, companyZoneName } from './company-chart-structure'

function person(id: string, extra: Partial<ChartPerson> = {}): ChartPerson {
  return {
    id, name: id, code: null, title: 'Executive', department: 'Finance',
    commissionDept: false, canRecruit: null, isDepartmentHead: false, leadIds: [],
    levelRank: 2, levelName: 'Executive', reportsTo: null, ...extra,
  }
}

/** Every real role is either on the management rail or in exactly one team. */
function expectEveryRoleOnce(people: ChartPerson[], structure: ReturnType<typeof companyChartStructure>) {
  const placed = [...structure.leaderIds, ...structure.teams.flatMap(team => team.memberIds)]
  expect(placed.sort()).toEqual(people.map(role => role.id).sort())
  expect(new Set(placed).size).toBe(people.length)
  expect([...structure.teamByPerson.keys()].sort())
    .toEqual(people.filter(role => !structure.leaderIds.has(role.id)).map(role => role.id).sort())
}

describe('companyChartStructure', () => {
  it('keeps real heads, cross-department supervisors and their full ancestor chains above local teams', () => {
    const people = [
      person('finance-head', { isDepartmentHead: true, reportsTo: 'director' }),
      person('director', { department: 'Director', reportsTo: 'principal' }),
      person('principal', { department: 'Director' }),
      person('accountant', { reportsTo: 'finance-head' }),
      person('shared-manager', { department: 'HR', reportsTo: 'principal' }),
      person('finance-assistant', { reportsTo: 'shared-manager' }),
      person('local-manager'),
      person('local-assistant', { reportsTo: 'local-manager' }),
    ]
    const structure = companyChartStructure(people)

    expect([...structure.leaderIds].sort()).toEqual(['director', 'finance-head', 'principal', 'shared-manager'])
    expect(structure.teamByPerson.get('local-assistant')?.leaderId).toBe('local-manager')
    expect(structure.teamByPerson.get('accountant')?.leaderId).toBe('accountant')
    expect(structure.teamByPerson.get('finance-assistant')?.leaderId).toBe('finance-assistant')
    expectEveryRoleOnce(people, structure)
  })

  it('recognizes real assigned directors without creating cards for absent directors or managers', () => {
    const people = [
      person('assigned-director', { department: 'Revenue', isDepartmentHead: true }),
      person('team-leader', { department: 'Revenue', subDepartment: 'Fair', leadIds: ['assigned-director', 'missing-director'] }),
      person('orphan', { reportsTo: 'missing-manager' }),
      person('independent'),
    ]
    const structure = companyChartStructure(people)

    expect([...structure.leaderIds]).toEqual(['assigned-director'])
    expect(structure.teamByPerson.get('team-leader')?.leaderId).toBe('team-leader')
    expect(structure.teamByPerson.get('orphan')?.leaderId).toBe('orphan')
    expect(structure.teamByPerson.get('independent')?.leaderId).toBe('independent')
    expect(structure.rolesByStaff.has('missing-director')).toBe(false)
    expect(structure.rolesByStaff.has('missing-manager')).toBe(false)
    expectEveryRoleOnce(people, structure)
  })

  it('retains independent departmental trees without inventing a shared supervisor', () => {
    const people = [
      person('finance-leader'),
      person('finance-report', { reportsTo: 'finance-leader' }),
      person('hr-leader', { department: 'HR' }),
      person('hr-report', { department: 'HR', reportsTo: 'hr-leader' }),
      person('unassigned', { department: null }),
    ]
    const structure = companyChartStructure(people)

    expect(structure.leaderIds.size).toBe(0)
    expect(structure.teams.map(team => team.leaderId).sort()).toEqual(['finance-leader', 'hr-leader', 'unassigned'])
    expect(structure.departments.find(department => department.id === companyZoneId(people[4]))?.name).toBe('No department')
    expectEveryRoleOnce(people, structure)
  })

  it('terminates on leadership and local reporting cycles while retaining every role exactly once', () => {
    const people = [
      person('head', { isDepartmentHead: true, reportsTo: 'head-ancestor' }),
      person('head-ancestor', { reportsTo: 'head' }),
      person('cycle-a', { reportsTo: 'cycle-b' }),
      person('cycle-b', { reportsTo: 'cycle-a' }),
      person('cycle-report', { reportsTo: 'cycle-b' }),
      person('self', { reportsTo: 'self' }),
    ]
    const before = structuredClone(people)
    for (const role of people) { Object.freeze(role.leadIds); Object.freeze(role) }
    Object.freeze(people)
    const structure = companyChartStructure(people)

    expect([...structure.leaderIds].sort()).toEqual(['head', 'head-ancestor'])
    expect(structure.teamByPerson.get('cycle-a')).toBe(structure.teamByPerson.get('cycle-b'))
    expect(structure.teamByPerson.get('cycle-report')).toBe(structure.teamByPerson.get('cycle-b'))
    expect(structure.teamByPerson.get('self')?.memberIds).toEqual(['self'])
    expectEveryRoleOnce(people, structure)
    expect(people).toEqual(before)
  })

  it('uses unambiguous department/sub-department pairs even when names contain delimiters', () => {
    const people = [
      person('first', { department: 'Revenue::Fair', subDepartment: 'IR' }),
      person('second', { department: 'Revenue', subDepartment: 'Fair::IR' }),
      person('third', { department: 'Revenue', subDepartment: 'Fair' }),
      person('fourth', { department: 'Revenue' }),
    ]
    const structure = companyChartStructure(people)

    expect(new Set(people.map(companyZoneId)).size).toBe(4)
    expect(structure.departments).toHaveLength(4)
    expect(JSON.parse(companyZoneId(people[0]))).toEqual(['Revenue::Fair', 'IR'])
    expect(JSON.parse(companyZoneId(people[1]))).toEqual(['Revenue', 'Fair::IR'])
    expect(JSON.parse(companyZoneId(people[3]))).toEqual(['Revenue', null])
    expect(companyZoneName(people[2])).toBe('Revenue · Fair')
    for (const role of people) expect(structure.teamByPerson.get(role.id)?.departmentId).toBe(companyZoneId(role))
    expectEveryRoleOnce(people, structure)
  })

  it('keeps opposite reporting lines in different roles separate while grouping appointments by staff identity', () => {
    const people = [
      person('alice', { department: 'Revenue', subDepartment: 'Fair', reportsTo: 'bob', title: 'Specialist' }),
      person('bob', { department: 'Revenue', subDepartment: 'Fair', title: 'Team Leader' }),
      person('ir:alice', { staffId: 'alice', department: 'Revenue', subDepartment: 'IR', secondaryRole: true, title: 'Head of IR' }),
      person('ir:bob', { staffId: 'bob', department: 'Revenue', subDepartment: 'IR', secondaryRole: true, reportsTo: 'ir:alice' }),
      person('other:alice', { staffId: 'alice', department: 'Revenue', subDepartment: 'Other', secondaryRole: true }),
    ]
    const structure = companyChartStructure(people)

    expect(structure.leaderIds.size).toBe(0)
    expect(structure.rolesByStaff.size).toBe(2)
    expect(structure.rolesByStaff.get('alice')?.map(role => role.id)).toEqual(['alice', 'ir:alice', 'other:alice'])
    expect(structure.rolesByStaff.get('bob')?.map(role => role.id)).toEqual(['bob', 'ir:bob'])
    expect(structure.rolesByStaff.get('alice')?.map(role => role.title)).toEqual(['Specialist', 'Head of IR', 'Executive'])
    expect(structure.teamByPerson.get('alice')?.leaderId).toBe('bob')
    expect(structure.teamByPerson.get('ir:bob')?.leaderId).toBe('ir:alice')
    expect(structure.teamByPerson.get('alice')).not.toBe(structure.teamByPerson.get('ir:alice'))
    expect(companyStaffId(people[0])).toBe('alice')
    expect(companyStaffId(people[2])).toBe('alice')
    expectEveryRoleOnce(people, structure)
  })

  it('returns no synthetic person, team or department for an empty roster', () => {
    const structure = companyChartStructure([])
    expect(structure.leaderIds.size).toBe(0)
    expect(structure.departments).toEqual([])
    expect(structure.teams).toEqual([])
    expect(structure.teamByPerson.size).toBe(0)
    expect(structure.rolesByStaff.size).toBe(0)
  })
})
