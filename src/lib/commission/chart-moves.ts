import { descendantsOf, type OrgNodeInput } from '@/lib/org-layout'
import { ladderAllows, ladderRefusal } from '@/lib/ladder'

/**
 * The rules of a move on the commission chart, said before the round trip.
 *
 * The canvas used to decide these inline, one `if` at a time inside the drop
 * handler, and the popover that replaced the 8px handle (user 2026-09-09:
 * "换 upline 这个举动，根本没有任何 button") needs the same answers for every
 * row it lists — greyed, and with the reason beside the name. One place, so
 * a drop and a pick can never disagree about who may sit under whom.
 *
 * Since 2026-09-10 the chart moves ONE line — `hr_staff_costs.reports_to`,
 * the same line People draws — and the commission position follows it in
 * the database. So the rules here are the rules of a reporting line inside
 * a commission department: not under yourself, not under your own report,
 * only under a title that may hold downlines, and never under a title the
 * ladder ranks below yours. The database refuses all four again
 * (`hr_staff_reports_to_no_cycle`, `hr_staff_commission_line`,
 * `hr_staff_respects_ladder`); this is the sentence the reader gets
 * instantly, in the words the server would have used.
 */

/** The facts a refusal needs about somebody on the chart. */
export interface MoveSubject {
  staffId: string
  name: string
  titleName: string | null
  /** May their title hold downlines on this sub-department's configured ladder? */
  canRecruit: boolean
  /** Where their title stands on the company ladder; null = not on it. */
  levelRank: number | null
  levelName: string | null
  /** Existing parent makes a no-op move legal even when its slots are full. */
  uplineStaffId?: string | null
  directLineCount?: number
  directLineLimit?: number | null
}

/** The server resolves retained opened slots and any offer valid this month. */
export function effectiveDirectLineLimit(
  baseLimit: number | null | undefined,
  currentLimit: number | null | undefined,
): number | null {
  if (baseLimit == null) return null
  return Math.max(baseLimit, currentLimit ?? baseLimit)
}

export function directLineCapacityRefusal(
  mover: Pick<MoveSubject, 'uplineStaffId'>,
  target: Pick<MoveSubject, 'staffId' | 'directLineCount' | 'directLineLimit'>,
): boolean {
  return mover.uplineStaffId !== target.staffId
    && target.directLineLimit != null
    && (target.directLineCount ?? 0) >= target.directLineLimit
}

export type RefusalKind = 'self' | 'downline' | 'no-downlines' | 'lower-title' | 'direct-limit'

/**
 * Why `target` may not become `mover`'s upline — or null when they may.
 *
 * `downlines` is the mover's descendants, computed once by the caller
 * (`forbiddenTargets` does), because a popover asks this for every person on
 * the chart and walking the tree per row is what made the old canvas
 * hit-test slow enough to notice.
 */
export function moveRefusal(
  mover: MoveSubject,
  target: MoveSubject,
  downlines: ReadonlySet<string>,
): RefusalKind | null {
  if (target.staffId === mover.staffId) return 'self'
  if (downlines.has(target.staffId)) return 'downline'
  if (!target.canRecruit) return 'no-downlines'
  if (!ladderAllows(mover.levelRank, target.levelRank)) return 'lower-title'
  if (directLineCapacityRefusal(mover, target)) return 'direct-limit'
  return null
}

/** The caption beside a greyed row: two words, in the popover's own voice. */
export function refusalLabel(kind: RefusalKind): string {
  switch (kind) {
    case 'self':
      return 'that is them'
    case 'downline':
      return 'their downline'
    case 'no-downlines':
      return 'no downlines'
    case 'lower-title':
      return 'lower title'
    case 'direct-limit':
      return 'direct lines full'
  }
}

/** The sentence a refused drop shows — the one the server would have sent. */
export function refusalSentence(kind: RefusalKind, mover: MoveSubject, target: MoveSubject): string {
  switch (kind) {
    case 'self':
      return `${mover.name} cannot be their own upline.`
    case 'downline':
      return `That would put ${mover.name} under their own downline.`
    case 'no-downlines':
      return target.titleName
        ? `${target.name} is a ${target.titleName} — that title cannot hold downlines.`
        : `${target.name} holds no title on the commission ladder — nobody can earn under them.`
    case 'lower-title':
      return ladderRefusal(
        { name: mover.name, title: mover.titleName, level: mover.levelName },
        { name: target.name, title: target.titleName, level: target.levelName },
      )
    case 'direct-limit':
      return `${target.name} has reached the limit of ${target.directLineLimit} direct lines.`
  }
}

/** Everyone the mover may not be dropped on, keyed by the reason. */
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
  /** Who they report to — the line the chart draws. */
  parentId: string | null
  /** May their title hold downlines? A leader with an empty team is a tree of one. */
  canRecruit: boolean
}

/**
 * People with no line at all: reporting to nobody, with nobody reporting to
 * them, and a title that cannot lead anyone. They used to stand in the
 * leaders' row at the top of the chart, which read as five team leaders where
 * there were three; now they wait on a shelf at the canvas's right edge. A
 * leader whose team is still empty is a tree of one and stays where the trees
 * are.
 */
export function shelfIds(people: readonly ShelfSubject[]): Set<string> {
  const heads = new Set<string>()
  for (const p of people) if (p.parentId) heads.add(p.parentId)
  const out = new Set<string>()
  for (const p of people) {
    if (!p.parentId && !heads.has(p.staffId) && !p.canRecruit) out.add(p.staffId)
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
 * Every tree on the chart, in the shape the Move popover lists them. A parent
 * that is missing makes a root of its own, and a loop is cut rather than
 * walked forever, the same two rules `layoutTree` lives by.
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
