import { describe, expect, it } from 'vitest'
import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import { planHierarchyTransfer } from './hierarchy-transfer-layout'
import { collisionOffset, type Point } from './hierarchy-spaces'
import { buildSpaceTeams, geometryForSpaces, type SpaceMember } from './hierarchy-space-layout'

const departments = [{ id: 'fa', name: 'FA' }, { id: 'ir', name: 'IR' }]
const member = (id: string, parentId: string | null = null, departmentId = 'fa'): SpaceMember => ({
  id, parentId, departmentId, name: id,
})
const delta = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })

function expectCardsSeparated(members: readonly SpaceMember[], positions: ReadonlyMap<string, Point>) {
  for (let index = 0; index < members.length; index++) {
    const card = members[index]
    const point = positions.get(card.id)!
    for (const obstacle of members.slice(index + 1)) {
      const other = positions.get(obstacle.id)!
      const separated = point.x + (card.width ?? NODE_WIDTH) + 32 <= other.x
        || other.x + (obstacle.width ?? NODE_WIDTH) + 32 <= point.x
        || point.y + (card.height ?? NODE_HEIGHT) + 32 <= other.y
        || other.y + (obstacle.height ?? NODE_HEIGHT) + 32 <= point.y
      expect(separated, `${card.id} and ${obstacle.id} remain readable`).toBe(true)
    }
  }
}

