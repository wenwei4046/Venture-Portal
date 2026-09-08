/**
 * The two hierarchies, and the one write that keeps them together.
 *
 * The portal draws two lines over the same people:
 *
 *   reports_to      `hr_staff_costs`. The company reporting line. Current
 *                   state, no history. Gated on the `team` permission.
 *   commission      `comm_hierarchy.upline_staff_id`. What the override
 *   upline          differential is computed from. Effective-dated, so a month
 *                   already run keeps the chart it was run against. Gated on
 *                   the `revenue` permission.
 *
 * Until 2026-09-01 they were edited apart and the Team chart drew the
 * commission line without ever writing it. The user's ruling on 2026-09-04 —
 * restated in this brief as "double write" — is that **editing either graph
 * writes both**, so that a salesperson moved on the org chart does not keep
 * earning override under the manager they left.
 *
 * This file is the DECISION, not the write: pure, so both Server Actions ask
 * the same question and the answer is testable without a database. Three
 * things can come back, and the difference between the last two is the whole
 * reason this is not a boolean:
 *
 *   mirror   do it — both people are salespeople and the actor may write the
 *            other table.
 *   skip     do NOT do it, and SAY SO. The actor lacks the other permission.
 *            The primary write still stands; the two lines now disagree, and
 *            the person in front of the screen is the only one who can tell
 *            somebody. A silent skip here is how a salesperson keeps paying
 *            override to their old upline for a month.
 *   noop     nothing to mirror, say nothing. The person is not on commission
 *            at all, so there is no second line to move. Inventing one would
 *            mean inventing a rank.
 *
 * Since 2026-09-08 one department reads differently. Where the commission
 * engine pays — `departments.payroll_source = 'commission'`, today only Revenue
 * — the two lines are ONE graph and `lib/hierarchy-boundary.ts` keeps them
 * that way by refusing any reporting line that leaves. Callers say so with
 * `oneGraph`, and it changes the detach branch alone; see the comment there.
 *
 * A skip may also carry an OFFER (2026-09-07). Saying what did not happen was
 * already an improvement on silence, but it left the reader holding a sentence
 * and no way to act on it: they were told the new manager earns no override,
 * and then had to go and find a different page under a different permission to
 * do anything about it. An offer is the refusal plus the named, one-step way
 * to make it possible, rendered where the refusal is read. It stays an OFFER
 * and never becomes automatic — see the detach branch for why doing it for
 * them would be a bug rather than a courtesy.
 *
 * The recursion guard is not here because it cannot be: it is structural.
 * Neither action imports the other. Both call the plain writers in
 * `lib/hierarchy-writes.ts`, which know nothing about mirroring, so there is no
 * edge in the call graph for a mirror to recurse along.
 */

/**
 * What the reader could DO about a refusal, named well enough to render a
 * sentence and call the follow-up action without a second lookup.
 *
 * Discriminated on `kind`, so a caller that grows a third offer cannot forget
 * a branch. Both members carry an id AND a display name because the two
 * audiences differ: the id is what the follow-up action is called with, the
 * name is what the sentence on screen has to say.
 */
export type MirrorOffer =
  /**
   * The new manager holds no commission position, so there is nobody for the
   * override to land on. Offer to put them on the ladder.
   *
   * Accepting this is TWO writes, not one: enrol the manager, and then run the
   * mover's mirror again. Enrolling alone leaves the commission line exactly
   * where it was — the silent failure this whole feature exists to kill.
   */
  | { kind: 'enrol'; staffId: string; staffName: string }
  /**
   * The move was a detach on one chart, and the mover still sits under a
   * manager on the other. Offer to clear that one as well.
   */
  | { kind: 'detach'; uplineId: string; uplineName: string }

export interface MirrorContext {
  /** The person being moved. */
  staffId: string
  /** Their new manager / upline. Null = detached to the top of THIS tree. */
  targetId: string | null
  /**
   * Everybody who holds an open commission position. A move is only mirrored
   * between two people who are both on it.
   */
  onCommission: ReadonlySet<string>
  /** Does the actor hold the permission that guards the OTHER table? */
  mayWriteOther: boolean
  /**
   * True when this move happens INSIDE a commission department.
   *
   * The user's ruling on 2026-09-08: in a department the commission engine
   * pays, the reporting line and the commission upline are ONE graph, drawn
   * twice. `lib/hierarchy-boundary.ts` is what keeps it one — a reporting line
   * may not leave such a department — and this flag is what the decision below
   * needs to know that it is looking at that graph.
   *
   * It changes exactly one branch: the DETACH. That branch refuses to copy a
   * null across on the argument that an absence on one chart is not evidence
   * about the other. That argument is sound wherever the two charts hold
   * different people, and false here, where they hold the same ones. Optional
   * and defaulting to false, so every caller outside a commission department
   * keeps the behaviour it has always had.
   */
  oneGraph?: boolean
  /** How to name the other side in a skip note — "commission upline" / "reporting line". */
  otherName: string
  /**
   * What to CALL the new manager. Optional, and its absence is not an error: a
   * caller that does not know the name gets the unnamed note this branch has
   * always returned and no enrol offer, because an offer whose sentence cannot
   * say who it is about is not something anybody can accept. Pass it to get
   * the offer.
   */
  targetName?: string | null
  /**
   * Who the mover currently sits under on the OTHER chart — the manager a
   * detach offer would clear. Passed IN rather than looked up, because this
   * file stays pure and the caller has already read that table. Absent or null
   * means there is nothing there to clear, so there is nothing to offer.
   */
  currentOtherUpline?: { id: string; name: string } | null
}

/** What the caller should do about the other hierarchy. */
export type MirrorDecision =
  | { kind: 'mirror' }
  | { kind: 'skip'; note: string; offer?: MirrorOffer }
  | { kind: 'noop' }

