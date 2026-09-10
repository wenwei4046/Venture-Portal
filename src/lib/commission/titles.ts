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

/** A rung that may carry an earned (personal-sales streak) gate. */
export interface EarnedRung extends LadderRung {
  personalSalesThreshold: number | null
}

/**
 * The rung an EARNED title stands on: the highest streak-gated rung at or
 * below the title's own rung. A streak is a test of persistence, and passing
 * it makes somebody a Senior Revenue Specialist for good (user 2026-09-03) —
 * the title raised at apply is the record, and every later month climbs from
 * that rung, not from the 5% they were placed at. A Team Assistant's title
 * sits above rs_6, so their earned rung is still rs_6: 7% was a monthly
 * target, 6% is what they keep.
 */
export function earnedFloor<R extends EarnedRung>(ranks: readonly R[], titleId: string | null): R | undefined {
  const pos = titlePosition(ranks, titleId)
  if (pos === null) return undefined
  let best: R | undefined
  for (const r of ranks) {
    if (r.personalSalesThreshold === null) continue
    if (r.sortOrder > pos) continue
    if (!best || r.sortOrder > best.sortOrder) best = r
  }
  return best
}

/**
 * A rung, as the title→rank mapping needs to see it. `id` is what a position
 * points at; the rest is what decides which rung a title means.
 */
export interface AssignableRung extends LadderRung {
  id: string
}

/**
 * The rank a TITLE assigns — its floor rung, the lowest `sort_order` of the
 * rungs that carry it.
 *
 * The user's ruling: "a title assigns the rank automatically". A title may
 * carry more than one rung (before 2026-09-03 both 5% and 6% were "Revenue
 * Specialist"), and the floor is the honest reading of the pair — the title is
 * what somebody keeps, so the rank it guarantees is the lowest one it stands
 * for, not the highest one they might reach in a good month. Climbing above it
 * is what the monthly scheme target is for.
 *
 * `undefined` when the ladder does not carry the title, which every caller
 * treats as "this title says nothing about rank" rather than as an error: a
 * Finance title has no rung on a commission scheme and never will.
 */
export function rankForTitle<R extends AssignableRung>(
  ranks: readonly R[],
  titleId: string | null,
): R | undefined {
  if (!titleId) return undefined
  let best: R | undefined
  for (const r of ranks) {
    if (r.titleId !== titleId) continue
    if (!best || r.sortOrder < best.sortOrder) best = r
  }
  return best
}

/**
 * The rank somebody should be moved to when their TITLE changes — or `null`
 * when nothing should move.
 *
 * A RATCHET: giving somebody a title whose floor stands above their rank
 * raises the rank, and nothing ever lowers it — a promotion cannot claw back a
 * rank somebody was deliberately placed above, and a high placement cannot be
 * undone by re-saving the title that placement earned them.
 *
 * Since 2026-09-10 the database applies this rule itself, in the same
 * statement as the title write (`comm_sync_position`, migration
 * 20260910120000). This is the same decision in TypeScript, kept for the
 * engine's previews and for the tests that pin the rule down.
 *
 * Returns null, not the current rank, when there is nothing to do: the caller
 * writes only when it gets an id back, so an unchanged rank is not an
 * effective-dated position row nobody asked for.
 */
export function rankAfterTitleChange<R extends AssignableRung>(
  ranks: readonly R[],
  titleId: string | null,
  currentRankId: string | null,
): R | null {
  const floor = rankForTitle(ranks, titleId)
  if (!floor) return null
  if (!currentRankId) return floor
  if (currentRankId === floor.id) return null
  const current = ranks.find(r => r.id === currentRankId)
  // A rank the ladder does not carry (another scheme's) is not something to
  // compare against — leave it alone rather than guess it is lower.
  if (!current) return null
  return floor.sortOrder > current.sortOrder ? floor : null
}
