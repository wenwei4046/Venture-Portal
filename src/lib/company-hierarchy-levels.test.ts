import { describe, expect, it } from 'vitest'
import {
  applyCompanyHierarchyLevels, COMPANY_LEVEL_CARD_GAP, COMPANY_LEVEL_ROW_GAP,
  type CompanyLevelRole,
} from './company-hierarchy-levels'
import { initialCompanyHierarchyPositions } from './company-hierarchy-layout'
import { buildSpaceTeams, departmentPositionKey, geometryForSpaces, type SpaceMember } from './hierarchy-space-layout'
import { collisionOffset, rectanglePoints } from './hierarchy-spaces'
import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'

const departments = [
  { id: 'Finance', name: 'Finance' }, { id: 'HR', name: 'HR' },
  { id: 'Revenue::Fair', name: 'Revenue · Fair' }, { id: 'empty', name: 'Empty' },
]
const member = (id: string, departmentId: string, parentId: string | null = null, height = NODE_HEIGHT): SpaceMember => (
  { id, name: id, departmentId, parentId, width: NODE_WIDTH, height }
)
const role = (person: SpaceMember, levelRank: number | null, isDepartmentHead = false): CompanyLevelRole => ({
  id: person.id, departmentId: person.departmentId, levelRank, isDepartmentHead, height: person.height,
})
const rectangle = (person: SpaceMember, positions: ReturnType<typeof initialCompanyHierarchyPositions>) => ({
  ...positions.get(person.id)!, width: person.width ?? NODE_WIDTH, height: person.height ?? NODE_HEIGHT,
})