/**
 * Whether a move on one hierarchy should be copied onto the other.
 *
 * Read the order of the checks as a claim about which mistake costs more. The
 * commission-membership test comes FIRST, before the permission test, because
 * somebody who is not on commission has nothing to mirror however the actor is
 * gated — telling a Finance manager that their permissions blocked a mirror
 * for a person who has no commission position at all is a false alarm, and a
 * false alarm every time is how a real one stops being read.
 *
 * Every offer is gated on `mayWriteOther`, for a cousin of that same reason:
 * an offer somebody cannot accept is worse than no offer at all. Without the
 * permission each note stays exactly the sentence it has always been.
 */
export function mirrorDecision(ctx: MirrorContext): MirrorDecision {
  const moverOnCommission = ctx.onCommission.has(ctx.staffId)
  if (!moverOnCommission) return { kind: 'noop' }

  // Moving a salesperson under somebody who is not one has no commission
  // meaning: `comm_hierarchy.upline_staff_id` would point at a person the
  // override engine has no position for. So it is refused — but it is SAID,
  // not silent (YH, 2026-09-07). This branch returned `noop` and reported
  // nothing, which is indistinguishable from a mirror that ran: you move a
  // salesperson under a manager who earns no override, get a clean save, and
  // find the commission chart unchanged with nothing on screen explaining
  // why. That is the exact drift this whole feature exists to prevent, and
  // silence is how it comes back.
  //
  // Saying it turned out not to be enough on its own. The reader was still
  // sent away to find the page that puts a manager on the ladder, under a
  // permission the page they are standing on does not even require. So when
  // they hold that permission and we know the manager's name, the refusal
  // carries the way out with it.
  if (ctx.targetId !== null && !ctx.onCommission.has(ctx.targetId)) {
    const targetName = ctx.targetName
    if (ctx.mayWriteOther && targetName) {
      return {
        kind: 'skip',
        note: `Their ${ctx.otherName} was left as it was — ${targetName} holds no commission position, so there is nobody there to earn an override. Put ${targetName} on the commission ladder and this move will follow them across.`,
        offer: { kind: 'enrol', staffId: ctx.targetId, staffName: targetName },
      }
    }
    return {
      kind: 'skip',
      note: `Their ${ctx.otherName} was left as it was — that manager holds no commission position, so there is nobody there to earn an override.`,
    }
  }

  // A DETACH is a statement about one tree only, and the two trees hold
  // different people. Somebody can top the commission tree while still
  // reporting to a manager who earns no override — and can report to nobody
  // while still paying override to the person who recruited them. Copying a
  // null across would delete a real relationship on the strength of an absence
  // in the other, which for the commission side means quietly changing who
  // earns money. So a detach is refused and SAID, not performed in silence:
  // the reader can make the same move on the other chart if they meant it.
  //
  // "Can" became one click on 2026-09-07 — an OFFER, and still never automatic.
  // The argument above is that an absence on one chart is not evidence about
  // the other; a button the reader chooses to press IS evidence, and it is the
  // only kind there is. So the way out is offered and never taken for them.
  //
  // `oneGraph` exempts a commission department from all of it, and the exemption
  // is the argument's own logic rather than an exception to it. The reasoning
  // above turns on the two charts holding DIFFERENT people; inside a commission
  // department they hold the same ones, so an absence on one is not merely
  // evidence about the other, it is the same fact. Detaching somebody there and
  // leaving them paying override to the manager they just left is the drift
  // this whole feature exists to kill. So the detach falls through to the
  // permission check and then mirrors — and because it is a money write, the
  // caller says out loud that nobody earns on their sales any more.
  if (ctx.targetId === null && !ctx.oneGraph) {
    const current = ctx.currentOtherUpline
    if (ctx.mayWriteOther && current) {
      return {
        kind: 'skip',
        note: `Their ${ctx.otherName} was left as it was — taking somebody off one chart does not take them off the other. It is still ${current.name}; clear that as well if you meant both.`,
        offer: { kind: 'detach', uplineId: current.id, uplineName: current.name },
      }
    }
    return {
      kind: 'skip',
      note: `Their ${ctx.otherName} was left as it was — taking somebody off one chart does not take them off the other.`,
    }
  }

  if (!ctx.mayWriteOther) {
    return {
      kind: 'skip',
      note: `Their ${ctx.otherName} was left as it was — that needs a permission this account does not have.`,
    }
  }

  return { kind: 'mirror' }
}

/** What an action reports back about the second half of the write. */
export interface MirrorOutcome {
  /** True only when the other hierarchy was actually written. */
  mirrored: boolean
  /**
   * Set when the caller must SAY something — a skip, or a mirror that failed.
   * Null on a clean mirror and on a no-op. Every call site renders this; a
   * discarded note is the bug this shape exists to make visible.
   */
  note: string | null
  /**
   * Set when the note has a way out attached. Optional and additive: a call
   * site that knows nothing about offers keeps compiling and keeps rendering
   * the note alone, which is exactly what it did before.
   */
  offer?: MirrorOffer
}

/** Nothing to mirror, nothing to say. */
export const MIRRORED_NOTHING: MirrorOutcome = { mirrored: false, note: null }

/**
 * The note for a mirror that was attempted and threw.
 *
 * The primary write has already committed by the time this can happen, so the
 * action must NOT rethrow: the move did happen, and a thrown error would tell
 * the user the opposite. It reports instead.
 */
export function mirrorFailed(otherName: string, reason: string): MirrorOutcome {
  return {
    mirrored: false,
    note: `Moved, but their ${otherName} could not be moved with them: ${reason}`,
  }
}
