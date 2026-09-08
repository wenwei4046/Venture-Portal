/**
 * The two shapes the chart's commission-aware controls still pass around.
 *
 * This file used to hold the panel that gave it its name — the ladder, and a
 * list of the Revenue department's salespeople, drawn beside the canvas. Both
 * are gone: the ladder moved to the Levels tab, and the commission tree was
 * removed on 2026-09-08 because the rank it captioned people with is not what
 * a month pays them (a missed quota earns at a different rate), so the chart
 * was stating a fact about a person that is only true some months.
 *
 * What survives is the enrol offer. When a move cannot mirror because the new
 * manager holds no commission position, the banner offers to put them on the
 * ladder — and that prompt needs to know which scheme to default to and which
 * rungs it may show. A rate inside that picker is a CHOICE being made, not a
 * caption on somebody's card, which is the whole distinction the removal
 * turned on.
 *
 * Kept here rather than moved so the four files that import these two types do
 * not all churn for a rename.
 */

/** Somebody the commission engine holds an open position for. */
export interface SalesPerson {
  staffId: string
  /**
   * The scheme they earn under. An override differential belongs to ONE
   * scheme, so an enrol offer defaults its picker to the mover's rather than
   * to whichever scheme sorts first — enrolling a manager into a different one
   * is refused by the very mirror the offer is trying to complete.
   */
  schemeId: string
}

/** A rung an enrol offer may pick, inside one scheme. */
export interface RankOption {
  id: string
  label: string
  rateLabel: string
  sortOrder: number
}