describe('company hierarchy global L bands', () => {
  it('aligns L8, L3 and L1 across departments and leaders regardless of reporting depth', () => {
    const leaders = [member('head', 'Director'), member('ranked-manager', 'Finance')]
    const members = [
      member('finance-manager', 'Finance', 'ranked-manager'),
      member('same-level-report', 'Finance', 'finance-manager'),
      member('senior-report', 'Finance', 'same-level-report'),
      member('hr-root', 'HR'), member('hr-child', 'HR', 'hr-root'),
      member('unassigned-root', 'Revenue::Fair'),
    ]
    const roles = [role(leaders[0], null, true), role(leaders[1], 3),
      ...members.map((person, index) => role(person, [3, 3, 8, 1, 3, null][index])),
    ]
    const positions = initialCompanyHierarchyPositions(departments, members, leaders)
    const result = applyCompanyHierarchyLevels({ departments, members, leaders, roles, positions })
    const row = (rank: number | null) => result.rows.find(row => row.rank === rank && row.key !== 'department-heads')!
    expect(result.rows.map(row => row.label)).toEqual(['Department heads', 'L8', 'L3', 'L1', 'Unassigned'])
    for (const id of ['ranked-manager', 'finance-manager', 'same-level-report', 'hr-child']) {
      expect(result.positions.get(id)!.y).toBe(row(3).y)
    }
    expect(result.positions.get('senior-report')!.y).toBe(row(8).y)
    expect(result.positions.get('senior-report')!.y).toBeLessThan(result.positions.get('same-level-report')!.y)
    expect(result.positions.get('hr-child')!.y).toBeLessThan(result.positions.get('hr-root')!.y)
    expect(result.positions.get('head')!.y).toBeLessThan(row(8).y)
    expect(result.positions.get('unassigned-root')!.y).toBeGreaterThan(row(1).y)
    for (let first = 0; first < members.length + leaders.length; first++) {
      const all = [...members, ...leaders]
      for (let second = first + 1; second < all.length; second++) {
        expect(collisionOffset(rectanglePoints(rectangle(all[first], result.positions)), rectanglePoints(rectangle(all[second], result.positions)), 0)).toBeNull()
      }
    }
  })

  it('separates same-L parent and child chains horizontally without lowering any report', () => {
    const members = [member('a', 'Finance'), member('b', 'Finance', 'a'), member('c', 'Finance', 'b')]
    const roles = members.map(person => role(person, 3))
    const base = initialCompanyHierarchyPositions(departments, members)
    expect(base.get('a')!.x).toBe(base.get('b')!.x)
    const result = applyCompanyHierarchyLevels({ departments, members, roles, positions: base })
    expect(new Set(members.map(person => result.positions.get(person.id)!.y)).size).toBe(1)
    const xs = members.map(person => result.positions.get(person.id)!.x).sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(NODE_WIDTH + COMPANY_LEVEL_CARD_GAP)
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(NODE_WIDTH + COMPANY_LEVEL_CARD_GAP)
    expect(applyCompanyHierarchyLevels({ departments, members, roles, positions: result.positions }).positions).toEqual(result.positions)
  })

  it('uses the full role roster so collapse and filtering keep rank bands fixed', () => {
    const members = [member('top', 'Finance', null, 250), member('middle', 'HR', null, 320), member('bottom', 'Revenue::Fair')]
    const roles = members.map((person, index) => role(person, [8, 3, 1][index]))
    const full = applyCompanyHierarchyLevels({ departments, members, roles,
      positions: initialCompanyHierarchyPositions(departments, members) })
    const hidden = members.slice(2)
    const collapsed = applyCompanyHierarchyLevels({ departments: departments.slice(2), members: hidden, roles,
      positions: initialCompanyHierarchyPositions(departments.slice(2), hidden) })
    expect(collapsed.rows).toEqual(full.rows)
    expect(collapsed.positions.get('bottom')!.y).toBe(full.positions.get('bottom')!.y)
    expect(full.rows[1].y - full.rows[0].y).toBe(250 + COMPANY_LEVEL_ROW_GAP)
    expect(full.rows[2].y - full.rows[1].y).toBe(320 + COMPANY_LEVEL_ROW_GAP)
  })

  it('keeps secondary roles at their own L rank rather than their other role’s rank', () => {
    const primary = member('staff:primary', 'HR')
    const secondary = member('staff:revenue:fair', 'Revenue::Fair')
    const members = [primary, secondary]
    const result = applyCompanyHierarchyLevels({ departments, members, roles: [role(primary, 8), role(secondary, 1)],
      positions: initialCompanyHierarchyPositions(departments, members) })
    expect(result.positions.get(primary.id)!.y).toBe(result.rows.find(row => row.rank === 8)!.y)
    expect(result.positions.get(secondary.id)!.y).toBe(result.rows.find(row => row.rank === 1)!.y)
    expect(result.positions.get(primary.id)!.y).toBeLessThan(result.positions.get(secondary.id)!.y)
  })

  it('reserves measured card heights and gives unknown ranks explicit finite bands even for cycles', () => {
    const members = [member('cycle-a', 'Finance', 'cycle-b', 380), member('cycle-b', 'Finance', 'cycle-a'), member('invalid', 'HR')]
    const leaders = [member('unranked-head', 'Director', 'cycle-a')]
    const roles = [{ ...role(members[0], 3), height: NODE_HEIGHT }, role(members[1], 1), role(members[2], NaN), role(leaders[0], null, true)]
    const result = applyCompanyHierarchyLevels({ departments, members, leaders, roles,
      positions: initialCompanyHierarchyPositions(departments, members, leaders) })
    expect(result.positions.get('cycle-b')!.y - result.positions.get('cycle-a')!.y)
      .toBeGreaterThanOrEqual(380 + COMPANY_LEVEL_ROW_GAP)
    expect(result.rows.at(-1)!.label).toBe('Unassigned')
    expect(result.positions.get('invalid')!.y).toBe(result.rows.at(-1)!.y)
    for (const point of result.positions.values()) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
    expect(applyCompanyHierarchyLevels({ departments: [], members: [], roles: [], positions: new Map() }))
      .toEqual({ positions: new Map(), rows: [] })
  })

  it('keeps summaries outside the ladder and places an all-collapsed overview compactly', () => {
    const actual = [member('high', 'Finance'), member('middle', 'HR'), member('low', 'Revenue::Fair')]
    const head = member('head', 'Director')
    const roles = [role(head, null, true), ...actual.map((person, index) => role(person, [8, 3, 1][index]))]
    const summaries = departments.slice(0, 3).map(department => member(`summary:${department.id}`, department.id, null, 148))
    const result = applyCompanyHierarchyLevels({ departments, members: summaries, leaders: [head], roles,
      positions: initialCompanyHierarchyPositions(departments, summaries, [head]) })
    expect(result.rows.map(row => row.label)).toEqual(['Department heads', 'L8', 'L3', 'L1'])
    expect(new Set(summaries.map(summary => result.positions.get(summary.id)!.y)).size).toBe(1)
    expect(result.positions.get(summaries[0].id)!.y).toBeLessThan(result.rows.find(row => row.rank === 1)!.y)
    const mixed = [summaries[0], actual[1], actual[2]]
    const expanded = applyCompanyHierarchyLevels({ departments, members: mixed, leaders: [head], roles,
      positions: initialCompanyHierarchyPositions(departments, mixed, [head]) })
    expect(expanded.rows).toEqual(result.rows)
    expect(expanded.positions.get(summaries[0].id)!.y).toBe(expanded.rows.find(row => row.rank === 8)!.y)
  })

  it('packs department frames and leaders only along X while keeping ordered zones and inputs intact', () => {
    const leaders = [member('ranked-leader', 'Director')]
    const members = [member('finance-a', 'Finance'), member('finance-b', 'Finance', 'finance-a'),
      member('hr-a', 'HR'), member('hr-b', 'HR'), member('fair-a', 'Revenue::Fair')]
    const roles = [...members, ...leaders].map(person => role(person, 3))
    const positions = initialCompanyHierarchyPositions(departments, members, leaders)
    const before = structuredClone({ members, leaders, roles, departments, positions })
    const result = applyCompanyHierarchyLevels({ departments, members, leaders, roles, positions })
    const geometry = geometryForSpaces(departments, members, buildSpaceTeams(members), result.positions)
    for (let index = 1; index < geometry.departments.length; index++) {
      const previous = geometry.departments[index - 1].bounds
      expect(geometry.departments[index].bounds.x).toBeGreaterThan(previous.x + previous.width)
    }
    for (const department of geometry.departments) {
      expect(collisionOffset(rectanglePoints(department.bounds), rectanglePoints(rectangle(leaders[0], result.positions)), 0)).toBeNull()
      expect(result.positions.has(departmentPositionKey(department.id))).toBe(true)
    }
    expect(new Set([...members, ...leaders].map(person => result.positions.get(person.id)!.y)).size).toBe(1)
    expect({ members, leaders, roles, departments, positions }).toEqual(before)
  })

  it('preserves already-clear X coordinates and fixes an anchored department in place on lateral settling', () => {
    const members = [member('a', 'Finance'), member('b', 'Finance', 'a'), member('c', 'HR')]
    const roles = members.map((person, index) => role(person, [8, 3, 1][index]))
    const base = initialCompanyHierarchyPositions(departments, members)
    const initial = applyCompanyHierarchyLevels({ departments, members, roles, positions: base })
    expect(initial.positions.get('a')!.x).toBe(base.get('a')!.x)
    expect(initial.positions.get('b')!.x).toBe(base.get('b')!.x)
    const dragged = new Map(initial.positions)
    const targetX = initial.positions.get('a')!.x + 20
    dragged.set('c', { x: targetX, y: -1234 })
    const result = applyCompanyHierarchyLevels({ departments, members, roles, positions: dragged, anchor: { departmentId: 'HR' } })
    expect(result.positions.get('c')!.x).toBe(targetX)
    expect(result.positions.get('c')!.y).toBe(initial.positions.get('c')!.y)
    for (const person of members) expect(result.positions.get(person.id)!.y).toBe(initial.positions.get(person.id)!.y)
  })
})