describe('planHierarchyTransfer', () => {
  it('settles a transferred subtree into hierarchy slots without changing descendant relationships', () => {
    const members = [
      member('fa:anthony'), member('fa:yuny', 'fa:anthony'), member('fa:junior', 'fa:yuny'),
      member('fa:chea'), member('fa:howard', 'fa:chea'), member('ir:chea', null, 'ir'),
    ]
    const originPositions = new Map<string, Point>([
      ['fa:anthony', { x: -900, y: 20 }], ['fa:yuny', { x: -950, y: 260 }],
      ['fa:junior', { x: -720, y: 440 }], ['fa:chea', { x: 500, y: 0 }],
      ['fa:howard', { x: 500, y: 200 }], ['ir:chea', { x: 6000, y: 100 }],
    ])
    const positions = new Map(originPositions)
    positions.set('fa:anthony', { x: 500, y: 0 })
    const before = new Map(positions)
    const plan = planHierarchyTransfer({ departments, members, positions, childId: 'fa:anthony', parentId: 'fa:chea', originPositions })!
    expect(plan.movedIds).toEqual(['fa:anthony', 'fa:yuny', 'fa:junior'])
    expect(plan.positions.get('fa:chea')).toEqual(originPositions.get('fa:chea'))
    expect(plan.positions.get('fa:anthony')!.y).toBe(plan.positions.get('fa:howard')!.y)
    expect(plan.positions.get('fa:yuny')!.x).toBe(plan.positions.get('fa:anthony')!.x)
    expect(plan.positions.get('fa:junior')!.x).toBe(plan.positions.get('fa:yuny')!.x)
    expect(plan.positions.get('fa:yuny')!.y).toBeGreaterThan(plan.positions.get('fa:anthony')!.y + NODE_HEIGHT)
    expect(plan.positions.get('fa:junior')!.y).toBeGreaterThan(plan.positions.get('fa:yuny')!.y + NODE_HEIGHT)
    expect(plan.members.map(person => [person.id, person.parentId])).toEqual(members.map(person => [
      person.id, person.id === 'fa:anthony' ? 'fa:chea' : person.parentId,
    ]))
    expect(plan.positions.get('ir:chea')).toEqual(before.get('ir:chea'))
    expectCardsSeparated(members.filter(person => person.departmentId === 'fa'), plan.positions)
    expect(positions).toEqual(before)
    expect(originPositions.get('fa:anthony')).toEqual({ x: -900, y: 20 })
    expect(members[0].parentId).toBeNull()
    expect(plan.teamId).toBe('team:fa:fa:chea')
  })

  it('reflows both affected teams around their existing leaders while leaving a distant team untouched', () => {
    const members = [
      member('fa:source'), member('fa:mover', 'fa:source'), member('fa:remaining', 'fa:source'),
      member('fa:target'), member('fa:existing', 'fa:target'),
      member('fa:unrelated'), member('fa:unrelated-child', 'fa:unrelated'),
    ]
    const originPositions = new Map<string, Point>([
      ['fa:source', { x: -1500, y: 0 }], ['fa:mover', { x: -1900, y: 300 }],
      ['fa:remaining', { x: -1100, y: 300 }], ['fa:target', { x: 500, y: 0 }],
      ['fa:existing', { x: 500, y: 220 }], ['fa:unrelated', { x: 5000, y: 30 }],
      ['fa:unrelated-child', { x: 5100, y: 270 }],
    ])
    const positions = new Map(originPositions)
    positions.set('fa:mover', { x: 500, y: 0 })
    const plan = planHierarchyTransfer({ departments: [departments[0]], members, positions, originPositions, childId: 'fa:mover', parentId: 'fa:target' })!
    expect(plan.positions.get('fa:source')).toEqual(originPositions.get('fa:source'))
    expect(plan.positions.get('fa:target')).toEqual(originPositions.get('fa:target'))
    expect(plan.positions.get('fa:remaining')!.x).toBe(plan.positions.get('fa:source')!.x)
    expect(plan.positions.get('fa:mover')!.y).toBe(plan.positions.get('fa:existing')!.y)
    expect(plan.positions.get('fa:mover')!.x).toBeGreaterThan(plan.positions.get('fa:existing')!.x)
    for (const id of ['fa:unrelated', 'fa:unrelated-child']) expect(plan.positions.get(id)).toEqual(originPositions.get(id))
    const before = geometryForSpaces([departments[0]], members, buildSpaceTeams(members), originPositions)
    const after = geometryForSpaces([departments[0]], plan.members, plan.teams, plan.positions)
    expect(after.teams.find(team => team.leaderId === 'fa:source')!.bounds.width)
      .toBeLessThan(before.teams.find(team => team.leaderId === 'fa:source')!.bounds.width)
    expect(after.teams.find(team => team.leaderId === 'fa:target')!.bounds.width)
      .toBeGreaterThan(before.teams.find(team => team.leaderId === 'fa:target')!.bounds.width)
  })

  it('leaves enough room for measured card heights and widths in the enlarged target team', () => {
    const members = [
      { ...member('fa:target'), width: 280, height: 190 },
      { ...member('fa:existing', 'fa:target'), width: 380, height: 310 },
      { ...member('fa:mover'), width: 260, height: 130 },
      { ...member('fa:child', 'fa:mover'), width: 300, height: 140 },
    ]
    const positions = new Map<string, Point>([
      ['fa:target', { x: 500, y: 0 }], ['fa:existing', { x: 450, y: 250 }],
      ['fa:mover', { x: -500, y: 0 }], ['fa:child', { x: -430, y: 200 }],
    ])
    const plan = planHierarchyTransfer({ departments: [departments[0]], members, positions, childId: 'fa:mover', parentId: 'fa:target' })!
    expect(plan.positions.get('fa:target')).toEqual(positions.get('fa:target'))
    expect(plan.positions.get('fa:mover')!.y).toBe(plan.positions.get('fa:existing')!.y)
    expect(plan.positions.get('fa:mover')!.y).toBeGreaterThanOrEqual(190 + 60)
    expectCardsSeparated(members, plan.positions)
  })

  it('places descendants below their parent even when they previously sat above it', () => {
    const members = [member('fa:target'), member('fa:mover'), member('fa:child', 'fa:mover')]
    const positions = new Map<string, Point>([
      ['fa:target', { x: 100, y: 50 }], ['fa:mover', { x: 1000, y: 500 }],
      ['fa:child', { x: 1300, y: 200 }],
    ])
    const plan = planHierarchyTransfer({ departments: [departments[0]], members, positions, childId: 'fa:mover', parentId: 'fa:target' })!
    expect(plan.positions.get('fa:target')).toEqual(positions.get('fa:target'))
    expect(plan.positions.get('fa:mover')!.x).toBe(100)
    expect(plan.positions.get('fa:child')!.x).toBe(100)
    expect(plan.positions.get('fa:mover')!.y).toBeGreaterThan(50 + NODE_HEIGHT)
    expect(plan.positions.get('fa:child')!.y).toBeGreaterThan(plan.positions.get('fa:mover')!.y + NODE_HEIGHT)
  })

  it('detaches a new team at the dropped leader position and separates the old team', () => {
    const members = [member('fa:leader'), member('fa:mover', 'fa:leader'), member('fa:child', 'fa:mover')]
    const originPositions = new Map<string, Point>([
      ['fa:leader', { x: 0, y: 0 }], ['fa:mover', { x: 0, y: 200 }],
      ['fa:child', { x: 100, y: 400 }],
    ])
    const positions = new Map(originPositions)
    positions.set('fa:mover', { x: 10, y: 10 })
    const plan = planHierarchyTransfer({ departments: [departments[0]], members, positions, originPositions, childId: 'fa:mover', parentId: null })!
    expect(plan.positions.get('fa:mover')).toEqual({ x: 10, y: 10 })
    expect(plan.positions.get('fa:child')!.x).toBe(10)
    expect(plan.positions.get('fa:child')!.y).toBeGreaterThan(10 + NODE_HEIGHT)
    expect(plan.members.find(person => person.id === 'fa:mover')!.parentId).toBeNull()
    expect(plan.members.find(person => person.id === 'fa:child')!.parentId).toBe('fa:mover')
    const teams = geometryForSpaces([departments[0]], plan.members, plan.teams, plan.positions).teams
    expect(collisionOffset(teams[0].points, teams[1].points, 42)).toBeNull()
  })

  it('pushes a neighboring team as one block when the destination expands into it', () => {
    const members = [
      member('fa:target'), member('fa:existing', 'fa:target'), member('fa:mover'),
      member('fa:neighbor'), member('fa:neighbor-child', 'fa:neighbor'),
    ]
    const positions = new Map<string, Point>([
      ['fa:target', { x: 0, y: 0 }], ['fa:existing', { x: 0, y: 170 }],
      ['fa:mover', { x: -1500, y: 0 }], ['fa:neighbor', { x: 310, y: 0 }],
      ['fa:neighbor-child', { x: 330, y: 190 }],
    ])
    const plan = planHierarchyTransfer({ departments: [departments[0]], members, positions, childId: 'fa:mover', parentId: 'fa:target' })!
    expect(plan.positions.get('fa:target')).toEqual(positions.get('fa:target'))
    const neighborShift = delta(plan.positions.get('fa:neighbor')!, positions.get('fa:neighbor')!)
    expect(neighborShift).not.toEqual({ x: 0, y: 0 })
    expect(delta(plan.positions.get('fa:neighbor-child')!, positions.get('fa:neighbor-child')!)).toEqual(neighborShift)
    const teams = geometryForSpaces([departments[0]], plan.members, plan.teams, plan.positions).teams
    expect(collisionOffset(teams[0].points, teams[1].points, 42)).toBeNull()
  })

  it('refuses self, descendant, missing and cross-department targets without mutating inputs', () => {
    const members = [member('fa:leader'), member('fa:child', 'fa:leader'), member('ir:leader', null, 'ir')]
    const positions = new Map<string, Point>(members.map((person, index) => [person.id, { x: index * 500, y: 0 }]))
    const before = new Map(positions)
    for (const parentId of ['fa:leader', 'fa:child', 'ir:leader', 'missing']) {
      expect(planHierarchyTransfer({ departments, members, positions, childId: 'fa:leader', parentId })).toBeNull()
    }
    expect(planHierarchyTransfer({ departments, members, positions, childId: 'missing', parentId: null })).toBeNull()
    expect(positions).toEqual(before)
    expect(members[0].parentId).toBeNull()
  })

  it('refuses a transfer with incomplete or nonfinite member positions', () => {
    const members = [member('fa:leader'), member('fa:child', 'fa:leader'), member('fa:target')]
    const positions = new Map<string, Point>([
      ['fa:leader', { x: 0, y: 0 }], ['fa:child', { x: Number.NaN, y: 200 }],
      ['fa:target', { x: 1000, y: 0 }],
    ])
    expect(planHierarchyTransfer({ departments, members, positions, childId: 'fa:leader', parentId: 'fa:target' })).toBeNull()
    positions.delete('fa:child')
    expect(planHierarchyTransfer({ departments, members, positions, childId: 'fa:leader', parentId: 'fa:target' })).toBeNull()
  })
})
