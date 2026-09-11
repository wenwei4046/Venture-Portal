import {
  alignSpaceTeams,
  buildSpaceTeams,
  resolveSpaceOverlaps,
  type SpaceDepartment,
  type SpaceMember,
  type SpaceTeam,
} from './hierarchy-space-layout'
import type { Point } from './hierarchy-spaces'

export interface HierarchyTransferInput {
  departments: readonly SpaceDepartment[]
  members: readonly SpaceMember[]
  positions: ReadonlyMap<string, Point>
  childId: string
  parentId: string | null
  /** Positions before dragging, used to keep surviving team leaders in place. */
  originPositions?: ReadonlyMap<string, Point>
}

export interface HierarchyTransferPlan {
  members: SpaceMember[]
  teams: SpaceTeam[]
  positions: Map<string, Point>
  movedIds: string[]
  departmentId: string
  teamId: string
}

function validPoint(point: Point | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
}

/**
 * Align only the teams affected by a successful membership transfer.
 * Rank/capacity permissions remain the caller's and server's responsibility.
 * Only the child's parent changes; descendant relationships remain intact.
 */
export function planHierarchyTransfer({
  departments, members, positions, childId, parentId, originPositions,
}: HierarchyTransferInput): HierarchyTransferPlan | null {
  const byId = new Map(members.map(member => [member.id, member]))
  const child = byId.get(childId)
  const parent = parentId === null ? null : byId.get(parentId)
  if (!child || (parentId !== null && (!parent || parent.departmentId !== child.departmentId || parentId === childId))) return null

  const children = new Map<string, string[]>()
  for (const member of members) {
    if (member.departmentId !== child.departmentId || !member.parentId) continue
    const siblings = children.get(member.parentId) ?? []
    siblings.push(member.id)
    children.set(member.parentId, siblings)
  }
  const movedIds = [childId]
  const moved = new Set(movedIds)
  for (let index = 0; index < movedIds.length; index++) {
    for (const id of children.get(movedIds[index]) ?? []) {
      if (moved.has(id)) continue
      moved.add(id)
      movedIds.push(id)
    }
  }
  if (parentId !== null && moved.has(parentId)) return null

  const baseline = originPositions ?? positions
  const currentRoot = positions.get(childId)
  if (!validPoint(currentRoot) || movedIds.some(id => !validPoint(baseline.get(id)))) return null
  if (parent && !validPoint(positions.get(parent.id))) return null

  const source = buildSpaceTeams(members).find(team => team.memberIds.includes(childId))
  const nextMembers = members.map(member => member.id === childId ? { ...member, parentId } : member)
  const teams = buildSpaceTeams(nextMembers)
  const destination = teams.find(team => team.memberIds.includes(childId))
  if (!destination) return null

  // The former team may disappear when its leader moves. Surviving source and
  // destination leaders remain at their pre-drag anchors while members settle.
  const affectedTeamIds = teams.filter(team => team.id === source?.id || team.id === destination.id)
    .map(team => team.id)
  const affectedMembers = teams.filter(team => affectedTeamIds.includes(team.id)).flatMap(team => team.memberIds)
  if (affectedMembers.some(id => !validPoint(positions.get(id)))) return null
  const anchors = new Map(baseline)
  // Detaching creates a new free team where the user dropped its leader.
  if (parentId === null) anchors.set(childId, { ...currentRoot })
  const aligned = alignSpaceTeams(nextMembers, teams, positions, anchors, affectedTeamIds)

  return {
    members: nextMembers,
    teams,
    positions: resolveSpaceOverlaps(departments, nextMembers, teams, aligned, {
      teamId: destination.id,
      departmentId: child.departmentId,
    }),
    movedIds,
    departmentId: child.departmentId,
    teamId: destination.id,
  }
}
