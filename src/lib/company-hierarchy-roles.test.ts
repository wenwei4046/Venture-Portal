import { describe, expect, it } from 'vitest'
import type { ChartPerson } from '@/app/(portal)/team/hierarchy/_components/TeamOrgChart'
import { companyHierarchyRoles, type CompanyChartMembership, type CompanyChartSubDepartment } from './company-hierarchy-roles'

function person(id: string, name: string, extra: Partial<ChartPerson> = {}): ChartPerson {
  return {
    id, name, code: id.toUpperCase(), title: 'Company role', department: 'Revenue',
    commissionDept: true, canRecruit: false, isDepartmentHead: false, leadIds: ['kris'],
    levelRank: 2, levelName: 'Executive', reportsTo: null, ...extra,
  }
}

const subDepartments: CompanyChartSubDepartment[] = [
  { id: 'fair', name: 'Fair', slug: 'fair', departmentId: 'revenue', schemeId: 'fair-scheme', isHome: true },
  { id: 'ir', name: 'IR', slug: 'ir', departmentId: 'revenue', schemeId: 'ir-scheme', isHome: false },
]

function input() {
  const people = [
    person('rachael', 'Rachael', { title: 'Team Leader', levelRank: 4, levelName: 'Manager', canRecruit: true, reportsTo: 'chea' }),
    person('chea', 'Chea Huan', { title: 'Team Leader', levelRank: 4, levelName: 'Manager', canRecruit: true }),
    person('peter', 'Peter', { title: 'Revenue Director', isDepartmentHead: true, leadIds: [], canRecruit: true }),
    person('kris', 'Kris', { title: 'Revenue Director', isDepartmentHead: true, leadIds: [], canRecruit: true }),
    person('finance', 'Finance Clerk', { department: 'Finance', commissionDept: false, leadIds: [] }),
  ]
  const memberships: CompanyChartMembership[] = [
    { staffId: 'rachael', schemeId: 'fair-scheme', uplineStaffId: null, titleId: 'team-leader', title: { name: 'Team Leader', levelId: 'manager' } },
    { staffId: 'chea', schemeId: 'fair-scheme', uplineStaffId: null, titleId: 'team-leader', title: { name: 'Team Leader', levelId: 'manager' } },
    { staffId: 'rachael', schemeId: 'ir-scheme', uplineStaffId: null, titleId: 'head-ir', title: { name: 'Head of IR', levelId: 'head' } },
    { staffId: 'chea', schemeId: 'ir-scheme', uplineStaffId: 'rachael', titleId: 'relationship-specialist', title: { name: 'Relationship Specialist', levelId: 'executive' } },
  ]
  return {
    people,
    departmentIds: new Map(people.map(p => [p.id, p.id === 'finance' ? 'finance' : 'revenue'])),
    subDepartments,
    memberships,
    ranks: [
      { schemeId: 'fair-scheme', titleId: 'team-leader', canRecruit: true },
      { schemeId: 'ir-scheme', titleId: 'head-ir', canRecruit: true },
      { schemeId: 'ir-scheme', titleId: 'relationship-specialist', canRecruit: false },
    ],
    levels: [
      { id: 'executive', name: 'Executive', rank: 2 },
      { id: 'manager', name: 'Manager', rank: 4 },
      { id: 'head', name: 'Head of Department', rank: 6 },
    ],
    directors: [
      { staffId: 'kris', subDepartmentId: 'fair' },
      { staffId: 'peter', subDepartmentId: 'fair' },
      { staffId: 'peter', subDepartmentId: 'ir' },
    ],
  }
}

