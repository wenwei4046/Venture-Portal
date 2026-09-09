import { descendantsOf, type OrgNodeInput } from '@/lib/org-layout'

/**
 * The rules of a move on the commission chart, said before the round trip.
 *
 * The canvas used to decide these inline, one `if` at a time inside the drop
 * handler, and the popover that replaced the 8px handle (user 2026-09-09:
 * "换 upline 这个举动，根本没有任何 button") needs the same answers for every
 * row it lists — greyed, and with the reason beside the name. One place, so
 * a drop and a pick can never disagree about who may sit under whom.
 *
 * The server still checks all of it (`setPosition`); this is the sentence
 * the reader gets instantly, in the words the server would have used.
 */

/** The four facts a refusal needs about somebody on the chart. */
export interface MoveSubject {
  staffId: string
  name: string
  titleName: string | null
  rankLabel: string | null
  /** Holds an open position — `comm_hierarchy.rank_id` is NOT NULL, so no rank means no position. */
  placed: boolean
  /** Decided by the title they hold, not the rank of the month. */
  canRecruit: boolean
}

export type RefusalKind = 'self' | 'downline' | 'not-placed' | 'no-downlines'

/**
 * Why `target` may not become `mover`'s upline — or null when they may.
 *
 * `downlines` is the mover's commission descendants, computed once by the
 * caller (`forbiddenTargets` does), because a popover asks this for every
 * person on the chart and walking the tree per row is what made the old
 * canvas hit-test slow enough to notice.
 */
export function moveRefusal(
  mover: MoveSubject,
  target: MoveSubject,
  downlines: ReadonlySet<string>,
): RefusalKind | null {
  if (target.staffId === mover.staffId) return 'self'
  if (downlines.has(target.staffId)) return 'downline'
  if (!target.placed) return 'not-placed'
  if (!target.canRecruit) return 'no-downlines'
  return null
}

/** The caption beside a greyed row: two words, in the popover's own voice. */
export function refusalLabel(kind: RefusalKind): string {
  switch (kind) {
    case 'self':
      return 'that is them'
    case 'downline':
      return 'their downline'
    case 'not-placed':
      return 'not placed'
    case 'no-downlines':
      return 'no downlines'
  }
}

/** The sentence a refused drop shows — the one the server would have sent. */
export function refusalSentence(kind: RefusalKind, mover: MoveSubject, target: MoveSubject): string {
  switch (kind) {
    case 'self':
      return `${mover.name} cannot be their own upline.`
    case 'downline':
      return `That would put ${mover.name} under their own downline.`
    case 'not-placed':
      return `${target.name} holds no position yet — place them first.`
    case 'no-downlines':
      return `${target.name} is a ${target.titleName ?? target.rankLabel ?? 'rank'} — that ${
        target.titleName ? 'title' : 'rank'
      } cannot hold downlines.`
  }
}

/**
 * Everyone the mover may not be dropped on, keyed by the reason. The commission
 * graph (`upline_staff_id`) decides the downlines — a borrowed reporting line
 * is not a money relationship and must not forbid a legal placement.
 */
export function forbiddenTargets(
  graph: OrgNodeInput[],
  people: readonly MoveSubject[],
  moverId: string,
): Map<string, RefusalKind> {
  const mover = people.find(p => p.staffId === moverId)
  const out = new Map<string, RefusalKind>()
  if (!mover) return out
  const downlines = descendantsOf(graph, moverId)
  for (const p of people) {
    const kind = moveRefusal(mover, p, downlines)
    if (kind) out.set(p.staffId, kind)
  }
  return out
}

/** What the shelf rule needs: is somebody standing on any line at all? */
export interface ShelfSubject {
  staffId: string
  placed: boolean
  /** Where the chart draws them — their upline, or the manager they borrow. */
  layoutParentId: string | null
}

/**
 * People with no line at all: not placed, drawn under nobody, with nobody drawn
 * under them. They used to stand in the leaders' row at the top of the chart,
 * which read as five team leaders where there were three; now they wait on a
 * shelf at the canvas's right edge. A placed root — a leader whose team is
 * still empty — is a tree of one and stays where the trees are.
 */
export function shelfIds(people: readonly ShelfSubject[]): Set<string> {
  const heads = new Set<string>()
  for (const p of people) if (p.layoutParentId) heads.add(p.layoutParentId)
  const out = new Set<string>()
  for (const p of people) {
    if (!p.placed && !p.layoutParentId && !heads.has(p.staffId)) out.add(p.staffId)
  }
  return out
}

export interface TreeMember {
  id: string
  depth: number
}

export interface TreeGroup {
  rootId: string
  /** Root first, then depth-first, siblings by label — the order a reader scans a tree. */
  members: TreeMember[]
}

/**
 * Every tree on the chart, in the shape the Move popover lists them. Built on
 * the LAYOUT graph so a borrowed member shows up under the manager the chart
 * draws them under — the popover is a picture of the chart, not of the money.
 * A parent that is missing makes a root of its own, and a loop is cut rather
 * than walked forever, the same two rules `layoutTree` lives by.
 */
export function treeGroups(nodes: readonly OrgNodeInput[]): TreeGroup[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const children = new Map<string, string[]>()
  const roots: string[] = []
  const sorted = [...nodes].sort((a, b) => a.label.localeCompare(b.label))
  for (const n of sorted) {
    if (n.parentId && byId.has(n.parentId) && n.parentId !== n.id) {
      const list = children.get(n.parentId)
      if (list) list.push(n.id)
      else children.set(n.parentId, [n.id])
    } else {
      roots.push(n.id)
    }
  }
  const seen = new Set<string>()
  const groups: TreeGroup[] = []
  const walk = (id: string, depth: number, members: TreeMember[]) => {
    if (seen.has(id)) return
    seen.add(id)
    members.push({ id, depth })
    for (const kid of children.get(id) ?? []) walk(kid, depth + 1, members)
  }
  for (const root of roots) {
    const members: TreeMember[] = []
    walk(root, 0, members)
    if (members.length) groups.push({ rootId: root, members })
  }
  // Anybody only reachable through a loop still gets listed, as a root.
  for (const n of sorted) {
    if (seen.has(n.id)) continue
    const members: TreeMember[] = []
    walk(n.id, 0, members)
    groups.push({ rootId: n.id, members })
  }
  return groups
}
