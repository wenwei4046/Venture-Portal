import { NODE_HEIGHT, NODE_WIDTH } from './org-layout'
import {
  buildSpaceTeams,
  resolveSpaceOverlaps,
  type SpaceDepartment,
  type SpaceMember,
  type SpaceTeam,
} from './hierarchy-space-layout'
import type { Bounds, Point } from './hierarchy-spaces'

export interface HierarchyTransferInput {
  departments: readonly SpaceDepartment[]
  members: readonly SpaceMember[]
  positions: ReadonlyMap<string, Point>
  childId: string
  parentId: string | null
  /** Positions before the root was dragged; its descendants may still be there. */
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

const CARD_GAP = 32
const LANDING_GAP = 60
const EPSILON = 1e-7

function validPoint(point: Point | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
}

function dimension(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function cardBounds(member: SpaceMember, point: Point): Bounds {
  return {
    ...point,
    width: dimension(member.width, NODE_WIDTH),
    height: dimension(member.height, NODE_HEIGHT),
  }
}

/** Find the nearest free horizontal placement without disturbing either group. */
function nearestHorizontalShift(moving: readonly Bounds[], stationary: readonly Bounds[]): number {
  const intervals: Array<{ start: number; end: number }> = []
  for (const card of moving) {
    for (const obstacle of stationary) {
      if (card.y + card.height + CARD_GAP <= obstacle.y + EPSILON
        || obstacle.y + obstacle.height + CARD_GAP <= card.y + EPSILON) continue
      intervals.push({
        start: obstacle.x - card.x - card.width - CARD_GAP,
        end: obstacle.x + obstacle.width + CARD_GAP - card.x,
      })
    }
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: typeof intervals = []
  for (const interval of intervals) {
    const previous = merged[merged.length - 1]
    // Exactly touching intervals still leave their shared boundary available.
    if (previous && interval.start < previous.end - EPSILON) previous.end = Math.max(previous.end, interval.end)
    else merged.push({ ...interval })
  }
  const blocked = merged.find(interval => interval.start < -EPSILON && interval.end > EPSILON)
  if (!blocked) return 0
  return Math.abs(blocked.start) < Math.abs(blocked.end) ? blocked.start : blocked.end
}

/**
 * Plan a membership transfer while retaining the subtree's hand-arranged shape.
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
  const originalRoot = baseline.get(childId)
  const currentRoot = positions.get(childId)
  if (!validPoint(originalRoot) || !validPoint(currentRoot)) return null
  const relativeCards: Array<Bounds & { id: string }> = []
  for (const id of movedIds) {
    const point = baseline.get(id)
    if (!validPoint(point)) return null
    relativeCards.push({
      id,
      ...cardBounds(byId.get(id)!, { x: point.x - originalRoot.x, y: point.y - originalRoot.y }),
    })
  }

  let landing = { ...currentRoot }
  let horizontalShift = 0
  if (parent) {
    const parentPosition = positions.get(parent.id)
    if (!validPoint(parentPosition)) return null
    const target = cardBounds(parent, parentPosition)
    landing = {
      x: target.x,
      y: target.y + target.height + LANDING_GAP - Math.min(0, ...relativeCards.map(card => card.y)),
    }
    const stationary: Bounds[] = []
    for (const member of members) {
      if (member.departmentId !== child.departmentId || moved.has(member.id)) continue
      const point = positions.get(member.id)
      if (!validPoint(point)) return null
      stationary.push(cardBounds(member, point))
    }
    horizontalShift = nearestHorizontalShift(relativeCards.map(card => ({
      ...card, x: card.x + landing.x, y: card.y + landing.y,
    })), stationary)
  }

  const nextPositions = new Map([...positions].map(([id, point]) => [id, { ...point }]))
  for (const card of relativeCards) nextPositions.set(card.id, {
    x: landing.x + card.x + horizontalShift,
    y: landing.y + card.y,
  })
  const nextMembers = members.map(member => member.id === childId ? { ...member, parentId } : member)
  const teams = buildSpaceTeams(nextMembers)
  const destination = teams.find(team => team.memberIds.includes(childId))
  if (!destination) return null
  return {
    members: nextMembers,
    teams,
    positions: resolveSpaceOverlaps(departments, nextMembers, teams, nextPositions, {
      teamId: destination.id,
      departmentId: child.departmentId,
    }),
    movedIds,
    departmentId: child.departmentId,
    teamId: destination.id,
  }
}
