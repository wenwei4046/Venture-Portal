/**
 * Putting one move back.
 *
 * The user asked for an undo button on the chart (2026-09-08). The obvious
 * implementation is to call the move again with the previous manager, and
 * that is not an undo — it is a SECOND MOVE FORWARD, made without looking at
 * whether somebody else moved the person in between. So an undo RESTORES A
 * CAPTURED VALUE: the client holds what the reporting line was immediately
 * before the move, this file decides whether it may still be put back, and
 * the action writes it with the same writer a move uses.
 *
 * Since 2026-09-10 there is only one line to put back. The commission
 * position is derived from `reports_to` by the database (migration
 * 20260910120000), so restoring the reporting line restores the override
 * with it; the half-undo cases this file used to reason about — a mirror
 * that ran, a mirror that skipped, a commission upline moved elsewhere in
 * between — cannot arise any more.
 *
 * Two things still bound it, and both are deliberate:
 *
 *   one level    The last move only. Not a stack. A stack of moves over
 *                effective-dated rows would let somebody walk backwards across
 *                a month boundary, and each step back across one writes a THIRD
 *                row rather than removing the second.
 *   one chart    The Team chart and its table. The Revenue chart is the same
 *                line seen from the money side; it has no undo of its own
 *                because the user asked for none there.
 *
 * A refusal is a refusal, not a best effort: an undo that silently does half
 * of what it says is worse than a button that was never pressed.
 */

/** What the reporting line was immediately before the move, captured by the client. */
export interface PriorLine {
  staffId: string
  staffName: string
  /** Their reporting line before the move. Null = they were at the top. */
  reportsTo: string | null
  /** What the move set the reporting line TO. The staleness check reads this. */
  movedTo: string | null
}

/** The same person as the database has them NOW, read fresh by the action. */
export interface UndoSubject {
  reportsTo: string | null
}

/**
 * What the action should do about it.
 *
 * `refuse` carries the sentence, because only this file knows why the world
 * moved on, and "could not undo that" on its own leaves somebody staring at a
 * chart wondering what is true.
 */
export type UndoPlan =
  | { kind: 'refuse'; note: string }
  | { kind: 'restore'; reportsTo: string | null }

/**
 * Whether this move can still be put back.
 *
 * One check: has somebody been moved again since? If so, forcing the old
 * value would discard a later, deliberate decision and report success for
 * having done so.
 */
export function undoPlan(prior: PriorLine, now: UndoSubject): UndoPlan {
  if (now.reportsTo !== prior.movedTo) {
    return {
      kind: 'refuse',
      note: `${prior.staffName} has been moved again since, so this would not put anything back — it would be a third move. Nothing was changed.`,
    }
  }
  return { kind: 'restore', reportsTo: prior.reportsTo }
}
