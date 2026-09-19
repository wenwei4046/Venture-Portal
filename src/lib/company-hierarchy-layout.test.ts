import { describe, expect, it } from 'vitest'
import {
  companyLeadershipBounds, COMPANY_LEADERSHIP_GAP,
  initialCompanyHierarchyPositions, resolveCompanyHierarchyPositions,
  type CompanyHierarchyLeader,
} from './company-hierarchy-layout'
import { buildSpaceTeams, departmentPositionKey, geometryForSpaces, type SpaceMember } from './hierarchy-space-layout'
import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import { collisionOffset, rectanglePoints } from './hierarchy-spaces'

const person = (id: string, departmentId: string, parentId: string | null = null, height = NODE_HEIGHT): SpaceMember => (
  { id, name: id, departmentId, parentId, width: NODE_WIDTH, height }
)
const departments = [
  { id: 'Finance', name: 'Finance' },
  { id: 'Revenue::Fair', name: 'Revenue Department · Fair' },
  { id: 'Revenue::IR', name: 'Revenue Department · IR' },
  { id: 'HR', name: 'HR' },
]
const leaders = [
  person('principal', 'Director', null, 160),
  person('finance-head', 'Finance', 'principal', 130),
  person('revenue-head', 'Revenue', 'principal', 145),
]
const members = [
  person('finance-team', 'Finance', 'finance-head', 170),
  person('accountant', 'Finance', 'finance-team', 190),
  person('fair-team', 'Revenue::Fair', 'revenue-head'),
  person('fair-report', 'Revenue::Fair', 'fair-team'),
  person('fair-peer', 'Revenue::Fair', 'revenue-head'),
  person('ir-team', 'Revenue::IR', 'revenue-head'),
]

