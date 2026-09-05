/**
 * The company ladder.
 *
 * A set of named rungs — Assistant, Executive, …, Head of Department — shared
 * by every department, with each title pinned to one of them
 * (`titles.level_id` → `title_levels`). Two questions are asked of it, and
 * this file answers both without touching a database:
 *
 *   - Promotion: what is the next rung up in THIS person's department, and
 *     which titles stand on it? Several may (Marketing has three kinds of
 *     Executive), so the answer is a choice, not a title.
 *
 *   - The org chart: may somebody with this title report to somebody with
 *     that one? Nobody reports to a title that stands LOWER than their own.
 *     Equal is fine — a senior executive can lead other senior executives.
 *     A title not on the ladder, or no title at all, is outside the rule.
 *
 * The rungs are one scale for the whole company, not one per department, so
 * that the chart can compare across departments — an IT executive under the
 * Marketing manager is a comparison of two departments' titles.
 *
 * The database trigger `hr_staff_respects_ladder` enforces the same rule as
 * the backstop; its refusal reads the same as `ladderRefusal` so a message
 * from either side is the same message.
 */

/** A rung of the ladder. */
export interface Rung {
  id: string
  /** 1 is the bottom rung. Higher is more senior. */
  rank: number
  name: string
}

/** A title as the ladder sees it. Pass active titles only. */
export interface LadderTitle {
  id: string
  name: string
  departmentId: string | null
  /** Null = not placed on the ladder. */
  levelId: string | null
}

/** The rung a title stands on, or null when it is not placed. */
export function rungOf(
  title: Pick<LadderTitle, 'levelId'> | null | undefined,
  rungs: readonly Rung[],
): Rung | null {
  if (!title?.levelId) return null
  return rungs.find(r => r.id === title.levelId) ?? null
}

export interface NextRung {
  rung: Rung
  /** Every title of the same department on that rung, A→Z. */
  titles: LadderTitle[]
}

/**
 * The next rung up in the title's own department: the lowest rung above this
 * one that has at least one title of the department on it. A rung the
 * department skips is skipped — Finance has nothing at Senior Manager, so its
 * Assistant Manager climbs straight to Manager. Null when the title is not
 * placed, or there is nothing above it.
 */
export function nextRung(
  titles: readonly LadderTitle[],
  rungs: readonly Rung[],
  titleId: string,
): NextRung | null {
  const me = titles.find(t => t.id === titleId)
  const here = rungOf(me, rungs)
  if (!me || !here) return null

  const byId = new Map(rungs.map(r => [r.id, r]))
  let best: Rung | null = null
  for (const t of titles) {
    if (t.id === me.id || t.departmentId !== me.departmentId || !t.levelId) continue
    const r = byId.get(t.levelId)
    if (!r || r.rank <= here.rank) continue
    if (!best || r.rank < best.rank) best = r
  }
  if (!best) return null

  const up = best
  return {
    rung: up,
    titles: titles
      .filter(t => t.departmentId === me.departmentId && t.levelId === up.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/**
 * May somebody at `subordinateRank` report to somebody at `managerRank`?
 * Unknown on either side (an unplaced title, or no title) is allowed: the
 * ladder only speaks where it has been told something.
 */
export function ladderAllows(
  subordinateRank: number | null,
  managerRank: number | null,
): boolean {
  if (subordinateRank === null || managerRank === null) return true
  return managerRank >= subordinateRank
}

export interface LadderParty {
  name: string
  title: string | null
  level: string | null
}

/** The refusal, in the words the database trigger uses. */
export function ladderRefusal(subordinate: LadderParty, manager: LadderParty): string {
  return (
    `${subordinate.name} cannot report to ${manager.name}: ` +
    `${subordinate.title} (${subordinate.level}) stands above ` +
    `${manager.title} (${manager.level}) on the ladder`
  )
}

export interface LadderLine {
  id: string
  reportsTo: string | null
  rank: number | null
}

/**
 * The reporting lines that break the ladder today. A ladder edited after the
 * chart was drawn can leave lines like these; the trigger does not go back
 * over them, so the pages have to say where they are.
 *
 * A manager not in the list (inactive, typically) is not a line on the chart
 * and is not reported.
 */
export function ladderBreaks(
  people: readonly LadderLine[],
): Array<{ id: string; managerId: string }> {
  const rank = new Map(people.map(p => [p.id, p.rank]))
  const out: Array<{ id: string; managerId: string }> = []
  for (const p of people) {
    if (!p.reportsTo || !rank.has(p.reportsTo)) continue
    if (!ladderAllows(p.rank, rank.get(p.reportsTo) ?? null)) {
      out.push({ id: p.id, managerId: p.reportsTo })
    }
  }
  return out
}

/** Somebody on the roster, as far as the ladder is concerned. */
export interface LadderOrderable {
  name: string
  title: string | null
  /** The rung their title stands on; null = unplaced title, or no title. */
  levelRank: number | null
}

/**
 * The roster's order inside a department: the ladder, top down (user,
 * 2026-09-05). Higher rung first; on one rung the same title keeps together,
 * A→Z; then names A→Z. Somebody whose title is not on the ladder — or who has
 * no title — comes after everybody who is: the ladder has nothing to say about
 * where they stand, so they stand at the end, no title last of all.
 */
export function compareByLadder(a: LadderOrderable, b: LadderOrderable): number {
  if (a.levelRank !== b.levelRank) {
    if (a.levelRank === null) return 1
    if (b.levelRank === null) return -1
    return b.levelRank - a.levelRank
  }
  if ((a.title === null) !== (b.title === null)) return a.title === null ? 1 : -1
  return (a.title ?? '').localeCompare(b.title ?? '') || a.name.localeCompare(b.name)
}
