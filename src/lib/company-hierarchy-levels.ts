import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import { type Bounds, type Point } from './hierarchy-spaces'
import {
  buildSpaceTeams, departmentPositionKey, geometryForSpaces,
  SPACE_DEPARTMENT_GAP, SPACE_TEAM_GAP,
  type SpaceAnchor, type SpaceDepartment, type SpaceMember,
} from './hierarchy-space-layout'
import { type CompanyHierarchyLeader } from './company-hierarchy-layout'

/** Full company role roster, including roles hidden by collapse or filtering. */
export interface CompanyLevelRole {
  id: string
  departmentId: string
  levelRank: number | null
  isDepartmentHead: boolean
  /** Keep the latest measured height here when this role becomes hidden. */
  height?: number
}

export interface CompanyLevelRow {
  key: string
  rank: number | null
  label: string
  y: number
  height: number
}

export interface CompanyHierarchyLevelOptions {
  roles: readonly CompanyLevelRole[]
  members: readonly SpaceMember[]
  leaders?: readonly CompanyHierarchyLeader[]
  departments: readonly SpaceDepartment[]
  positions: ReadonlyMap<string, Point>
  /** Defaults to true when all department members are overview summaries. */
  overview?: boolean
  anchor?: SpaceAnchor
}

// Leave room for a following department/team heading above its first card.
export const COMPANY_LEVEL_ROW_GAP = 160
export const COMPANY_LEVEL_CARD_GAP = 44
const HEADS = 'department-heads'
const UNASSIGNED = 'unassigned'
const isSummary = (id: string) => id.startsWith('summary:')
const dimension = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
const rankOf = (rank: number | null | undefined) => typeof rank === 'number' && Number.isFinite(rank) ? rank : null
const rowKey = (role: Pick<CompanyLevelRole, 'levelRank' | 'isDepartmentHead'> | undefined) => {
  const rank = rankOf(role?.levelRank)
  return rank !== null ? `level:${rank}` : role?.isDepartmentHead ? HEADS : UNASSIGNED
}

function rectangle(member: SpaceMember, positions: ReadonlyMap<string, Point>): Bounds {
  return { ...positions.get(member.id)!, width: dimension(member.width, NODE_WIDTH), height: dimension(member.height, NODE_HEIGHT) }
}

interface HorizontalItem {
  id: string
  bounds: Bounds
  memberIds: readonly string[]
  department?: boolean
}

function translateX(positions: Map<string, Point>, ids: readonly string[], amount: number) {
  if (amount === 0) return
  for (const id of ids) {
    const point = positions.get(id)
    if (point) positions.set(id, { x: point.x + amount, y: point.y })
  }
}

/** Separate whole groups along X; the level coordinate never participates. */
function packHorizontally(
  positions: Map<string, Point>, source: HorizontalItem[], gap: number,
  anchorId?: string, alwaysSeparate = false,
) {
  const items = source.map((item, index) => ({ ...item, bounds: { ...item.bounds }, index }))
    .sort((a, b) => a.bounds.x - b.bounds.x || a.index - b.index)
  if (!items.length) return
  const anchorIndex = Math.max(0, items.findIndex(item => item.id === anchorId))
  const conflicts = (a: HorizontalItem, b: HorizontalItem) => alwaysSeparate || (a.department && b.department)
    || (a.bounds.y < b.bounds.y + b.bounds.height && b.bounds.y < a.bounds.y + a.bounds.height)
  const place = (item: typeof items[number], x: number) => {
    translateX(positions, item.memberIds, x - item.bounds.x)
    item.bounds.x = x
  }
  const placed = [items[anchorIndex]]
  for (let index = anchorIndex - 1; index >= 0; index--) {
    const item = items[index]
    let x = item.bounds.x
    for (const other of placed) if (conflicts(item, other)) x = Math.min(x, other.bounds.x - gap - item.bounds.width)
    place(item, x)
    placed.push(item)
  }
  for (let index = anchorIndex + 1; index < items.length; index++) {
    const item = items[index]
    let x = item.bounds.x
    for (const other of placed) if (conflicts(item, other)) x = Math.max(x, other.bounds.x + other.bounds.width + gap)
    place(item, x)
    placed.push(item)
  }
}

/**
 * Project visible people onto the full roster's L bands, then settle only X.
 * Parent IDs are never consulted for height or changed: a report with a higher
 * L rank correctly appears above its manager, and peers remain on the same row.
 */
