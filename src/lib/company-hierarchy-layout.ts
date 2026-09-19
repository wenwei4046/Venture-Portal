import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import { boundsOf, packPolygons, rectanglePoints, type Bounds, type Point } from './hierarchy-spaces'
import {
  alignSpaceTeams, buildSpaceTeams, departmentPositionKey, geometryForSpaces, initialSpacePositions,
  resolveSpaceOverlaps, SPACE_TEAM_GAP,
  type SpaceAnchor, type SpaceDepartment, type SpaceMember,
} from './hierarchy-space-layout'

export const COMPANY_LEADERSHIP_GAP = 100
const LEADERSHIP_ZONE = 'company-leadership-layout'
const leadershipDepartment = [{ id: LEADERSHIP_ZONE, name: 'Management' }]

export interface CompanyHierarchyLeader extends SpaceMember {
  /** All zones this person really directs, including shared directorships. */
  relatedDepartmentIds?: readonly string[]
}

function parentDepartment(zoneId: string): string {
  try {
    const pair: unknown = JSON.parse(zoneId)
    if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string'
      && (pair[1] === null || typeof pair[1] === 'string')) return pair[0]
  } catch { /* Older zone IDs were plain department names or department::sub. */ }
  return zoneId.split('::')[0]
}

function leaderMembers(leaders: readonly SpaceMember[]): SpaceMember[] {
  // A layout-only shared zone lets real reporting relations between leaders
  // cross their departments. No synthetic person or reporting edge is created.
  return leaders.map(leader => ({ ...leader, departmentId: LEADERSHIP_ZONE }))
}

function cardBounds(member: SpaceMember, point: Point): Bounds {
  return { ...point, width: member.width && Number.isFinite(member.width) && member.width > 0 ? member.width : NODE_WIDTH,
    height: member.height && Number.isFinite(member.height) && member.height > 0 ? member.height : NODE_HEIGHT }
}

export function companyLeadershipBounds(
  leaders: readonly SpaceMember[], positions: ReadonlyMap<string, Point>,
): Bounds | null {
  const cards = leaders.flatMap(leader => {
    const point = positions.get(leader.id)
    return point ? rectanglePoints(cardBounds(leader, point)) : []
  })
  return cards.length ? boundsOf(cards) : null
}

function translate(positions: Map<string, Point>, ids: Iterable<string>, dx: number, dy: number) {
  for (const id of ids) {
    const point = positions.get(id)
    if (point) positions.set(id, { x: point.x + dx, y: point.y + dy })
  }
}

