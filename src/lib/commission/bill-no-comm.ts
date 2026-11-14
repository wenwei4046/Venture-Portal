import { formatDate } from '@/lib/utils'

/**
 * NO COMMISSION (2026-11-14) — a bill that still counts and pays nobody, by hand.
 *
 * The user, splitting *Don't count this bill…* in two: "Down count（HR 那边）我觉得要
 * 分为两种：1. 一种是指完全不出 commission，但他还是有算在 revenue，还有算在 margin
 * 等等 2. 另外一种是不算 commission，同时也不算进 revenue、不算进 margin，跟他完全
 * 没有关系". The second is the Don't count there was (`bill-exclusion.ts`); this
 * is the first. Asked who else goes unpaid (a RM 10,000 bill at 6% = RM 600;
 * the leader's 2% override RM 200), "整张单谁都不拿钱": no commission, no
 * override, no KPI pay on it — while it counts in sales, margin and the KPI
 * count.
 *
 * The rule is the database's list (`sales_order_no_comm`, mig 20261114200000)
 * and the engine's arithmetic (`SalesOrder.noCommission`). This file is the
 * words Comm Cal and the Revenue app use for it.
 */

/** The Status a no-commission bill shows. */
export const NO_COMM_LABEL = 'No commission'

/** Somebody's No commission on one bill (a `sales_order_no_comm` row). */
export interface NoCommMark {
  note: string | null
  byName: string | null
  /** ISO timestamp. */
  at: string
}

/** "No commission by HR on 14 Nov 2026 — keyed for ANTHONY" */
export function describeNoComm(mark: NoCommMark): string {
  // The day it happened in Malaysia, whatever clock the server keeps.
  const myt = new Date(Date.parse(mark.at) + 8 * 3_600_000).toISOString().slice(0, 10)
  const who = mark.byName ? `by ${mark.byName} ` : ''
  return `No commission ${who}on ${formatDate(myt)}${mark.note ? ` — ${mark.note}` : ''}`
}

/** What *No commission*, or counting the bill's commission again, did. */
export interface BillNoCommResult {
  orderNo: string
  /** False when it was already that way and nothing was written. */
  changed: boolean
  /** No commission took a half comm off the bill (nothing left to halve). */
  halfCommOff?: boolean
}

/** A refusal comes back as words, never thrown: production hides a thrown message (React #441). */
export type BillNoCommAnswer = { ok: true; result: BillNoCommResult } | { ok: false; reason: string }

/** What the notice above the table says. */
export function noCommNotice(outcome: { orderNo: string; noComm: boolean; halfCommOff?: boolean }, monthLabel: string): string {
  return outcome.noComm
    ? `${outcome.orderNo} pays no commission in ${monthLabel} — no override and no KPI on it either`
      + `${outcome.halfCommOff ? ', and its half comm is off' : ''}. It still counts in sales and margin.`
    : `${outcome.orderNo} pays its commission again.`
}