export function applyCompanyHierarchyLevels({
  roles, members, leaders = [], departments, positions, overview, anchor = {},
}: CompanyHierarchyLevelOptions): { positions: Map<string, Point>; rows: CompanyLevelRow[] } {
  const next = new Map([...positions].map(([id, point]) => [id, {
    x: Number.isFinite(point.x) ? point.x : 0,
    y: Number.isFinite(point.y) ? point.y : 0,
  }]))
  const people = [...members, ...leaders]
  const visiblePeople = new Map(people.filter(person => !isSummary(person.id)).map(person => [person.id, person]))
  const allRoles = new Map(roles.filter(role => !isSummary(role.id)).map(role => [role.id, role]))
  // Unknown visible roles still get an explicit unassigned row instead of NaN.
  for (const person of visiblePeople.values()) if (!allRoles.has(person.id)) allRoles.set(person.id, {
    id: person.id, departmentId: person.departmentId, levelRank: null, isDepartmentHead: false,
  })
  const ranks = [...new Set([...allRoles.values()].flatMap(role => {
    const rank = rankOf(role.levelRank)
    return rank === null ? [] : [rank]
  }))].sort((a, b) => b - a)
  const hasHeads = [...allRoles.values()].some(role => rowKey(role) === HEADS)
  const hasUnassigned = [...allRoles.values()].some(role => rowKey(role) === UNASSIGNED)
  const rows: CompanyLevelRow[] = [
    ...(hasHeads ? [{ key: HEADS, rank: null, label: 'Department heads', y: 0, height: NODE_HEIGHT }] : []),
    ...ranks.map(rank => ({ key: `level:${rank}`, rank, label: `L${rank}`, y: 0, height: NODE_HEIGHT })),
    ...(hasUnassigned ? [{ key: UNASSIGNED, rank: null, label: 'Unassigned', y: 0, height: NODE_HEIGHT }] : []),
  ]
  const byRow = new Map(rows.map(row => [row.key, row]))
  for (const role of allRoles.values()) {
    const row = byRow.get(rowKey(role))!
    row.height = Math.max(row.height, dimension(role.height, NODE_HEIGHT), dimension(visiblePeople.get(role.id)?.height, NODE_HEIGHT))
  }
  let y = 0
  for (const row of rows) {
    row.y = y
    y += row.height + COMPANY_LEVEL_ROW_GAP
  }
  for (const person of visiblePeople.values()) {
    next.set(person.id, { x: next.get(person.id)?.x ?? 0, y: byRow.get(rowKey(allRoles.get(person.id)))!.y })
  }

  const compactOverview = overview ?? (members.length > 0 && members.every(member => isSummary(member.id)))
  const leaderIds = new Set(leaders.map(leader => leader.id))
  const overviewY = visiblePeople.size ? Math.max(...[...visiblePeople.values()].map(person =>
    next.get(person.id)!.y + dimension(person.height, NODE_HEIGHT))) + COMPANY_LEVEL_ROW_GAP : 0
  for (const summary of members.filter(member => isSummary(member.id))) {
    const localRows = [...allRoles.values()].filter(role => role.departmentId === summary.departmentId
      && !role.isDepartmentHead && !leaderIds.has(role.id)).map(role => byRow.get(rowKey(role))!.y)
    const summaryY = compactOverview ? overviewY : localRows.length ? Math.min(...localRows) : rows[0]?.y ?? 0
    next.set(summary.id, { x: next.get(summary.id)?.x ?? 0, y: summaryY })
  }
  for (const department of departments) {
    const key = departmentPositionKey(department.id)
    if (!next.has(key)) next.set(key, { x: 0, y: 0 })
  }

  const teams = buildSpaceTeams(members)
  const byMember = new Map(members.map(member => [member.id, member]))
  for (const team of teams) {
    packHorizontally(next, team.memberIds.map(id => ({
      id, bounds: rectangle(byMember.get(id)!, next), memberIds: [id],
    })), COMPANY_LEVEL_CARD_GAP)
  }
  let geometry = geometryForSpaces(departments, members, teams, next)
  for (const department of geometry.departments) {
    packHorizontally(next, geometry.teams.filter(team => team.departmentId === department.id).map(team => ({
      id: team.id, bounds: team.bounds, memberIds: team.memberIds,
    })), SPACE_TEAM_GAP, anchor.teamId, true)
  }
  geometry = geometryForSpaces(departments, members, teams, next)
  const populated = geometry.departments.filter(department => members.some(member => member.departmentId === department.id))
  const emptyY = populated.length ? Math.min(...populated.map(department => department.bounds.y)) : rows[0]?.y ?? 0
  for (const department of geometry.departments) {
    next.set(departmentPositionKey(department.id), {
      x: department.bounds.x,
      y: members.some(member => member.departmentId === department.id) ? department.bounds.y : emptyY,
    })
  }
  geometry = geometryForSpaces(departments, members, teams, next)
  const departmentAnchor = anchor.departmentId ?? teams.find(team => team.id === anchor.teamId)?.departmentId
  // Panels and leaders share this pass: a low-ranked manager cannot overlap a
  // card in a different department merely because it used to be on the rail.
  packHorizontally(next, [
    ...geometry.departments.map(department => ({
      id: `department:${department.id}`, bounds: department.bounds, department: true,
      memberIds: [...members.filter(member => member.departmentId === department.id).map(member => member.id), departmentPositionKey(department.id)],
    })),
    ...leaders.map(leader => ({ id: `leader:${leader.id}`, bounds: rectangle(leader, next), memberIds: [leader.id] })),
  ], SPACE_DEPARTMENT_GAP, departmentAnchor ? `department:${departmentAnchor}` : undefined)
  return { positions: next, rows }
}
