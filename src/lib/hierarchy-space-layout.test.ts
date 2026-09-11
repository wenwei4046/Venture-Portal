import { describe, expect, it } from 'vitest'
import {
  buildSpaceTeams,
  departmentPositionKey,
  geometryForSpaces,
  initialSpacePositions,
  resolveSpaceOverlaps,
  spaceConnectionPoints,
  SPACE_DEPARTMENT_GAP,
  SPACE_TEAM_GAP,
  type SpaceMember,
} from './hierarchy-space-layout'
import { collisionOffset, rectanglePoints, type Bounds, type Point } from './hierarchy-spaces'

const departments = [{ id: 'fa', name: 'FA' }, { id: 'ir', name: 'IR' }]
const member = (id: string, departmentId: string, parentId: string | null = null, name = id): SpaceMember => (
  { id, departmentId, parentId, name }
)

function contains(bounds: Bounds, point: Point): boolean {
  return point.x >= bounds.x - 1e-6 && point.x <= bounds.x + bounds.width + 1e-6
    && point.y >= bounds.y - 1e-6 && point.y <= bounds.y + bounds.height + 1e-6
}

function difference(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

describe('buildSpaceTeams', () => {
  it('keeps the same person’s two memberships in their own department hierarchy', () => {
    const members = [
      member('fa:chea', 'fa', null, 'Chea'),
      member('fa:howard', 'fa', 'fa:chea', 'Howard'),
      member('ir:rachael', 'ir', null, 'Rachael'),
      member('ir:chea', 'ir', 'ir:rachael', 'Chea'),
    ]
    const teams = buildSpaceTeams(members)
    expect(teams).toHaveLength(2)
    expect(teams.find(team => team.departmentId === 'fa')?.memberIds).toEqual(['fa:chea', 'fa:howard'])
    expect(teams.find(team => team.departmentId === 'ir')?.memberIds).toEqual(['ir:rachael', 'ir:chea'])
    const positions = initialSpacePositions(departments, members, teams)
    expect(positions.get('fa:chea')).not.toEqual(positions.get('ir:chea'))
  })

  it('includes every orphan, self-parent and cycle member once without crossing departments', () => {
    const members = [
      member('root', 'fa'), member('child', 'fa', 'root'),
      member('orphan', 'fa', 'missing'), member('self', 'fa', 'self'),
      member('loop-a', 'fa', 'loop-b'), member('loop-b', 'fa', 'loop-a'),
      member('loop-child', 'fa', 'loop-b'), member('outside-child', 'ir', 'root'),
    ]
    const teams = buildSpaceTeams(members)
    const ids = teams.flatMap(team => team.memberIds)
    expect([...ids].sort()).toEqual(members.map(person => person.id).sort())
    expect(new Set(ids).size).toBe(members.length)
    expect(teams.find(team => team.departmentId === 'ir')?.memberIds).toEqual(['outside-child'])
    const positions = initialSpacePositions(departments, members, teams)
    for (const person of members) expect(positions.has(person.id)).toBe(true)
  })
})

describe('geometryForSpaces and initialSpacePositions', () => {
  it('encloses measured cards, labels and connector bends inside their department', () => {
    const members = [
      { ...member('leader', 'fa'), width: 300, height: 130 },
      { ...member('child', 'fa', 'leader'), width: 260, height: 165 },
    ]
    const teams = buildSpaceTeams(members)
    const positions = new Map<string, Point>([['leader', { x: 20, y: 360 }], ['child', { x: 680, y: 40 }]])
    const geometry = geometryForSpaces(departments, members, teams, positions)
    const team = geometry.teams[0]
    const department = geometry.departments[0]
    for (const person of members) {
      const rect = { ...positions.get(person.id)!, width: person.width, height: person.height }
      for (const point of rectanglePoints(rect)) {
        expect(contains(team.bounds, point)).toBe(true)
        expect(contains(department.bounds, point)).toBe(true)
      }
    }
    const route = spaceConnectionPoints(
      { ...positions.get('leader')!, width: 300, height: 130 },
      { ...positions.get('child')!, width: 260, height: 165 },
    )
    for (const point of route) expect(contains(team.bounds, point)).toBe(true)
    expect(contains(team.bounds, team.labelPosition)).toBe(true)
    expect(department.bounds.y).toBeLessThan(team.bounds.y - 40)
  })

  it('lays out arbitrary departments, including an empty department, without initial overlaps', () => {
    const manyDepartments = [...departments, { id: 'operations', name: 'Operations' }, { id: 'empty', name: 'New division' }]
    const members = [
      member('a', 'fa'), member('b', 'fa', 'a'), member('c', 'fa'), member('d', 'fa', 'c'),
      member('e', 'ir'), member('f', 'ir', 'e'), member('g', 'operations'),
    ]
    const teams = buildSpaceTeams(members)
    const positions = initialSpacePositions(manyDepartments, members, teams)
    const geometry = geometryForSpaces(manyDepartments, members, teams, positions)
    expect(geometry.departments).toHaveLength(4)
    expect(geometry.departments.find(department => department.id === 'empty')?.bounds.width).toBeGreaterThan(200)
    expect(positions.has(departmentPositionKey('empty'))).toBe(true)
    for (let i = 0; i < geometry.departments.length; i++) {
      for (let j = i + 1; j < geometry.departments.length; j++) {
        expect(collisionOffset(rectanglePoints(geometry.departments[i].bounds),
          rectanglePoints(geometry.departments[j].bounds), SPACE_DEPARTMENT_GAP)).toBeNull()
      }
    }
  })
})

describe('resolveSpaceOverlaps', () => {
  const members = [
    member('anthony', 'fa'), member('yuny', 'fa', 'anthony'),
    member('chea', 'fa'), member('howard', 'fa', 'chea'), member('lim', 'fa', 'chea'),
    member('rachael', 'ir'), member('ir-chea', 'ir', 'rachael'),
  ]

  it('clears elongated team envelopes and department frames while keeping the dragged team fixed', () => {
    const teams = buildSpaceTeams(members)
    const positions = initialSpacePositions(departments, members, teams)
    // A user pulls Yuny across Chea's team and into the neighbouring department.
    const chea = positions.get('chea')!
    positions.set('yuny', { x: chea.x + 900, y: chea.y + 320 })
    const before = new Map([...positions].map(([id, point]) => [id, { ...point }]))
    const anchor = teams.find(team => team.leaderId === 'anthony')!
    const next = resolveSpaceOverlaps(departments, members, teams, positions, { teamId: anchor.id })
    const geometry = geometryForSpaces(departments, members, teams, next)
    const faTeams = geometry.teams.filter(team => team.departmentId === 'fa')
    expect(collisionOffset(faTeams[0].points, faTeams[1].points, SPACE_TEAM_GAP)).toBeNull()
    expect(collisionOffset(rectanglePoints(geometry.departments[0].bounds),
      rectanglePoints(geometry.departments[1].bounds), SPACE_DEPARTMENT_GAP)).toBeNull()
    for (const id of anchor.memberIds) expect(next.get(id)).toEqual(before.get(id))
    // Each avoiding team moves rigidly; input coordinates remain untouched.
    expect(difference(next.get('howard')!, next.get('chea')!))
      .toEqual(difference(before.get('howard')!, before.get('chea')!))
    expect(difference(next.get('ir-chea')!, next.get('rachael')!))
      .toEqual(difference(before.get('ir-chea')!, before.get('rachael')!))
    expect(positions).toEqual(before)
  })

  it('moves other departments as a unit after a whole-department drop', () => {
    const teams = buildSpaceTeams(members)
    const positions = initialSpacePositions(departments, members, teams)
    const faPosition = positions.get('chea')!
    const irPosition = positions.get('rachael')!
    const delta = difference(faPosition, irPosition)
    for (const id of ['rachael', 'ir-chea']) {
      const point = positions.get(id)!
      positions.set(id, { x: point.x + delta.x, y: point.y + delta.y })
    }
    const next = resolveSpaceOverlaps(departments, members, teams, positions, { departmentId: 'ir' })
    expect(next.get('rachael')).toEqual(positions.get('rachael'))
    expect(next.get('ir-chea')).toEqual(positions.get('ir-chea'))
    const faIds = members.filter(person => person.departmentId === 'fa').map(person => person.id)
    const offset = difference(next.get(faIds[0])!, positions.get(faIds[0])!)
    for (const id of faIds) expect(difference(next.get(id)!, positions.get(id)!)).toEqual(offset)
  })

  it('retains manual arrangements on tidy when no groups overlap', () => {
    const teams = buildSpaceTeams(members)
    const positions = initialSpacePositions(departments, members, teams)
    const point = positions.get('yuny')!
    positions.set('yuny', { x: point.x - 15, y: point.y + 5 })
    const next = resolveSpaceOverlaps(departments, members, teams, positions)
    expect(next).toEqual(positions)
  })

  it('packs and preserves the origin of an anchored empty department', () => {
    const withEmpty = [...departments, { id: 'empty', name: 'New division' }]
    const teams = buildSpaceTeams(members)
    const positions = initialSpacePositions(withEmpty, members, teams)
    positions.set(departmentPositionKey('empty'), { x: 0, y: 0 })
    const next = resolveSpaceOverlaps(withEmpty, members, teams, positions, { departmentId: 'empty' })
    expect(next.get(departmentPositionKey('empty'))).toEqual({ x: 0, y: 0 })
    const geometry = geometryForSpaces(withEmpty, members, teams, next)
    const empty = geometry.departments.find(department => department.id === 'empty')!
    for (const department of geometry.departments.filter(department => department.id !== 'empty')) {
      expect(collisionOffset(rectanglePoints(empty.bounds), rectanglePoints(department.bounds), SPACE_DEPARTMENT_GAP)).toBeNull()
    }
  })
})
