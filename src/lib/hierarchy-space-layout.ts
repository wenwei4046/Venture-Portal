import { treeGroups } from './commission/chart-moves'
import { layoutTree, NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import {
  boundsOf,
  envelopeOfRects,
  packPolygons,
  rectanglePoints,
  type Bounds,
  type Point,
} from './hierarchy-spaces'

/** IDs identify a department membership, not the person shared by several roles. */
export interface SpaceMember {
  id: string
  departmentId: string
  parentId: string | null
  name: string
  width?: number
  height?: number
}

export interface SpaceDepartment {
  id: string
  name: string
}

export interface SpaceTeam {
  id: string
  departmentId: string
  leaderId: string
  label: string
  memberIds: string[]
}

export interface SpaceTeamGeometry extends SpaceTeam {
  points: Point[]
  bounds: Bounds
  /** Top-left position of the team's title in world coordinates. */
  labelPosition: Point
}

export interface SpaceGeometry {
  teams: SpaceTeamGeometry[]
  departments: Array<SpaceDepartment & { bounds: Bounds }>
}

export interface SpaceAnchor {
  teamId?: string
  departmentId?: string
}

export const SPACE_TEAM_GAP = 42
export const SPACE_DEPARTMENT_GAP = 64
export const SPACE_DEPARTMENT_PADDING = 28
export const SPACE_DEPARTMENT_HEADER = 44
const TEAM_PADDING = 24
const TEAM_LABEL_HEIGHT = 24
const EMPTY_DEPARTMENT_WIDTH = 400
const EMPTY_DEPARTMENT_HEIGHT = 220

/** Stored alongside member positions, so an empty department can be dragged too. */
export function departmentPositionKey(id: string): string {
  return `space-department:${id}`
}

function allDepartments(
  departments: readonly SpaceDepartment[],
  members: readonly SpaceMember[],
): SpaceDepartment[] {
  const result = new Map(departments.map(department => [department.id, department]))
  for (const member of members) {
    if (!result.has(member.departmentId)) {
      result.set(member.departmentId, { id: member.departmentId, name: member.departmentId })
    }
  }
  return [...result.values()]
}

function finiteDimension(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function memberRect(member: SpaceMember, position: Point): Bounds {
  return {
    ...position,
    width: finiteDimension(member.width, NODE_WIDTH),
    height: finiteDimension(member.height, NODE_HEIGHT),
  }
}

export function buildSpaceTeams(members: readonly SpaceMember[]): SpaceTeam[] {
  const byDepartment = new Map<string, Map<string, SpaceMember>>()
  for (const member of members) {
    let department = byDepartment.get(member.departmentId)
    if (!department) {
      department = new Map()
      byDepartment.set(member.departmentId, department)
    }
    department.set(member.id, member)
  }
  return [...byDepartment.entries()].flatMap(([departmentId, byId]) => (
    treeGroups([...byId.values()].map(member => ({
      id: member.id,
      parentId: member.parentId,
      label: member.name,
    }))).map(group => ({
      id: `team:${departmentId}:${group.rootId}`,
      departmentId,
      leaderId: group.rootId,
      label: `${byId.get(group.rootId)!.name} team`,
      memberIds: group.members.map(member => member.id),
    }))
  ))
}

/** The same bottom-to-top orthogonal route used by the rendered chart. */
export function spaceConnectionPoints(from: Bounds, to: Bounds): Point[] {
  const start = { x: from.x + from.width / 2, y: from.y + from.height }
  const end = { x: to.x + to.width / 2, y: to.y }
  const middleY = (start.y + end.y) / 2
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end]
}

function teamGeometry(
  team: SpaceTeam,
  byId: ReadonlyMap<string, SpaceMember>,
  positions: ReadonlyMap<string, Point>,
): SpaceTeamGeometry | null {
  const rectangles = new Map<string, Bounds>()
  for (const id of team.memberIds) {
    const member = byId.get(id)
    const position = positions.get(id)
    if (member && position) rectangles.set(id, memberRect(member, position))
  }
  if (!rectangles.size) return null

  const cardBounds = boundsOf([...rectangles.values()].flatMap(rectanglePoints))
  const leader = rectangles.get(team.leaderId) ?? rectangles.values().next().value!
  const labelPosition = { x: leader.x, y: cardBounds.y - TEAM_LABEL_HEIGHT - 14 }
  const envelopeRects: Bounds[] = [...rectangles.values(), {
    ...labelPosition,
    width: Math.max(140, Math.min(360, team.label.length * 7 + 28)),
    height: TEAM_LABEL_HEIGHT,
  }]

  for (const [id, rectangle] of rectangles) {
    const parentId = byId.get(id)?.parentId
    const parent = parentId ? rectangles.get(parentId) : undefined
    if (!parent) continue
    for (const point of spaceConnectionPoints(parent, rectangle)) {
      // A small rectangle accounts for the line stroke before envelope padding.
      envelopeRects.push({ x: point.x - 1, y: point.y - 1, width: 2, height: 2 })
    }
  }
  const points = envelopeOfRects(envelopeRects, TEAM_PADDING)
  return { ...team, points, bounds: boundsOf(points), labelPosition }
}

export function geometryForSpaces(
  departments: readonly SpaceDepartment[],
  members: readonly SpaceMember[],
  teams: readonly SpaceTeam[],
  positions: ReadonlyMap<string, Point>,
): SpaceGeometry {
  const byId = new Map(members.map(member => [member.id, member]))
  const teamShapes = teams.map(team => teamGeometry(team, byId, positions))
    .filter((team): team is SpaceTeamGeometry => team !== null)
  const departmentShapes = allDepartments(departments, members).map((department, index) => {
    const contents = teamShapes.filter(team => team.departmentId === department.id)
    if (!contents.length) {
      const origin = positions.get(departmentPositionKey(department.id)) ?? {
        x: (index % 2) * (EMPTY_DEPARTMENT_WIDTH + SPACE_DEPARTMENT_GAP),
        y: Math.floor(index / 2) * (EMPTY_DEPARTMENT_HEIGHT + SPACE_DEPARTMENT_GAP),
      }
      return { ...department, bounds: {
        ...origin, width: EMPTY_DEPARTMENT_WIDTH, height: EMPTY_DEPARTMENT_HEIGHT,
      } }
    }
    const contentBounds = boundsOf(contents.flatMap(team => rectanglePoints(team.bounds)))
    return { ...department, bounds: {
      x: contentBounds.x - SPACE_DEPARTMENT_PADDING,
      y: contentBounds.y - SPACE_DEPARTMENT_PADDING - SPACE_DEPARTMENT_HEADER,
      width: contentBounds.width + SPACE_DEPARTMENT_PADDING * 2,
      height: contentBounds.height + SPACE_DEPARTMENT_PADDING * 2 + SPACE_DEPARTMENT_HEADER,
    } }
  })
  return { teams: teamShapes, departments: departmentShapes }
}

function translatePositions(positions: Map<string, Point>, ids: Iterable<string>, delta: Point): void {
  if (delta.x === 0 && delta.y === 0) return
  for (const id of ids) {
    const point = positions.get(id)
    if (point) positions.set(id, { x: point.x + delta.x, y: point.y + delta.y })
  }
}

/** A readable starting layout; later collision resolution never calls this reset. */
export function initialSpacePositions(
  departments: readonly SpaceDepartment[],
  members: readonly SpaceMember[],
  teams: readonly SpaceTeam[] = buildSpaceTeams(members),
): Map<string, Point> {
  const positions = new Map<string, Point>()
  const byId = new Map(members.map(member => [member.id, member]))
  const departmentList = allDepartments(departments, members)
  const departmentSizes = new Map<string, Bounds>()

  for (const department of departmentList) {
    let cursorX = 0
    let cursorY = 0
    let rowHeight = 0
    let rowCount = 0
    for (const team of teams.filter(candidate => candidate.departmentId === department.id)) {
      const teamMembers = team.memberIds.map(id => byId.get(id)).filter((member): member is SpaceMember => !!member)
      const memberIds = new Set(teamMembers.map(member => member.id))
      const layout = layoutTree(teamMembers.map(member => ({
        id: member.id,
        parentId: member.parentId && memberIds.has(member.parentId) ? member.parentId : null,
        label: member.name,
      })))
      const scaleX = Math.max(1, ...teamMembers.map(member => finiteDimension(member.width, NODE_WIDTH) / NODE_WIDTH))
      const scaleY = Math.max(1, ...teamMembers.map(member => finiteDimension(member.height, NODE_HEIGHT) / NODE_HEIGHT))
      for (const [id, point] of layout.positions) {
        positions.set(id, { x: point.x * scaleX, y: point.y * scaleY })
      }
      const shape = teamGeometry(team, byId, positions)
      if (!shape) continue
      if (rowCount >= 2 || (rowCount > 0 && cursorX + shape.bounds.width > 1200)) {
        cursorX = 0
        cursorY += rowHeight + SPACE_TEAM_GAP
        rowHeight = 0
        rowCount = 0
      }
      translatePositions(positions, team.memberIds, {
        x: cursorX - shape.bounds.x,
        y: cursorY - shape.bounds.y,
      })
      cursorX += shape.bounds.width + SPACE_TEAM_GAP
      rowHeight = Math.max(rowHeight, shape.bounds.height)
      rowCount++
    }
    positions.set(departmentPositionKey(department.id), { x: 0, y: 0 })
    const shape = geometryForSpaces([department], members.filter(member => member.departmentId === department.id),
      teams.filter(team => team.departmentId === department.id), positions).departments[0]
    departmentSizes.set(department.id, shape.bounds)
  }

  let rowY = 0
  for (let index = 0; index < departmentList.length; index += 2) {
    let columnX = 0
    let rowHeight = 0
    for (const department of departmentList.slice(index, index + 2)) {
      const bounds = departmentSizes.get(department.id)!
      translatePositions(positions, members.filter(member => member.departmentId === department.id).map(member => member.id), {
        x: columnX - bounds.x, y: rowY - bounds.y,
      })
      positions.set(departmentPositionKey(department.id), { x: columnX, y: rowY })
      columnX += bounds.width + SPACE_DEPARTMENT_GAP
      rowHeight = Math.max(rowHeight, bounds.height)
    }
    rowY += rowHeight + SPACE_DEPARTMENT_GAP
  }
  return positions
}

/**
 * Resolve on release: first move whole sibling teams, then whole departments.
 * The user's anchored group stays put and no member's reporting line changes.
 */
export function resolveSpaceOverlaps(
  departments: readonly SpaceDepartment[],
  members: readonly SpaceMember[],
  teams: readonly SpaceTeam[],
  positions: ReadonlyMap<string, Point>,
  anchor: SpaceAnchor = {},
): Map<string, Point> {
  const next = new Map([...positions].map(([id, point]) => [id, { ...point }]))
  const departmentList = allDepartments(departments, members)
  for (const department of departmentList) {
    // A whole-section drag must not rearrange the section's contents.
    if (anchor.departmentId === department.id && !anchor.teamId) continue
    const shapes = geometryForSpaces(departments, members, teams, next).teams
      .filter(team => team.departmentId === department.id)
    const offsets = packPolygons(shapes.map(team => ({ id: team.id, points: team.points })),
      anchor.teamId, SPACE_TEAM_GAP)
    for (const team of shapes) {
      translatePositions(next, team.memberIds, offsets[team.id] ?? { x: 0, y: 0 })
    }
  }

  const departmentShapes = geometryForSpaces(departments, members, teams, next).departments
  const anchorDepartment = anchor.departmentId ?? teams.find(team => team.id === anchor.teamId)?.departmentId
  const offsets = packPolygons(departmentShapes.map(department => ({
    id: department.id, points: rectanglePoints(department.bounds),
  })), anchorDepartment, SPACE_DEPARTMENT_GAP)
  for (const department of departmentShapes) {
    if (!next.has(departmentPositionKey(department.id))) {
      next.set(departmentPositionKey(department.id), { x: department.bounds.x, y: department.bounds.y })
    }
    translatePositions(next, [
      ...members.filter(member => member.departmentId === department.id).map(member => member.id),
      departmentPositionKey(department.id),
    ], offsets[department.id] ?? { x: 0, y: 0 })
  }
  return next
}
