/**
 * Department heads — the Revenue Director layer (user, 2026-09-11).
 *
 * "Revenue Director 本身不会进入任何 Rank，也不会出现在该 Department 的 Title
 *  Ladder 里面 … 会出现在 Hierarchy Chart 中，但该 Hierarchy 仅用于 reporting，
 *  不用于 commission overriding … Team Leader 的 upline 直接就是 Revenue
 *  Director … 整个 Department 都是直接 report to Revenue Director."
 *
 * A title may HEAD its department (`titles.is_department_head`). Somebody
 * holding one stands above the commission ladder: no rung, no membership, no
 * rank, no override. Which head(s) a sub-department reports to is a fact of
 * the sub-department (`comm_sub_department_directors`) — Fair reports to
 * Peter and Kris, IR to Peter — so the line from the top of every tree up to
 * the director is DERIVED on the charts, never written per person: two
 * directors do not fit in one `reports_to` column, and a new team leader
 * reports to them the day their tree begins without anybody drawing it.
 *
 * Pure. The Revenue chart, the People chart and its table all read these, so
 * the three cannot disagree about who stands under whom.
 */

/** A department head as a chart names them. */
export interface DepartmentHead {
  id: string
  name: string
}

/** Somebody on a chart, as the derived line needs to see them. */
export interface HeadLineSubject {
  id: string
  /** Who they report to on the company chart. Null = the top of a tree. */
  reportsTo: string | null
  /** The heads their sub-department reports to, in the order a chart hangs them. */
  leadIds: readonly string[]
}

/** Heads A→Z by name — the order every list and label uses. */
export function sortHeads<T extends { name: string }>(heads: readonly T[]): T[] {
  return [...heads].sort((a, b) => a.name.localeCompare(b.name))
}

/** `PETER · KRIS` — for a card row or a table cell. Empty when nobody heads it. */
export function headsLabel(heads: readonly (string | { name: string })[]): string {
  return heads
    .map(h => (typeof h === 'string' ? h : h.name))
    .sort((a, b) => a.localeCompare(b))
    .join(' · ')
}

/**
 * At the top of a tree, and reporting to the department's head(s) — as
 * opposed to reporting to nobody at all (a head themselves, until the CEO
 * layer exists; or anybody outside a commission department).
 */
export function reportsToHeads(p: HeadLineSubject): boolean {
  return p.reportsTo === null && p.leadIds.length > 0
}

/**
 * The parent a tree layout hangs somebody from: their manager, or — at the
 * top of a tree — the first of their heads. A tree can only have one parent
 * per node, so with two directors the layout picks the first (A→Z) and the
 * chart draws the line to the other one as well.
 */
export function layoutParent(p: HeadLineSubject): string | null {
  return p.reportsTo ?? p.leadIds[0] ?? null
}

/** One derived line per (head, top-of-tree person). */
export interface HeadLine {
  headId: string
  staffId: string
}

/** The derived lines: from each head down to everybody at the top of a tree under them. */
export function headLines(people: readonly HeadLineSubject[]): HeadLine[] {
  const out: HeadLine[] = []
  for (const p of people) {
    if (!reportsToHeads(p)) continue
    for (const headId of p.leadIds) out.push({ headId, staffId: p.id })
  }
  return out
}
