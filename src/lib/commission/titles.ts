/**
 * A title on the ladder.
 *
 * Every rung of `comm_ranks` belongs to a title (Team → Role & Permission),
 * and a salesperson carries two facts that move differently (user 2026-09-02):
 *
 *   title    a RATCHET — raised the month a run is applied whose paid rank
 *            belongs to a higher title; never lowered by the engine.
 *   rank %   the floor — climbs on group sales and drops back to it.
 *
 * Three questions fall out of that, all answered from the ladder alone. A
 * title's position is where its lowest rung sits; nothing is read from
 * `titles.sort_order`, so re-ordering titles on the People side can never
 * silently re-order who outranks whom here.
 *
 * Pure so the engine, the Server Actions and the pages share one answer.
 */

export interface LadderRung {
  titleId: string
  canRecruit: boolean
  sortOrder: number
}

/**
 * Where a title sits on this ladder — the sort_order of its lowest rung.
 * `null` when the ladder does not carry it (no title yet, or one from another
 * department), which every caller treats as "below everything".
 */
export function titlePosition(ranks: readonly LadderRung[], titleId: string | null): number | null {
  if (!titleId) return null
  let pos: number | null = null
  for (const r of ranks) {
    if (r.titleId !== titleId) continue
    if (pos === null || r.sortOrder < pos) pos = r.sortOrder
  }
  return pos
}

/**
 * May somebody holding this title hold downlines?
 *
 * "Can recruit" follows the TITLE, not the month's rank (user 2026-09-03): a
 * Team Assistant who slips back to 5% for a month keeps the team they built.
 * A title may recruit when any rung it carries may. `null` when the title is
 * not on the ladder, so the caller can fall back to the rank they were placed
 * at rather than refusing everyone who has no title yet.
 */
export function titleCanRecruit(ranks: readonly LadderRung[], titleId: string | null): boolean | null {
  if (!titleId) return null
  let seen = false
  for (const r of ranks) {
    if (r.titleId !== titleId) continue
    seen = true
    if (r.canRecruit) return true
  }
  return seen ? false : null
}

/**
 * The title a paid rank would raise somebody to — or `null` when it is not
 * above what they already hold. This is the preview the engine writes on the
 * statement; `apply_commission_run` decides afresh from the live record.
 */
export function promotesTo(
  ranks: readonly LadderRung[],
  currentTitleId: string | null,
  paidTitleId: string | null,
): string | null {
  if (!paidTitleId || paidTitleId === currentTitleId) return null
  const hit = titlePosition(ranks, paidTitleId)
  if (hit === null) return null
  const cur = titlePosition(ranks, currentTitleId)
  return cur === null || hit > cur ? paidTitleId : null
}
