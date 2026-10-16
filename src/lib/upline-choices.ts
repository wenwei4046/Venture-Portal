import { boundaryRefusal, recruitRefusal } from './hierarchy-boundary'
import { compareByLadder, ladderAllows } from './ladder'
import { descendantsOf } from './org-layout'

/**
 * Who a person may report to, as their page's *Reports to* offers it
 * (2026-10-16, the user, on a person's page: "it needs to be able to set
 * report to an upline").
 *
 * The rules are the company chart's — the cards it greys while somebody is
 * dragged (`TeamOrgChart`'s `forbidden`) — so the select and the chart agree:
 * nobody below them (a loop), nobody the ladder ranks lower, and inside a
 * commission department nobody whose title cannot hold downlines. Across a
 * commission department's edge is never a line, so those are not offered at
 * all; nor is a department head to a Revenue member — that line is written as
 * the top of their tree (`moveReportingLine`), which is "— None". The save
 * goes through `moveReportingLine`, and the database refuses the same lines
 * again in its own words.
 */

export interface UplinePerson {
  id: string
  name: string
  code: string | null
  title: string | null
  department: string | null
  /** Their department is paid by the commission engine (Revenue). */
  commissionDept: boolean
  isDepartmentHead: boolean
  /** May their title hold downlines on their own base's ladder — asked only inside a commission department. */
  canRecruit: boolean | null
  levelRank: number | null
  active: boolean
  reportsTo: string | null
}

export interface UplineChoice {
  value: string
  label: string
  disabled: boolean
}

export interface UplineGroup {
  /** The department, as the select's group heading. */
  name: string
  choices: UplineChoice[]
}

/** Why somebody is offered but greyed — a few words after their name. */
export const UPLINE_WHY = {
  below: 'in their team',
  ladder: 'lower level',
  recruit: 'cannot lead',
  inactive: 'inactive',
} as const

/** The last group: everybody the line may not go to, greyed with why. */
export const UPLINE_REFUSED = 'Can’t be their upline'

const NO_DEPARTMENT = 'No department'

/**
 * The offered uplines: a group per department — theirs first, the rest A→Z —
 * each in ladder order, top down; then, in a last group, everybody the line
 * may not go to, greyed with why (for somebody senior that is most of the
 * company, so it waits below the choices that are open). The upline they
 * have now is always among them, whatever it is today (inactive, or a line
 * the ladder has since broken), so a save that leaves it alone cannot
 * change it.
 */
export function uplineChoices(moverId: string, people: readonly UplinePerson[]): UplineGroup[] {
  const mover = people.find(p => p.id === moverId)
  if (!mover) return []

  // Everybody under them, however far down: a line to one of them is a loop.
  const below = descendantsOf(
    people.map(p => ({ id: p.id, parentId: p.reportsTo, label: p.name })),
    moverId,
  )

  const byDepartment = new Map<string, UplinePerson[]>()
  for (const p of people) {
    if (p.id === moverId) continue
    const current = p.id === mover.reportsTo
    if (!current) {
      if (!p.active) continue
      if (boundaryRefusal(mover, p)) continue
      if (mover.commissionDept && !mover.isDepartmentHead && p.isDepartmentHead) continue
    }
    const key = p.department ?? NO_DEPARTMENT
    byDepartment.set(key, [...(byDepartment.get(key) ?? []), p])
  }

  const why = (p: UplinePerson): string | null => {
    if (!p.active) return UPLINE_WHY.inactive
    if (below.has(p.id)) return UPLINE_WHY.below
    if (!ladderAllows(mover.levelRank, p.levelRank)) return UPLINE_WHY.ladder
    if (recruitRefusal(mover, p)) return UPLINE_WHY.recruit
    return null
  }

  const own = mover.department ?? NO_DEPARTMENT
  const open: UplineGroup[] = []
  const refused: UplineChoice[] = []
  for (const name of [...byDepartment.keys()].sort((a, b) => (a === own ? -1 : b === own ? 1 : a.localeCompare(b)))) {
    const choices: UplineChoice[] = []
    for (const p of [...(byDepartment.get(name) ?? [])].sort(compareByLadder)) {
      const reason = why(p)
      if (reason) refused.push({ value: p.id, label: `${p.name} · ${p.title ?? 'No title'} — ${reason}`, disabled: true })
      else choices.push({ value: p.id, label: `${p.name} · ${p.title ?? 'No title'}`, disabled: false })
    }
    if (choices.length > 0) open.push({ name, choices })
  }
  return refused.length > 0 ? [...open, { name: UPLINE_REFUSED, choices: refused }] : open
}
