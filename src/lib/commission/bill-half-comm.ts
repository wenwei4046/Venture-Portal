import { formatDate } from '@/lib/utils'

/**
 * HALF COMM (2026-11-10) — one bill paid half its commission, by hand.
 *
 * The user, on Comm Cal's bill menu: "half comm 的意思就是在他的 commission value
 * 里面 commission 的一半。example: commission value 5000, commission percentage
 * 6%; commission get RM300, 当我按了 half comm 就会是 total commission RM150,
 * then 在 status 里面就是 show half comm". Asked the rest: the upline's
 * override on it is halved too; its sales count in full everywhere; its KPI
 * items are paid in full; like *Don't count this bill…* — a confirm panel with
 * Why (optional), the reason the Status chip's tooltip, and *Full comm again*.
 *
 * The rule is the database's list (`sales_order_half_comm`, mig 20261110160000)
 * and the engine's arithmetic (`SalesOrder.halfComm`, `HALF_COMM`). This file is
 * the words Comm Cal uses for it, and what a bill's menu may offer.
 */

/** The Status a half-comm bill shows. */
export const HALF_COMM_LABEL = 'Half comm'

/** Somebody's Half comm on one bill (a `sales_order_half_comm` row). */
export interface HalfCommMark {
  note: string | null
  byName: string | null
  /** ISO timestamp. */
  at: string
}

/** "Half comm by HR on 10 Nov 2026 — customer asked for a discount" */
export function describeHalfComm(mark: HalfCommMark): string {
  // The day it happened in Malaysia, whatever clock the server keeps.
  const myt = new Date(Date.parse(mark.at) + 8 * 3_600_000).toISOString().slice(0, 10)
  const who = mark.byName ? `by ${mark.byName} ` : ''
  return `Half comm ${who}on ${formatDate(myt)}${mark.note ? ` — ${mark.note}` : ''}`
}

/** What a bill's menu may do about its half comm. */
export type BillHalfCommAction =
  /** A bill that counts and is paid in full: it can be halved. */
  | { kind: 'half' }
  /** Half comm: it can be paid in full again. */
  | { kind: 'full' }
  /** Shut — a paid run, a closed salesperson: neither way until it is reopened. */
  | { kind: 'locked'; halved: boolean; reason: string }

/**
 * The menu's row — none for an upsell or a drop (no bill) or a bill that does
 * not count (no commission to halve). Locked where *Don't count* is locked.
 */
export function billHalfCommAction(
  bill: { halfComm: boolean; upsale?: boolean; cancelled?: boolean },
  { runLocked, closedReason = null, monthLabel }: { runLocked: boolean; closedReason?: string | null; monthLabel: string },
): BillHalfCommAction | null {
  if (bill.upsale || bill.cancelled) return null
  if (runLocked) {
    return { kind: 'locked', halved: bill.halfComm, reason: `The run for ${monthLabel} has paid — reopen it before changing what its bills pay` }
  }
  if (closedReason) return { kind: 'locked', halved: bill.halfComm, reason: closedReason }
  return bill.halfComm ? { kind: 'full' } : { kind: 'half' }
}

/** What Half comm, or Full comm again, did. */
export interface BillHalfCommResult {
  orderNo: string
  /** False when it was already that way and nothing was written. */
  changed: boolean
}

/** A refusal comes back as words, never thrown: production hides a thrown message (React #441). */
export type BillHalfCommAnswer = { ok: true; result: BillHalfCommResult } | { ok: false; reason: string }

/** What the notice above the table says. */
export function halfCommNotice(outcome: { orderNo: string; halved: boolean }, monthLabel: string): string {
  return outcome.halved
    ? `${outcome.orderNo} pays half its commission in ${monthLabel} — its override too. Its sales and KPI count in full.`
    : `${outcome.orderNo} pays its full commission again.`
}
