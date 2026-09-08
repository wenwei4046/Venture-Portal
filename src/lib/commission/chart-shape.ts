/**
 * Where a card sits on the commission chart when it has nowhere of its own.
 *
 * The Revenue chart draws `comm_hierarchy.upline_staff_id`. Anybody the engine
 * holds no position for has none, so the chart used to stand them all at the
 * top level — and with most of a sub-department not yet placed, the page was a
 * row of loose cards while `/team/hierarchy` drew the same people as a tree.
 * The two pages disagreed about the shape of a department that has one shape
 * (user, 2026-09-08).
 *
 * So an unplaced person borrows the company's line: they are drawn under the
 * manager they REPORT to. The rule is small enough to read in one sitting and
 * load-bearing enough to be worth pinning down, because the two mistakes it
 * avoids are both silent.
 *
 * FIRST, it must not touch a placed person. A position carrying a null upline
 * is somebody deliberately at the top of their tree. That is a fact somebody
 * entered, not a gap to fill in, and overwriting it with a reporting line
 * would invent a manager the money does not know about.
 *
 * SECOND, what it returns is not a claim about money. The caller draws a
 * borrowed line dashed, the card still reads "not placed", and the rate column
 * still reads an em dash. A borrowed parent says "this is where the company
 * puts them", never "this person earns an override on them".
 *
 * Nothing here writes. Placing somebody stays deliberate: `rank_id` is NOT
 * NULL on `comm_hierarchy`, and no rank can be invented for somebody whose
 * title carries none.
 */

/** The two facts the rule needs, and nothing else. */
export interface ChartPlacement {
  /** Their commission upline. Null both when unplaced and when top of tree. */
  uplineStaffId: string | null
  /**
   * The rank their open position carries, or null when they hold no position.
   *
   * This is what separates the two meanings of a null upline above. It works
   * because `comm_hierarchy.rank_id` is NOT NULL — a position always carries
   * a rank, so no rank means no position.
   */
  rankId: string | null
  /** `hr_staff_costs.reports_to`. Read here, never written from this chart. */
  reportsTo: string | null
}

/**
 * The parent to lay this card out under, or null for a root.
 *
 * Callers that need to know whether the answer was borrowed should ask
 * `isBorrowed` rather than comparing the result to `reportsTo` — somebody may
 * legitimately be placed under the very manager they report to, and that line
 * is a real one.
 */
export function layoutParent(person: ChartPlacement): string | null {
  if (person.uplineStaffId) return person.uplineStaffId
  if (person.rankId !== null) return null
  return person.reportsTo
}

/** Is this card standing on a reporting line rather than a commission one? */
export function isBorrowed(person: ChartPlacement): boolean {
  return !person.uplineStaffId && person.rankId === null && person.reportsTo !== null
}
