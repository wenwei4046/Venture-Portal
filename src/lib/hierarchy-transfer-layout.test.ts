import { describe, expect, it } from 'vitest'
import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import { planHierarchyTransfer } from './hierarchy-transfer-layout'
import { collisionOffset, type Point } from './hierarchy-spaces'
import { geometryForSpaces, type SpaceMember } from './hierarchy-space-layout'

const departments = [{ id: 'fa', name: 'FA' }, { id: 'ir', name: 'IR' }]
const member = (id: string, parentId: string | null = null, departmentId = 'fa'): SpaceMember => ({
  id, parentId, departmentId, name: id,
})
const delta = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })

describe('planHierarchyTransfer', () => {
  it('moves a whole subtree using its pre-drag shape and changes only the root relationship', () => {
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
    for (const id of plan.movedIds) {
      expect(delta(plan.positions.get(id)!, plan.positions.get('fa:anthony')!))
        .toEqual(delta(originPositions.get(id)!, originPositions.get('fa:anthony')!))
    }
    expect(plan.members.map(person => [person.id, person.parentId])).toEqual(members.map(person => [
      person.id, person.id === 'fa:anthony' ? 'fa:chea' : person.parentId,
    ]))
    for (const id of ['fa:chea', 'fa:howard', 'ir:chea']) expect(plan.positions.get(id)).toEqual(before.get(id))
    expect(positions).toEqual(before)
    expect(members[0].parentId).toBeNull()
    expect(plan.teamId).toBe('team:fa:fa:chea')
  })

  it('finds the nearest free side and accounts for measured heights and widths', () => {
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
    // Left needs 452 px; right needs 362 px, so the right-hand slot is nearer.
    expect(plan.positions.get('fa:mover')).toEqual({ x: 862, y: 250 })
    expect(plan.positions.get('fa:target')).toEqual(positions.get('fa:target'))
    expect(plan.positions.get('fa:existing')).toEqual(positions.get('fa:existing'))
    for (const id of plan.movedIds) {
      const moved = members.find(person => person.id === id)!
      const point = plan.positions.get(id)!
      for (const stationary of members.filter(person => !plan.movedIds.includes(person.id))) {
        const obstacle = plan.positions.get(stationary.id)!
        const separated = point.x + (moved.width ?? NODE_WIDTH) + 32 <= obstacle.x
          || obstacle.x + (stationary.width ?? NODE_WIDTH) + 32 <= point.x
          || point.y + (moved.height ?? NODE_HEIGHT) + 32 <= obstacle.y
          || obstacle.y + (stationary.height ?? NODE_HEIGHT) + 32 <= point.y
        expect(separated).toBe(true)
      }
    }
  })

  it('keeps the whole block below its target even when a descendant was arranged above its root', () => {
    const members = [member('fa:target'), member('fa:mover'), member('fa:child', 'fa:mover')]
    const positions = new Map<string, Point>([
      ['fa:target', { x: 100, y: 50 }], ['fa:mover', { x: 1000, y: 500 }],
      ['fa:child', { x: 1300, y: 200 }],
    ])
    const plan = planHierarchyTransfer({ departments: [departments[0]], members, positions, childId: 'fa:mover', parentId: 'fa:target' })!
    expect(plan.positions.get('fa:child')!.y).toBe(50 + NODE_HEIGHT + 60)
    expect(delta(plan.positions.get('fa:child')!, plan.positions.get('fa:mover')!)).toEqual({ x: 300, y: -300 })
    expect(plan.positions.get('fa:mover')!.x).toBe(100)
  })

  it('detaches at the dropped position, retaining subtree offsets and separating the old team', () => {
    const members = [member('fa:leader'), member('fa:mover', 'fa:leader'), member('fa:child', 'fa:mover')]
    const originPositions = new Map<string, Point>([
      ['fa:leader', { x: 0, y: 0 }], ['fa:mover', { x: 0, y: 200 }],
      ['fa:child', { x: 100, y: 400 }],
    ])
    const positions = new Map(originPositions)
    positions.set('fa:mover', { x: 10, y: 10 })
    const plan = planHierarchyTransfer({ departments: [departments[0]], members, positions, originPositions, childId: 'fa:mover', parentId: null })!
    expect(plan.positions.get('fa:mover')).toEqual({ x: 10, y: 10 })
    expect(plan.positions.get('fa:child')).toEqual({ x: 110, y: 210 })
    expect(plan.members.find(person => person.id === 'fa:mover')!.parentId).toBeNull()
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
})