describe('companyHierarchyRoles', () => {
  it('shows different Fair and IR titles for the same person and scopes each additional manager', () => {
    const source = input()
    const cards = companyHierarchyRoles(source)
    expect(cards.find(card => card.id === 'rachael')).toMatchObject({
      staffId: 'rachael', title: 'Team Leader', subDepartment: 'Fair', schemeId: 'fair-scheme',
      levelRank: 4, levelName: 'Manager', canRecruit: true, reportsTo: 'chea',
      membershipHref: '/revenue/fair/hierarchy', leadIds: ['kris', 'peter'],
    })
    expect(cards.find(card => card.id === 'ir-scheme:rachael')).toMatchObject({
      staffId: 'rachael', title: 'Head of IR', subDepartment: 'IR', schemeId: 'ir-scheme',
      levelRank: 6, canRecruit: true, reportsTo: null, secondaryRole: true,
      membershipHref: '/revenue/ir/hierarchy', leadIds: ['peter'],
    })
    expect(cards.find(card => card.id === 'ir-scheme:chea')).toMatchObject({
      title: 'Relationship Specialist', reportsTo: 'ir-scheme:rachael', levelRank: 2, canRecruit: false,
    })
    expect(cards.find(card => card.id === 'rachael')?.secondaryRole).toBeUndefined()
  })

  it('adds role cards without changing roster records or inflating the number of distinct people', () => {
    const source = input()
    const original = JSON.stringify(source.people)
    const cards = companyHierarchyRoles(source)
    expect(cards).toHaveLength(7)
    expect(new Set(cards.map(card => card.staffId)).size).toBe(5)
    expect(source.people).toHaveLength(5)
    expect(JSON.stringify(source.people)).toBe(original)
    expect(cards.filter(card => card.staffId === 'peter')).toHaveLength(1)
    expect(cards.find(card => card.id === 'finance')).toMatchObject(source.people[4])
  })

  it('includes unplaced home staff but excludes inactive people, department heads and unrelated department memberships', () => {
    const source = input()
    source.memberships = source.memberships.filter(member => member.staffId !== 'rachael')
    for (const staffId of ['inactive', 'peter', 'finance']) source.memberships.push({
      staffId, schemeId: 'ir-scheme', uplineStaffId: null, titleId: 'head-ir', title: { name: 'Head of IR', levelId: 'head' },
    })
    const cards = companyHierarchyRoles(source)
    expect(cards.find(card => card.id === 'rachael')).toMatchObject({ title: 'Team Leader', subDepartment: 'Fair', reportsTo: 'chea' })
    expect(cards.find(card => card.id === 'ir-scheme:rachael')).toBeUndefined()
    for (const id of ['ir-scheme:inactive', 'ir-scheme:peter', 'ir-scheme:finance']) {
      expect(cards.find(card => card.id === id)).toBeUndefined()
    }
  })

  it('uses only current directors assigned to the particular sub-department', () => {
    const source = input()
    source.people.push(person('outsider', 'Other Director', { department: 'Other', isDepartmentHead: true }))
    source.departmentIds.set('outsider', 'other')
    source.directors.push(
      { staffId: 'inactive', subDepartmentId: 'ir' },
      { staffId: 'chea', subDepartmentId: 'ir' },
      { staffId: 'outsider', subDepartmentId: 'ir' },
    )
    const cards = companyHierarchyRoles(source)
    expect(cards.find(card => card.id === 'ir-scheme:rachael')?.leadIds).toEqual(['peter'])
    expect(cards.find(card => card.id === 'rachael')?.leadIds).toEqual(['kris', 'peter'])
  })

  it('keeps the roster title, level and reporting line when the mirrored home membership is stale', () => {
    const source = input()
    const home = source.memberships.find(member => member.schemeId === 'fair-scheme' && member.staffId === 'rachael')!
    home.title = { name: 'Outdated Head Title', levelId: 'head' }
    home.titleId = 'outdated-title'
    home.uplineStaffId = 'somebody-else'
    const primary = companyHierarchyRoles(source).find(card => card.id === 'rachael')!
    expect(primary).toMatchObject({
      title: 'Team Leader', levelRank: 4, levelName: 'Manager', canRecruit: true, reportsTo: 'chea',
      subDepartment: 'Fair', schemeId: 'fair-scheme',
    })
  })

  it('never substitutes a roster role or home manager for a missing secondary title or upline', () => {
    const source = input()
    const membership = source.memberships.find(member => member.schemeId === 'ir-scheme' && member.staffId === 'chea')!
    membership.titleId = null
    membership.title = null
    membership.uplineStaffId = 'inactive'
    const card = companyHierarchyRoles(source).find(entry => entry.id === 'ir-scheme:chea')!
    expect(card).toMatchObject({ title: null, levelRank: null, levelName: null, canRecruit: false, reportsTo: 'ir-scheme:inactive' })
  })

  it('resolves recruiting permission from all rungs of the local title within its scheme', () => {
    const source = input()
    source.ranks.push({ schemeId: 'fair-scheme', titleId: 'relationship-specialist', canRecruit: true })
    expect(companyHierarchyRoles(source).find(card => card.id === 'ir-scheme:chea')?.canRecruit).toBe(false)
    source.ranks.push({ schemeId: 'ir-scheme', titleId: 'relationship-specialist', canRecruit: true })
    expect(companyHierarchyRoles(source).find(card => card.id === 'ir-scheme:chea')?.canRecruit).toBe(true)
  })
})
