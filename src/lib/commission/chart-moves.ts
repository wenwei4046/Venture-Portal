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
 * The server still checks all of it (`setPosition`, `enrolAndPlace`); this is
 * the sentence the reader gets instantly, in the words the server would have
 * used.
 */

/** The facts a refusal needs about somebody on the chart. */
export interface MoveSubject {
  staffId: string
  name: string
  titleName: string | null
  rankLabel: string | null
  /** Holds an open position — `comm_hierarchy.rank_id` is NOT NULL, so no rank means no position. */
  placed: boolean
  /** Decided by the title they hold, not the rank of the month. */
  canRecruit: boolean
  /**
   * `hr_staff_costs.reports_to` — the line an unplaced person is drawn on
   * (`chart-shape.ts`), and the line they are put on the ladder along when
   * somebody is placed under them (`enrolPlan`). Read for the unplaced only:
   * a placed person's upline is their own fact, null included.
   */
  reportsTo: string | null
}

export type RefusalKind = 'self' | 'downline' | 'not-placed' | 'no-downlines'

/** One person a move puts on the ladder on its way, and where they land. */
export interface EnrolStep {
  staffId: string
  /**
   * The step before them — or, for the first, the placed manager the line
   * hangs from. Null when the line reaches nobody: top of their own tree.
   */
  uplineStaffId: string | null
}

/** A step with the rank the reader chose for it — what the server is sent. */
export interface EnrolChoice extends EnrolStep {
  rankId: string
}

export interface EnrolPlan {
  /**
   * Top-down: the target's unplaced ancestors on the reporting line, then the
   * target. Empty when the target already holds a position.
   */
  steps: EnrolStep[]
  /** Why no plan can be built, when it cannot. The steps are then empty. */
  blocked: string | null
}

/**
 * What placing somebody under `targetId` has to put on the ladder first.
 *
 * Until 2026-09-10 an upline with no position was simply refused — "place
 * them first" — and on a chart where twenty-five of twenty-eight people were
 * not placed yet, that was most of the chart (user: "why i cant park yau wei
 * under chea huan tree?"). The refusal was correct about the database:
 * `comm_hierarchy.upline_staff_id` must point at an open position, so an
 * unplaced upline cannot take anyone. It was wrong about the gesture, which
 * is not "move under an unplaced person" but "put this person on that tree" —
 * and the tree already has a shape, because the chart draws it from the
 * reporting line.
 *
 * So the plan follows that line. The target goes on the ladder; if the
 * manager they report to is not on it either, that manager goes first, and so
 * on up until a placed person is met (they become the first step's upline) or
 * the line ends (the first step tops their own tree). Inside a commission
 * department the reporting line IS the commission upline (user 2026-09-08,
 * `hierarchy-boundary.ts`), so this is not guessing at who earns override —
 * it is the one shape both charts already agree on. Placing the target at the
 * top of their own tree instead would be worse than a guess: `setPosition`
 * mirrors a first placement into `reports_to`, and a null upline would CLEAR
 * the reporting line the target already has.
 *
 * Everybody on the line is about to hold somebody — the target holds the
 * mover, each ancestor holds the one below, the placed manager holds the top
 * — so each of them must have a title that may recruit. The target's own is
 * left to `moveRefusal`, where the caption belongs to them; an ancestor's
 * blocks the plan with their name in the sentence.
 *
 * A line that leaves the chart (a manager in another sub-department, or one
 * no longer active) is blocked rather than cut: cutting it would make a top
 * of somebody who has a manager, and the mirror would then erase that manager.
 */
export function enrolPlan(people: readonly MoveSubject[], targetId: string): EnrolPlan {
  const byId = new Map(people.map(p => [p.staffId, p]))
  const target = byId.get(targetId)
  if (!target || target.placed) return { steps: [], blocked: null }

  // Bottom-up, the target first.
  const line: MoveSubject[] = []
  const seen = new Set<string>()
  let cursor: MoveSubject = target
  let anchor: MoveSubject | null = null
  for (;;) {
    if (seen.has(cursor.staffId)) {
      return { steps: [], blocked: `${target.name}’s reporting line loops back on itself` }
    }
    seen.add(cursor.staffId)
    line.push(cursor)
    if (!cursor.reportsTo) break
    const up = byId.get(cursor.reportsTo)
    if (!up) {
      return { steps: [], blocked: `${cursor.name} reports to somebody who is not on this chart` }
    }
    if (up.placed) {
      anchor = up
      break
    }
    cursor = up
  }

  for (const holder of anchor ? [...line.slice(1), anchor] : line.slice(1)) {
    if (!holder.canRecruit) {
      return {
        steps: [],
        blocked: `${target.name} reports up to ${holder.name}, whose title cannot hold downlines`,
      }
    }
  }

  line.reverse()
  return {
    steps: line.map((p, i) => ({
      staffId: p.staffId,
      uplineStaffId: i === 0 ? (anchor?.staffId ?? null) : line[i - 1].staffId,
    })),
    blocked: null,
  }
}

/** Do two plans place the same people under the same uplines, in the same order? */
export function sameSteps(a: readonly EnrolStep[], b: readonly EnrolStep[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => s.staffId === b[i].staffId && s.uplineStaffId === b[i].uplineStaffId)
  )
}

/**
 * Why `target` may not become `mover`'s upline — or null when they may.
 *
 * `downlines` is the mover's commission descendants, computed once by the
 * caller (`forbiddenTargets` does), because a popover asks this for every
 * person on the chart and walking the tree per row is what made the old
 * canvas hit-test slow enough to notice. `plan` is what placing under the
 * target would put on the ladder first (`enrolPlan`): a target with no
 * position is no longer refused for that alone, only when the plan for them
 * cannot be built — or when it would close a loop, which the commission
 * graph cannot see because the line is borrowed.
 */
export function moveRefusal(
  mover: MoveSubject,
  target: MoveSubject,
  downlines: ReadonlySet<string>,
  plan: EnrolPlan,
): RefusalKind | null {
  if (target.staffId === mover.staffId) return 'self'
  if (downlines.has(target.staffId)) return 'downline'
  // The line the target would be placed along runs through the mover, or
  // hangs from somebody below them: placing it closes the same loop.
  if (plan.steps.some(s => s.staffId === mover.staffId)) return 'downline'
  const anchor = plan.steps[0]?.uplineStaffId ?? null
  if (anchor && (anchor === mover.staffId || downlines.has(anchor))) return 'downline'
  if (!target.canRecruit) return 'no-downlines'
  if (plan.blocked) return 'not-placed'
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

/**
 * The sentence a refused drop shows — the one the server would have sent.
 * `blocked` is the plan's own reason, when there is one; without it the
 * old sentence stands.
 */
export function refusalSentence(
  kind: RefusalKind,
  mover: MoveSubject,
  target: MoveSubject,
  blocked: string | null = null,
): string {
  switch (kind) {
    case 'self':
      return `${mover.name} cannot be their own upline.`
    case 'downline':
      return `That would put ${mover.name} under their own downline.`
    case 'not-placed':
      return blocked
        ? `${target.name} holds no position yet and cannot be placed from here — ${blocked}. Place them first.`
        : `${target.name} holds no position yet — place them first.`
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
    const kind = moveRefusal(mover, p, downlines, enrolPlan(people, p.staffId))
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
