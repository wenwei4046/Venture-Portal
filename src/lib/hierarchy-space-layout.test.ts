import { describe, expect, it } from 'vitest'
import {
  alignSpaceTeams,
  buildSpaceTeams,
  departmentPositionKey,
  directorRail,
  geometryForSpaces,
  initialSpacePositions,
  resolveSpaceOverlaps,
  spaceConnectionPoints,
  SPACE_DEPARTMENT_GAP,
  SPACE_DIRECTOR_X_GAP,
  SPACE_RAIL_EXIT,
  SPACE_RAIL_GAP,
  SPACE_RAIL_LABEL,
  SPACE_RAIL_STEP,
  SPACE_TEAM_GAP,
  SPACE_TEAM_HEADER,
  type SpaceMember,
} from './hierarchy-space-layout'
import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import { boundsOf, collisionOffset, rectanglePoints, type Bounds, type Point } from './hierarchy-spaces'

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
    expect(team.points).toEqual(rectanglePoints(team.bounds))
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
    expect(team.labelPosition.x).toBeGreaterThan(team.bounds.x)
    expect(team.labelPosition.y + 24).toBeLessThanOrEqual(team.bounds.y + SPACE_TEAM_HEADER)
    for (const point of positions.values()) expect(point.y).toBeGreaterThan(team.bounds.y + SPACE_TEAM_HEADER)
    expect(department.bounds.y).toBeLessThan(team.bounds.y - 40)
  })

  it('grows a floating frame to fit additional hierarchy columns and rows', () => {
    const initial = [member('leader', 'fa'), member('child', 'fa', 'leader')]
    const wider = [...initial, member('sibling', 'fa', 'leader'), member('another', 'fa', 'leader')]
    const taller = [...wider, member('grandchild', 'fa', 'child')]
    const origin = new Map<string, Point>([['leader', { x: 147.25, y: -289.5 }]])
    const shapes = [initial, wider, taller].map(members => {
      const teams = buildSpaceTeams(members)
      const positions = alignSpaceTeams(members, teams, origin)
      expect(positions.get('leader')).toEqual(origin.get('leader'))
      return geometryForSpaces(departments, members, teams, positions).teams[0]
    })
    expect(shapes[1].bounds.width).toBeGreaterThan(shapes[0].bounds.width)
    expect(shapes[2].bounds.height).toBeGreaterThan(shapes[1].bounds.height)
    expect(shapes[2].bounds.width).toBe(shapes[1].bounds.width)
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

describe('horizontal initialSpacePositions', () => {
  function company() {
    const departments = Array.from({ length: 7 }, (_, index) => ({ id: `department-${index}`, name: `Department ${index}` }))
    const members: SpaceMember[] = [
      { ...member('wide-leader', departments[0].id, null, 'A wide team'), width: 360, height: 180 },
      ...Array.from({ length: 5 }, (_, index) => ({
        ...member(`wide-child-${index}`, departments[0].id, 'wide-leader'), width: 310 + index * 10, height: 140 + index * 20,
      })),
      { ...member('grandchild', departments[0].id, 'wide-child-2'), width: 280, height: 160 },
      member('second-leader', departments[0].id, null, 'B second team'),
      member('third-leader', departments[0].id, null, 'C third team'),
      { ...member('tall-leader', departments[0].id, null, 'D tall team'), width: 280, height: 240 },
      { ...member('tall-child', departments[0].id, 'tall-leader'), width: 320, height: 290 },
      member('tall-grandchild', departments[0].id, 'tall-child'),
      ...[1, 3, 4, 5].flatMap(index => [
        member(`leader-${index}`, departments[index].id),
        member(`child-${index}`, departments[index].id, `leader-${index}`),
      ]),
    ]
    return { departments, members, teams: buildSpaceTeams(members) }
  }

  it('keeps seven departments and every team in top-aligned horizontal rows without overlaps', () => {
    const { departments, members, teams } = company()
    const positions = initialSpacePositions(departments, members, teams, 'horizontal')
    const geometry = geometryForSpaces(departments, members, teams, positions)
    expect(geometry.departments.map(department => department.id)).toEqual(departments.map(department => department.id))
    expect(positions.size).toBe(members.length + departments.length)
    for (const [index, department] of geometry.departments.entries()) {
      expect(department.bounds.y).toBe(0)
      expect(positions.get(departmentPositionKey(department.id))).toEqual({ x: department.bounds.x, y: 0 })
      if (index > 0) {
        const previous = geometry.departments[index - 1].bounds
        expect(department.bounds.x - previous.x - previous.width).toBeCloseTo(SPACE_DEPARTMENT_GAP)
      }
      const contents = geometry.teams.filter(team => team.departmentId === department.id)
      for (const [teamIndex, team] of contents.entries()) {
        expect(team.bounds.y).toBe(contents[0].bounds.y)
        if (teamIndex > 0) {
          const previous = contents[teamIndex - 1].bounds
          expect(team.bounds.x - previous.x - previous.width).toBeCloseTo(SPACE_TEAM_GAP)
        }
        for (const point of rectanglePoints(team.bounds)) expect(contains(department.bounds, point)).toBe(true)
      }
    }
    const wide = geometry.teams.find(team => team.leaderId === 'wide-leader')!
    expect(wide.bounds.width).toBeGreaterThan(1200)
    expect(geometry.teams.filter(team => team.departmentId === departments[0].id)).toHaveLength(4)
    for (const id of [departments[2].id, departments[6].id]) {
      expect(geometry.teams.some(team => team.departmentId === id)).toBe(false)
      const empty = geometry.departments.find(department => department.id === id)!
      expect(empty.bounds.width).toBeGreaterThan(200)
      expect(empty.bounds.height).toBeGreaterThan(100)
    }
    // Different measured card heights still reserve enough room for reports.
    for (const person of members) {
      const rectangle = { ...positions.get(person.id)!, width: person.width ?? NODE_WIDTH, height: person.height ?? NODE_HEIGHT }
      const team = geometry.teams.find(team => team.memberIds.includes(person.id))!
      for (const point of rectanglePoints(rectangle)) expect(contains(team.bounds, point)).toBe(true)
      if (person.parentId) {
        const parent = members.find(candidate => candidate.id === person.parentId)!
        expect(rectangle.y - positions.get(parent.id)!.y - (parent.height ?? NODE_HEIGHT)).toBeGreaterThanOrEqual(40)
      }
    }
  })

  it('requires no overlap correction and preserves all input objects and reporting lines', () => {
    const { departments, members, teams } = company()
    const before = structuredClone({ departments, members, teams })
    for (const department of departments) Object.freeze(department)
    for (const person of members) Object.freeze(person)
    for (const team of teams) { Object.freeze(team.memberIds); Object.freeze(team) }
    Object.freeze(departments)
    Object.freeze(members)
    Object.freeze(teams)
    const positions = initialSpacePositions(departments, members, teams, 'horizontal')
    const snapshot = new Map([...positions].map(([id, point]) => [id, { ...point }]))
    expect(resolveSpaceOverlaps(departments, members, teams, positions)).toEqual(positions)
    expect(positions).toEqual(snapshot)
    expect({ departments, members, teams }).toEqual(before)
  })

  it('preserves the existing wrapping grid unless horizontal arrangement is requested', () => {
    const { departments, members, teams } = company()
    const positions = initialSpacePositions(departments, members, teams)
    expect(initialSpacePositions(departments, members, teams, 'grid')).toEqual(positions)
    const geometry = geometryForSpaces(departments, members, teams, positions)
    expect(geometry.departments[0].bounds.y).toBe(geometry.departments[1].bounds.y)
    expect(geometry.departments[2].bounds.y).toBeGreaterThan(geometry.departments[0].bounds.y)
    const contents = geometry.teams.filter(team => team.departmentId === departments[0].id)
    expect(contents[1].bounds.y).toBeGreaterThan(contents[0].bounds.y)
    expect(initialSpacePositions([], [], undefined, 'horizontal')).toEqual(new Map())
  })
})

describe('alignSpaceTeams', () => {
  const members = [
    member('leader', 'fa'), member('alice', 'fa', 'leader'), member('bob', 'fa', 'leader'),
    member('grandchild', 'fa', 'alice'), member('other', 'fa'), member('other-child', 'fa', 'other'),
  ]

  it('organizes rows around an arbitrary leader origin without a canvas grid', () => {
    const teams = buildSpaceTeams(members)
    const origins = new Map<string, Point>([
      ['leader', { x: -483.125, y: 733.75 }], ['other', { x: 1000.5, y: -25.25 }],
    ])
    const aligned = alignSpaceTeams(members, teams, origins)
    const delta = { x: 67.375, y: -93.125 }
    const translated = new Map([...origins].map(([id, point]) => [id, { x: point.x + delta.x, y: point.y + delta.y }]))
    const shifted = alignSpaceTeams(members, teams, translated)
    expect(aligned.get('leader')).toEqual(origins.get('leader'))
    expect(aligned.get('alice')!.y).toBe(aligned.get('bob')!.y)
    expect(aligned.get('leader')!.y).toBeLessThan(aligned.get('alice')!.y)
    expect(aligned.get('grandchild')!.y).toBeGreaterThan(aligned.get('alice')!.y)
    expect(aligned.get('alice')!.x).toBeLessThan(aligned.get('bob')!.x)
    for (const person of members) expect(difference(shifted.get(person.id)!, aligned.get(person.id)!)).toEqual(delta)
  })

  it('realigns only the requested team from its pre-drag leader and preserves department origins', () => {
    const teams = buildSpaceTeams(members)
    const baseline = initialSpacePositions(departments, members, teams)
    const dragged = new Map(baseline)
    dragged.set('leader', { x: 3428.125, y: -884.75 })
    dragged.set('alice', { x: 998.5, y: -1200.25 })
    dragged.set('other-child', { x: 10.25, y: -770.5 })
    const snapshots = [new Map(baseline), new Map(dragged)]
    const selected = teams.find(team => team.leaderId === 'leader')!
    const aligned = alignSpaceTeams(members, teams, dragged, baseline, [selected.id])
    expect(aligned.get('leader')).toEqual(baseline.get('leader'))
    expect(aligned.get('alice')).toEqual(baseline.get('alice'))
    expect(aligned.get('other-child')).toEqual(dragged.get('other-child'))
    expect(aligned.get('other')).toEqual(dragged.get('other'))
    expect(aligned.get(departmentPositionKey('fa'))).toEqual(dragged.get(departmentPositionKey('fa')))
    expect(baseline).toEqual(snapshots[0])
    expect(dragged).toEqual(snapshots[1])
    expect(aligned.get('other-child')).not.toBe(dragged.get('other-child'))
    expect(alignSpaceTeams(members, teams, dragged, baseline, [])).toEqual(dragged)
  })

  it('reserves each measured row height and centres cards with unequal widths', () => {
    const measured = [
      { ...member('leader', 'fa'), width: 300, height: 185 },
      { ...member('alice', 'fa', 'leader'), width: 220, height: 250 },
      { ...member('bob', 'fa', 'leader'), width: 350, height: 130 },
      { ...member('grandchild', 'fa', 'alice'), width: 260, height: 92 },
    ]
    const teams = buildSpaceTeams(measured)
    const aligned = alignSpaceTeams(measured, teams, new Map([['leader', { x: 70.5, y: 90.25 }]]))
    const rectangle = (id: string) => {
      const person = measured.find(candidate => candidate.id === id)!
      return { ...aligned.get(id)!, width: person.width, height: person.height }
    }
    const leader = rectangle('leader'), alice = rectangle('alice'), bob = rectangle('bob'), grandchild = rectangle('grandchild')
    expect(alice.y).toBe(bob.y)
    expect(alice.y - leader.y - leader.height).toBeGreaterThanOrEqual(40)
    expect(grandchild.y - alice.y - alice.height).toBeGreaterThanOrEqual(40)
    expect(bob.x - alice.x - alice.width).toBeGreaterThanOrEqual(32)
    expect(alice.x + alice.width / 2).toBeCloseTo(grandchild.x + grandchild.width / 2)
    expect(leader.x + leader.width / 2).toBeCloseTo((alice.x + alice.width / 2 + bob.x + bob.width / 2) / 2)
  })

  it('falls back to the current leader point when an anchor is missing or invalid', () => {
    const teams = buildSpaceTeams(members)
    const current = new Map<string, Point>([['leader', { x: 23.75, y: -8.125 }]])
    const aligned = alignSpaceTeams(members, teams, current, new Map([['leader', { x: NaN, y: 10 }]]))
    expect(aligned.get('leader')).toEqual(current.get('leader'))
    for (const person of members) {
      expect(Number.isFinite(aligned.get(person.id)?.x)).toBe(true)
      expect(Number.isFinite(aligned.get(person.id)?.y)).toBe(true)
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

describe('the director rail (design A, 2026-09-12)', () => {
  const members = [
    member('anthony', 'fa', null, 'Anthony'), member('yuny', 'fa', 'anthony', 'Yuny'),
    member('chea', 'fa', null, 'Chea'), member('rachael', 'ir', null, 'Rachael'),
  ]
  const kris = { id: 'kris', name: 'KRIS', departmentIds: ['fa'] }
  const peter = { id: 'peter', name: 'PETER', departmentIds: ['fa', 'ir'] }
  const teams = buildSpaceTeams(members)
  const positions = initialSpacePositions(departments, members, teams)
  const frames = geometryForSpaces(departments, members, teams, positions).departments
  const frameOf = (id: string) => frames.find(frame => frame.id === id)!.bounds
  const highest = Math.min(...frames.map(frame => frame.bounds.y))
  const union = boundsOf(frames.flatMap(frame => rectanglePoints(frame.bounds)))
  const shifted = (id: string | null, delta: Point) => frames.map(frame => id !== null && frame.id !== id ? frame
    : { ...frame, bounds: { ...frame.bounds, x: frame.bounds.x + delta.x, y: frame.bounds.y + delta.y } })

  it('stands every director once in a row above the highest frame, 24 apart, centred over the union of the frames', () => {
    const rail = directorRail([kris, peter], frames)
    expect(rail.cards.map(card => card.id)).toEqual(['kris', 'peter'])
    const [k, p] = rail.cards
    expect(p.y).toBe(k.y)
    expect(p.x - k.x).toBe(NODE_WIDTH + SPACE_DIRECTOR_X_GAP)
    expect((k.x + p.x + NODE_WIDTH) / 2).toBeCloseTo(union.x + union.width / 2, 6)
    expect(k.y + NODE_HEIGHT).toBeLessThan(highest)
    // With one bus level the cards stand 48 above the highest frame, the bus midway.
    const alone = directorRail([kris], frames)
    expect(alone.cards[0].y).toBe(highest - 2 * SPACE_RAIL_GAP - NODE_HEIGHT)
    expect(alone.buses).toHaveLength(1)
    expect(alone.buses[0].y).toBe(highest - SPACE_RAIL_GAP)
    expect(alone.bounds).toEqual({
      x: alone.cards[0].x, y: alone.cards[0].y - SPACE_RAIL_LABEL, width: NODE_WIDTH, height: NODE_HEIGHT + SPACE_RAIL_LABEL,
    })
  })

  it('draws one drop per director and sub-department, joined on one bus per frame that lands on its top edge', () => {
    const rail = directorRail([kris, peter], frames)
    expect(rail.drops.map(drop => `${drop.directorId}:${drop.departmentId}`).sort()).toEqual(['kris:fa', 'peter:fa', 'peter:ir'])
    expect(rail.buses.map(bus => bus.departmentId)).toEqual(['fa', 'ir'])
    const fa = rail.buses.find(bus => bus.departmentId === 'fa')!
    const faDrops = rail.drops.filter(drop => drop.departmentId === 'fa')
    expect(faDrops).toHaveLength(2)
    // Every drop starts at the cards' bottom edge; Fair's two end on the same bar.
    for (const drop of rail.drops) expect(drop.top).toBe(rail.cards[0].y + NODE_HEIGHT)
    for (const drop of faDrops) expect(drop.bottom).toBe(fa.y)
    // The bar spans every drop and the landing; the trunk lands top-centre on the frame.
    const frame = frameOf('fa')
    expect(fa.landing).toEqual({ x: frame.x + frame.width / 2, y: frame.y })
    expect(fa.x1).toBe(Math.min(...faDrops.map(drop => drop.x), fa.landing.x))
    expect(fa.x2).toBe(Math.max(...faDrops.map(drop => drop.x), fa.landing.x))
    expect(fa.y).toBeLessThan(fa.landing.y)
    // Each drop leaves from within its own card.
    for (const drop of rail.drops) {
      const card = rail.cards.find(card => card.id === drop.directorId)!
      expect(drop.x).toBeGreaterThan(card.x)
      expect(drop.x).toBeLessThan(card.x + NODE_WIDTH)
    }
  })

  it('sends a director’s second line out 50 apart, on a bus of its own when the two bars would touch', () => {
    const rail = directorRail([kris, peter], frames)
    const toFair = rail.drops.find(drop => drop.directorId === 'peter' && drop.departmentId === 'fa')!
    const toIr = rail.drops.find(drop => drop.directorId === 'peter' && drop.departmentId === 'ir')!
    // IR stands to the right of Fair, so the IR line leaves to the right.
    expect(toIr.x - toFair.x).toBe(SPACE_RAIL_EXIT)
    const [fa, ir] = rail.buses
    // Fifty pixels is within the clearance: IR's bar takes the level above Fair's.
    expect(ir.y).toBe(fa.y - SPACE_RAIL_STEP)
    expect(toIr.bottom).toBe(ir.y)
    expect(toFair.bottom).toBe(fa.y)
    // The rail rose for the extra level: the top bus 24 below the cards, the lowest 24 above the frames.
    expect(rail.cards[0].y + NODE_HEIGHT + SPACE_RAIL_GAP).toBe(ir.y)
    expect(fa.y + SPACE_RAIL_GAP).toBe(highest)
  })

  it('keeps every bus on one level while the bars are clear of each other, and separates bars that would cross', () => {
    const zara = { id: 'zara', name: 'ZARA', departmentIds: ['ir'] }
    // KRIS's card on the left directs the left frame, ZARA's on the right the right one: two short bars, one level.
    const rail = directorRail([kris, zara], frames)
    const [fa, ir] = rail.buses
    expect(ir.y).toBe(fa.y)
    expect(rail.cards[0].y).toBe(highest - 2 * SPACE_RAIL_GAP - NODE_HEIGHT)
    expect(rail.drops).toHaveLength(2)
    // The other way round the bars would run through each other, so one takes the level above.
    const crossed = directorRail([zara, kris], frames)
    expect(crossed.buses.find(bus => bus.departmentId === 'ir')!.y).toBe(crossed.buses.find(bus => bus.departmentId === 'fa')!.y - SPACE_RAIL_STEP)
  })

  it('follows the frames: moves with all of them, re-centres when one moves, and only the highest sets its height', () => {
    const rail = directorRail([kris, peter], frames)
    const delta = { x: 137.5, y: -61.25 }
    const moved = directorRail([kris, peter], shifted(null, delta))
    moved.cards.forEach((card, index) => {
      expect(card.x).toBeCloseTo(rail.cards[index].x + delta.x, 6)
      expect(card.y).toBeCloseTo(rail.cards[index].y + delta.y, 6)
    })
    moved.buses.forEach((bus, index) => {
      expect(bus.y).toBeCloseTo(rail.buses[index].y + delta.y, 6)
      expect(bus.landing.x).toBeCloseTo(rail.buses[index].landing.x + delta.x, 6)
      expect(bus.landing.y).toBeCloseTo(rail.buses[index].landing.y + delta.y, 6)
    })
    // IR dragged lower: its landing follows and its trunk lengthens; Fair, still the highest, keeps the rail where it is.
    const lowered = directorRail([kris, peter], shifted('ir', { x: 0, y: 300 }))
    expect(lowered.cards.map(card => card.y)).toEqual(rail.cards.map(card => card.y))
    const before = rail.buses.find(bus => bus.departmentId === 'ir')!
    const after = lowered.buses.find(bus => bus.departmentId === 'ir')!
    expect(after.landing.y).toBe(before.landing.y + 300)
    expect(after.y).toBe(before.y)
  })

  it('is empty without directors or frames, and leaves out a director whose departments have no frame', () => {
    expect(directorRail([], frames)).toEqual({ cards: [], drops: [], buses: [], bounds: null })
    expect(directorRail([kris, peter], [])).toEqual({ cards: [], drops: [], buses: [], bounds: null })
    const rail = directorRail([kris, { id: 'faa-head', name: 'ALEX', departmentIds: ['faa'] }], frames)
    expect(rail.cards.map(card => card.id)).toEqual(['kris'])
    expect(rail.drops).toHaveLength(1)
    expect(rail.buses).toHaveLength(1)
  })
})