describe('company management and department-zone layout', () => {
  it('places actual upper management above peer department zones with reporting levels intact', () => {
    const positions = initialCompanyHierarchyPositions(departments, members, leaders)
    const geometry = geometryForSpaces(departments, members, buildSpaceTeams(members), positions)
    const rail = companyLeadershipBounds(leaders, positions)!
    expect(positions.get('principal')!.y + 160).toBeLessThan(positions.get('finance-head')!.y)
    expect(positions.get('finance-head')!.y).toBe(positions.get('revenue-head')!.y)
    for (const zone of geometry.departments) {
      expect(zone.bounds.y).toBe(rail.y + rail.height + COMPANY_LEADERSHIP_GAP)
      expect(zone.bounds.y).toBeGreaterThan(positions.get('revenue-head')!.y + 145)
    }
    for (const member of members.filter(member => members.some(parent => parent.id === member.parentId))) {
      const parent = members.find(parent => parent.id === member.parentId)!
      expect(positions.get(member.id)!.y - positions.get(parent.id)!.y - parent.height!).toBeGreaterThanOrEqual(40)
    }
    expect(positions.get('fair-team')!.y).toBe(positions.get('fair-peer')!.y)
    expect(positions.get('fair-team')!.x).not.toBe(positions.get('fair-peer')!.x)
  })

  it('retains every person and empty department while Fair and IR remain independent zones', () => {
    const positions = initialCompanyHierarchyPositions(departments, members, leaders)
    const teams = buildSpaceTeams(members)
    const geometry = geometryForSpaces(departments, members, teams, positions)
    const allowedKeys = [...members, ...leaders].map(person => person.id).concat(departments.map(department => departmentPositionKey(department.id)))
    expect([...positions.keys()].sort()).toEqual(allowedKeys.sort())
    expect(geometry.departments.map(zone => zone.name)).toEqual(departments.map(zone => zone.name))
    expect(geometry.teams.find(team => team.leaderId === 'fair-team')!.departmentId).toBe('Revenue::Fair')
    expect(geometry.teams.find(team => team.leaderId === 'ir-team')!.departmentId).toBe('Revenue::IR')
    const empty = geometry.departments.find(zone => zone.id === 'HR')!
    expect(empty.bounds.width).toBeGreaterThan(200)
    for (let a = 0; a < geometry.departments.length; a++) {
      for (let b = a + 1; b < geometry.departments.length; b++) {
        expect(collisionOffset(rectanglePoints(geometry.departments[a].bounds), rectanglePoints(geometry.departments[b].bounds))).toBeNull()
      }
    }
    expect(resolveCompanyHierarchyPositions(departments, members, leaders, positions, {}, true)).toEqual(positions)
  })

  it('centers unrelated management trees over their own reporting zones without inventing a shared boss', () => {
    const actualLeaders = [person('finance-manager', 'Director'), person('revenue-manager', 'Director')]
    const reports = [person('finance-report', 'Finance', 'finance-manager'), person('fair-report', 'Revenue::Fair', 'revenue-manager')]
    const before = structuredClone({ actualLeaders, reports, departments })
    const positions = initialCompanyHierarchyPositions(departments, reports, actualLeaders)
    const geometry = geometryForSpaces(departments, reports, buildSpaceTeams(reports), positions)
    for (const [leaderId, zoneId] of [['finance-manager', 'Finance'], ['revenue-manager', 'Revenue::Fair']]) {
      const zone = geometry.departments.find(zone => zone.id === zoneId)!
      expect(positions.get(leaderId)!.x + NODE_WIDTH / 2).toBe(zone.bounds.x + zone.bounds.width / 2)
      expect(positions.get(leaderId)!.y).toBe(0)
    }
    expect({ actualLeaders, reports, departments }).toEqual(before)
    expect([...positions.keys()].filter(id => !id.startsWith('space-department:')).sort())
      .toEqual([...reports, ...actualLeaders].map(person => person.id).sort())
  })

  it('recomputes compact zones when a wide team is collapsed and restores it on expansion', () => {
    const expanded = [person('manager', 'Finance'), ...Array.from({ length: 8 }, (_, index) => person(`report-${index}`, 'Finance', 'manager'))]
    const full = initialCompanyHierarchyPositions(departments, expanded, leaders)
    const collapsed = initialCompanyHierarchyPositions(departments, expanded.slice(0, 1), leaders)
    const geometry = (people: SpaceMember[], positions: ReturnType<typeof initialCompanyHierarchyPositions>) =>
      geometryForSpaces(departments, people, buildSpaceTeams(people), positions)
    expect(geometry(expanded, full).departments[0].bounds.width)
      .toBeGreaterThan(geometry(expanded.slice(0, 1), collapsed).departments[0].bounds.width * 4)
    expect(collapsed.has('report-0')).toBe(false)
    expect(initialCompanyHierarchyPositions(departments, expanded, leaders)).toEqual(full)
  })

  it('keeps a department head above its sub-department zones when all reports are summarized', () => {
    const head = person('revenue-manager', 'Revenue')
    const summaries = departments.map(department => ({ ...person(`summary:${department.id}`, department.id), height: 148 }))
    const positions = initialCompanyHierarchyPositions(departments, summaries, [head])
    const zones = geometryForSpaces(departments, summaries, buildSpaceTeams(summaries), positions).departments
      .filter(zone => zone.id.startsWith('Revenue::'))
    const left = Math.min(...zones.map(zone => zone.bounds.x))
    const right = Math.max(...zones.map(zone => zone.bounds.x + zone.bounds.width))
    expect(positions.get(head.id)!.x + NODE_WIDTH / 2).toBe((left + right) / 2)
  })

  it('uses every codirector association with real JSON zone IDs rather than the unrelated company center', () => {
    const financeId = JSON.stringify(['Finance', null])
    const fairId = JSON.stringify(['Revenue Department', 'Fair'])
    const irId = JSON.stringify(['Revenue Department', 'IR'])
    const zones = [
      { id: financeId, name: 'Finance' }, { id: fairId, name: 'Revenue Department · Fair' },
      { id: irId, name: 'Revenue Department · IR' },
    ]
    const actual = [
      person('finance-root', financeId),
      ...Array.from({ length: 8 }, (_, index) => person(`finance-report-${index}`, financeId, 'finance-root')),
      person('summary:fair', fairId, 'director-a'), person('summary:ir', irId),
    ]
    const directors: CompanyHierarchyLeader[] = [
      { ...person('director-a', JSON.stringify(['Revenue Department', null])), relatedDepartmentIds: [fairId] },
      { ...person('director-b', JSON.stringify(['Revenue Department', null])), relatedDepartmentIds: [fairId, 'stale-zone'] },
    ]
    const before = structuredClone(directors)
    const positions = initialCompanyHierarchyPositions(zones, actual, directors)
    const geometry = geometryForSpaces(zones, actual, buildSpaceTeams(actual), positions)
    const fair = geometry.departments.find(zone => zone.id === fairId)!.bounds
    for (const director of directors) {
      const center = positions.get(director.id)!.x + NODE_WIDTH / 2
      expect(center).toBeGreaterThanOrEqual(fair.x)
      expect(center).toBeLessThan(fair.x + fair.width + NODE_WIDTH)
    }
    expect((positions.get('director-a')!.x + positions.get('director-b')!.x + NODE_WIDTH) / 2)
      .toBe(fair.x + fair.width / 2)
    expect(resolveCompanyHierarchyPositions(zones, actual, directors, positions, {}, true)).toEqual(positions)
    expect(directors).toEqual(before)
    // Without explicit associations, the JSON pair still locates the person's
    // own department across its sub-departments, including summarized zones.
    const fallback = initialCompanyHierarchyPositions(zones, actual.map(member => ({ ...member, parentId: null })), [
      person('department-head', JSON.stringify(['Revenue Department', null])),
    ])
    const fallbackZones = geometryForSpaces(zones, actual.map(member => ({ ...member, parentId: null })),
      buildSpaceTeams(actual.map(member => ({ ...member, parentId: null }))), fallback).departments
      .filter(zone => zone.id !== financeId)
    const left = Math.min(...fallbackZones.map(zone => zone.bounds.x))
    const right = Math.max(...fallbackZones.map(zone => zone.bounds.x + zone.bounds.width))
    expect(fallback.get('department-head')!.x + NODE_WIDTH / 2).toBe((left + right) / 2)
  })

  it('keeps leader-only forests finite without creating department placeholders', () => {
    const actual = [person('director', JSON.stringify(['Director', null])), person('manager', JSON.stringify(['Finance', null]), 'director')]
    const positions = initialCompanyHierarchyPositions([], [], actual)
    expect([...positions.keys()].sort()).toEqual(['director', 'manager'])
    for (const point of positions.values()) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
    expect(positions.get('director')!.y).toBeLessThan(positions.get('manager')!.y)
    expect(companyLeadershipBounds(actual, positions)).not.toBeNull()
    expect(resolveCompanyHierarchyPositions([], [], actual, positions, {}, true)).toEqual(positions)
  })

  it('handles missing parents and no-management data without adding placeholder people', () => {
    const actual = [person('orphan', 'Finance', 'missing-manager'), person('peer', 'Finance')]
    const positions = initialCompanyHierarchyPositions(departments, actual)
    expect(companyLeadershipBounds([], positions)).toBeNull()
    expect(positions.has('missing-manager')).toBe(false)
    expect(positions.get('orphan')!.y).toBe(positions.get('peer')!.y)
    expect(positions.get(departmentPositionKey('Finance'))!.y).toBe(0)
    expect(initialCompanyHierarchyPositions([], [], [])).toEqual(new Map())
  })

  it('keeps dragged zones below management without mutating the supplied positions', () => {
    const positions = initialCompanyHierarchyPositions(departments, members, leaders)
    for (const member of members) positions.set(member.id, { ...positions.get(member.id)!, y: positions.get(member.id)!.y - 700 })
    for (const department of departments) {
      const id = departmentPositionKey(department.id)
      positions.set(id, { ...positions.get(id)!, y: positions.get(id)!.y - 700 })
    }
    const original = structuredClone(positions)
    const result = resolveCompanyHierarchyPositions(departments, members, leaders, positions)
    expect(positions).toEqual(original)
    const rail = companyLeadershipBounds(leaders, result)!
    for (const zone of geometryForSpaces(departments, members, buildSpaceTeams(members), result).departments) {
      expect(zone.bounds.y).toBeGreaterThanOrEqual(rail.y + rail.height + COMPANY_LEADERSHIP_GAP)
    }
    for (const leader of leaders) expect(result.get(leader.id)).toEqual(original.get(leader.id))
  })
})
