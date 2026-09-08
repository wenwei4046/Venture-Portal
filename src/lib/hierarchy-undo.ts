/**
 * Putting one move back.
 *
 * The user asked for an undo button on the chart (2026-09-08). The obvious
 * implementation is to call the move again with the previous manager, and that
 * is not an undo — it is a SECOND MOVE FORWARD, and it breaks exactly the cases
 * the double write exists for:
 *
 *   - Somebody reporting to P while earning under C is a legal state outside a
 *     commission department. Re-moving them onto P collapses both lines onto P
 *     and C is gone, reported as a success.
 *   - Undoing a detach would fire a mirror the original move deliberately
 *     refused.
 *   - Neither can restore an overwritten commission upline, because no gesture
 *     on the chart writes an arbitrary one.
 *
 * So an undo RESTORES CAPTURED VALUES. The client holds what both lines were
 * immediately before the move, this file decides what may be put back, and the
 * action writes it with the same two writers a move uses.
 *
 * Two things bound it, and both are deliberate:
 *
 *   one level    The last move only. Not a stack. A stack of moves over
 *                effective-dated rows would let somebody walk backwards across
 *                a month boundary, and each step back across one writes a THIRD
 *                row rather than removing the second.
 *   one chart    The Team chart. The Revenue chart writes a whole position row
 *                — scheme, rank, rate mode, upline — from a client copy that is
 *                stale by construction, so "put it back" there is a bigger
 *                claim than this file is willing to make.
 *
 * Everything else is a REFUSAL, not a best effort. An undo that silently does
 * half of what it says is worse than a button that was never pressed: the
 * reader believes the chart went back, and it did not.
 */

/** What both lines were immediately before the move, captured by the client. */
export interface PriorLine {
  staffId: string
  staffName: string
  /** Their reporting line before the move. Null = they were at the top. */
  reportsTo: string | null
  /** Their commission upline before the move. Null = none, or no position. */
  commUplineId: string | null
  /**
   * Did the move's mirror actually write the commission upline? Straight off
   * the `MirrorOutcome` the move returned. False for a skip, a failure, or a
   * person with no position — in every one of those the move changed one line
   * only, so the undo must change one line only.
   */
  mirrored: boolean
  /** What the move set the reporting line TO. The staleness check reads this. */
  movedTo: string | null
}

/** The same person as the database has them NOW, read fresh by the action. */
export interface UndoSubject {
  reportsTo: string | null
  hasPosition: boolean
  /** Their open position's upline right now. Null when there is no position. */
  commUplineId: string | null
}

/**
 * What the action should do about it.
 *
 * `refuse` carries the sentence, because only this file knows which of the
 * several ways the world moved on actually happened, and "could not undo that"
 * on its own leaves somebody staring at a chart wondering what is true.
 */
export type UndoPlan =
  | { kind: 'refuse'; note: string }
  | {
      kind: 'restore'
      reportsTo: string | null
      /** Whether to write the commission upline back as well. */
      commission: 'restore' | 'leave'
      commUplineId: string | null
      /** Anything the reader has to be told about what will NOT go back. */
      note: string | null
    }

/**
 * Whether this move can still be put back, and how much of it.
 *
 * The checks are ordered by what they protect. The reporting line is tested
 * first because it is the half the button claims to undo; if somebody has been
 * moved again since, nothing below matters and forcing the old value would
 * discard a later, deliberate decision.
 */
export function undoPlan(prior: PriorLine, now: UndoSubject): UndoPlan {
  if (now.reportsTo !== prior.movedTo) {
    return {
      kind: 'refuse',
      note: `${prior.staffName} has been moved again since, so this would not put anything back — it would be a third move. Nothing was changed.`,
    }
  }

  // The move only ever wrote one line, so the undo writes one line. This is
  // the common case outside a commission department, and the whole case for
  // somebody who holds no position at all.
  if (!prior.mirrored) {
    return {
      kind: 'restore',
      reportsTo: prior.reportsTo,
      commission: 'leave',
      commUplineId: null,
      note: now.hasPosition
        ? 'Their commission upline was not part of that move, so it is unchanged.'
        : null,
    }
  }

  // The mirror ran, so there is a commission upline to put back — unless the
  // position it lived on has since been closed. The reporting line still goes
  // back, because that half is undoable and refusing it would strand the
  // reader with neither half.
  if (!now.hasPosition) {
    return {
      kind: 'restore',
      reportsTo: prior.reportsTo,
      commission: 'leave',
      commUplineId: null,
      note: `${prior.staffName} no longer holds a commission position, so their commission upline could not go back with the reporting line. Place them on the Revenue chart if they should still be on the ladder.`,
    }
  }

  // Somebody moved the commission half on the Revenue chart in between. That
  // is a deliberate decision about money made after this move, and an undo
  // that overwrote it would be the silent damage this file exists to refuse.
  if (now.commUplineId !== prior.movedTo) {
    return {
      kind: 'refuse',
      note: `${prior.staffName}'s commission upline has changed since that move, so putting the reporting line back would leave the two disagreeing. Nothing was changed.`,
    }
  }

  return {
    kind: 'restore',
    reportsTo: prior.reportsTo,
    commission: 'restore',
    commUplineId: prior.commUplineId,
    note: null,
  }
}
