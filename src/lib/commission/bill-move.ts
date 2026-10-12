/**
 * Moving a bill to another salesperson from its right-click menu (2026-10-12)
 * — *Move to another salesperson…* on a salesperson's ledger on Comm Cal and
 * on All bills (the user: "together with rightclick … can select move this
 * order to other sales person").
 *
 * The ERP names who sold a bill; this says the bill is somebody else's. The
 * rule is the database's (`sales_order_reassignments` + `revenue_move_order`,
 * mig 20261012170000): the bill becomes its new holder's everywhere a bill's
 * salesperson counts — their sales, their rate, their upline's override, their
 * ledger and their Revenue app — and stays theirs through every ERP re-send;
 * moving it to the salesperson the ERP names takes the move off. The new
 * holder's share of it goes (they hold it all); its Open Bill pick goes with it
 * and comes back on the move back. A paid month refuses (23RUN), a bill that
 * does not count refuses (23EXC), and the action refuses a bill or a
 * salesperson whose month is closed, and anybody off the team. This file only
 * decides what the menu shows and says what happened.
 */

/** Who a bill is with, and who the ERP names when it was moved off them. */
export interface BillHolder {
  staffId: string | null
  name: string
}

export type BillMoveAction =
  /** The bill can be moved. `named`: the salesperson the ERP names, while the bill was moved off them. */
  | { kind: 'move'; owner: BillHolder; named: BillHolder | null }
  /** Would be offered, but its month has paid or somebody paid on it is closed. */
  | { kind: 'locked'; owner: BillHolder; named: BillHolder | null; reason: string }

/** What a move did (`moveOrder`). */
export interface BillMoveResult {
  orderId: string
  orderNo: string
  /** False when the bill was already theirs and nothing was written. */
  changed: boolean
  /** Whose it is now. */
  to: BillHolder
  /** Whose it was. */
  from: BillHolder
  /** It went back to the salesperson the ERP names: the move came off. */
  movedBack: boolean
  /** The Open Bill rank it gave up, if it held one. */
  openBillRank: number | null
  /** The rank it got back on the move back. */
  openBillBack: number | null
  /** The part of it the new holder had held, now all theirs. */
  shareTaken: number | null
}

/**
 * What `moveOrder` answers. A refusal the user must act on comes back as
 * `reason`, because a production build hands the browser only a digest of
 * anything a Server Action throws.
 */
export type BillMoveAnswer = { ok: true; result: BillMoveResult } | { ok: false; reason: string }

/** The menu's row for a bill — none for an upsell or a drop, which is no bill. */
export function billMoveAction(
  bill: { owner: BillHolder; named?: BillHolder | null; upsale?: boolean; cancelled?: boolean },
  ctx: { runLocked: boolean; closedReason: string | null; monthLabel: string },
): BillMoveAction | null {
  if (bill.upsale) return null
  const base = { owner: bill.owner, named: bill.named ?? null }
  if (bill.cancelled) return { kind: 'locked', ...base, reason: 'It does not count this month — count it again before moving it' }
  if (ctx.runLocked) return { kind: 'locked', ...base, reason: `The run for ${ctx.monthLabel} has paid — reopen it before moving its bills` }
  if (ctx.closedReason) return { kind: 'locked', ...base, reason: ctx.closedReason }
  return { kind: 'move', ...base }
}

/** Why the form cannot move it to `staffId` yet, or null. */
export function moveProblem(owner: BillHolder, staffId: string): string | null {
  if (!staffId) return 'Choose who it goes to.'
  if (staffId === owner.staffId) return `It is ${owner.name}’s already.`
  return null
}

const RANKS = ['1st', '2nd', '3rd']

/** The notice above the table once a bill has moved. */
export function moveMessage(result: BillMoveResult): string {
  if (!result.changed) return `${result.orderNo} is ${result.to.name}’s already — nothing moved.`
  const head = result.movedBack
    ? `${result.orderNo} is back with ${result.to.name}, the salesperson the ERP names.`
    : `${result.orderNo} is ${result.to.name}’s now — moved from ${result.from.name}.`
  const share = result.shareTaken
    ? ` ${result.to.name} held ${Math.round(result.shareTaken * 1000) / 10}% of it; all of it is theirs now.`
    : ''
  const pick = result.openBillBack
    ? ` Its Open Bill pick (${RANKS[result.openBillBack - 1] ?? result.openBillBack}) is back.`
    : result.openBillRank
      ? ` Its Open Bill pick (${RANKS[result.openBillRank - 1] ?? result.openBillRank}) came off — it ranked ${result.from.name}’s day.`
      : ''
  return `${head}${share}${pick}`
}

/** A bill that was moved, as its ledger row and its page say it. */
export interface BillMoved {
  /** Whose it was when it was first moved. */
  fromStaffId: string | null
  fromName: string | null
  movedByName: string | null
  movedAt: string
  note: string | null
}

/** "Moved from ADRIAN" — or, for a bill nobody was matched to, "Moved here". */
export function movedNote(moved: BillMoved): string {
  return moved.fromName ? `Moved from ${moved.fromName}` : 'Moved here'
}