/** Real management trees above one row of department zones and local teams. */
export function initialCompanyHierarchyPositions(
  departments: readonly SpaceDepartment[],
  members: readonly SpaceMember[],
  leaders: readonly CompanyHierarchyLeader[] = [],
): Map<string, Point> {
  const teams = buildSpaceTeams(members)
  const positions = initialSpacePositions(departments, members, teams, 'horizontal')
  if (!leaders.length) return positions

  const railMembers = leaderMembers(leaders)
  const railTeams = buildSpaceTeams(railMembers)
  const railPositions = initialSpacePositions(leadershipDepartment, railMembers, railTeams, 'horizontal')
  const zones = geometryForSpaces(departments, members, teams, positions).departments
  const allPeople = new Map([...members, ...leaders].map(person => [person.id, person]))
  const leaderById = new Map(leaders.map(leader => [leader.id, leader]))
  const zoneBounds = new Map(zones.map(zone => [zone.id, zone.bounds]))
  const union = boundsOf(zones.flatMap(zone => rectanglePoints(zone.bounds)))

  // Center each independent management tree over the zones actually reached by
  // its reporting lines, so unrelated managers do not share an invented root.
  const roots = railTeams.map(team => {
    const ids = new Set(team.memberIds)
    const related = new Set(team.memberIds.flatMap(id => {
      const leader = leaderById.get(id)!
      if (leader.relatedDepartmentIds !== undefined) return leader.relatedDepartmentIds.filter(zoneId => zoneBounds.has(zoneId))
      const departmentId = parentDepartment(leader.departmentId)
      return zones.filter(zone => parentDepartment(zone.id) === departmentId).map(zone => zone.id)
    }))
    for (const person of members) {
      let parentId = person.parentId
      const seen = new Set<string>()
      while (parentId && !seen.has(parentId)) {
        if (ids.has(parentId)) { related.add(person.departmentId); break }
        seen.add(parentId)
        parentId = allPeople.get(parentId)?.parentId ?? null
      }
    }
    const target = related.size ? boundsOf([...related].flatMap(id => rectanglePoints(zoneBounds.get(id)!))) : union
    const bounds = companyLeadershipBounds(team.memberIds.map(id => leaderById.get(id)!), railPositions)!
    return { team, bounds, targetCenter: target.x + target.width / 2 }
  })

  // Shared directors belong above the same zone as a centered group. Centering
  // the first one alone would push each additional codirector toward other zones.
  const sharedTargets = new Map<number, typeof roots>()
  for (const root of roots) {
    const siblings = sharedTargets.get(root.targetCenter) ?? []
    siblings.push(root)
    sharedTargets.set(root.targetCenter, siblings)
  }
  const blocks = [...sharedTargets].map(([center, siblings]) => {
    siblings.sort((a, b) => a.team.id.localeCompare(b.team.id))
    const width = siblings.reduce((sum, root) => sum + root.bounds.width, 0) + (siblings.length - 1) * SPACE_TEAM_GAP
    return { siblings, width, desiredX: center - width / 2 }
  }).sort((a, b) => a.desiredX - b.desiredX)

  let right = -Infinity
  for (const { siblings, width, desiredX } of blocks) {
    let x = Math.max(desiredX, right + SPACE_TEAM_GAP)
    right = x + width
    for (const { team, bounds } of siblings) {
      for (const id of team.memberIds) {
        const point = railPositions.get(id)!
        positions.set(id, { x: point.x - bounds.x + x, y: point.y - bounds.y })
      }
      x += bounds.width + SPACE_TEAM_GAP
    }
  }
  const rail = companyLeadershipBounds(leaders, positions)!
  translate(positions, [
    ...members.map(member => member.id), ...zones.map(zone => departmentPositionKey(zone.id)),
  ], 0, rail.y + rail.height + COMPANY_LEADERSHIP_GAP)
  return positions
}

/** Keep manual group moves readable without moving or inventing reporting lines. */
export function resolveCompanyHierarchyPositions(
  departments: readonly SpaceDepartment[],
  members: readonly SpaceMember[],
  leaders: readonly CompanyHierarchyLeader[],
  positions: ReadonlyMap<string, Point>,
  anchor: SpaceAnchor = {},
  align = false,
): Map<string, Point> {
  const teams = buildSpaceTeams(members)
  let next = align ? alignSpaceTeams(members, teams, positions) : new Map(positions)
  if (leaders.length && align) {
    const railMembers = leaderMembers(leaders)
    const railTeams = buildSpaceTeams(railMembers)
    const aligned = alignSpaceTeams(railMembers, railTeams, next)
    const offsets = packPolygons(railTeams.map(team => ({
      id: team.id,
      points: rectanglePoints(companyLeadershipBounds(leaders.filter(leader => team.memberIds.includes(leader.id)), aligned)!),
    })), undefined, SPACE_TEAM_GAP)
    for (const team of railTeams) {
      const offset = offsets[team.id] ?? { x: 0, y: 0 }
      for (const id of team.memberIds) {
        const point = aligned.get(id)!
        next.set(id, { x: point.x + offset.x, y: point.y + offset.y })
      }
    }
  }
  next = resolveSpaceOverlaps(departments, members, teams, next, anchor)
  const rail = companyLeadershipBounds(leaders, next)
  const zones = geometryForSpaces(departments, members, teams, next).departments
  if (rail && zones.length) {
    const minimumY = Math.min(...zones.map(zone => zone.bounds.y))
    const down = Math.max(0, rail.y + rail.height + COMPANY_LEADERSHIP_GAP - minimumY)
    if (down) translate(next, [
      ...members.map(member => member.id), ...zones.map(zone => departmentPositionKey(zone.id)),
    ], 0, down)
  }
  return next
}
