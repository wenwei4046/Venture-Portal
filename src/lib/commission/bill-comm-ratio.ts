import { formatDate } from '@/lib/utils'

/**
 * A BILL'S COMMISSION RATIO, SET BY A REVENUE DIRECTOR (2026-11-27).
 *
 * The user, on a bill's sheet in the Revenue app: "如果是 for revenue director，他有一个权限就是点三个点后可以调动
 * commission：1. 他可以选 ratio 自己填（25%、50%、75% 都可以调）2. 还有权限可以调比如一些 below margin 的，他觉得可以调的
 * 就改成 [standard] margin，不用扣 50% … 同理，如果觉得说这个不应该是属于 normal commission，他可以调成 50%"; asked, the
 * salesperson is told ("要通知").
 *
 * The rule is the database's (`sales_order_comm_ratios`, written only by `member_comm_ratio_set`) and the engine's
 * arithmetic (`SalesOrder.commRatio`: it takes the place of the margin band's multiplier — the commission, its part of
 * the override base and the sales it counts). This file is the words, the choices and the checks every side shares.
 */

/** The ratios the sheet offers before *Other %* — the margin ladder's own steps. */
export const COMM_RATIO_STEPS: readonly number[] = [1, 0.75, 0.5, 0.25, 0]

/** A ratio as the pages write it: 0.75 → "75%", 1/3 → "33.33%". */
export function ratioLabel(ratio: number): string {
  const pct = Math.round(ratio * 10_000) / 100
  return `${Number.isInteger(pct) ? pct.toFixed(0) : String(pct)}%`
}

/** What *Other %* takes: a number of percent, 0–100, at most two decimals. Null when it is not one. */
export function parseRatioPercent(raw: string): number | null {
  const text = raw.trim().replace(/%$/, '').trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null
  const pct = Number(text)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null
  return Math.round(pct * 100) / 10_000
}

/** The Status a bill whose ratio was set shows on Comm Cal: "Commission 75%". */
export function commRatioLabel(ratio: number): string {
  return `Commission ${ratioLabel(ratio)}`
}

/** Somebody's ratio on one bill (a `sales_order_comm_ratios` row). */
export interface CommRatioMark {
  ratio: number
  note: string | null
  byName: string | null
  /** ISO timestamp. */
  at: string
}

/** "Commission 75% by KRIS on 27 Nov 2026 — customer is a repeat buyer" */
export function describeCommRatio(mark: CommRatioMark): string {
  // The day it happened in Malaysia, whatever clock the server keeps.
  const myt = new Date(Date.parse(mark.at) + 8 * 3_600_000).toISOString().slice(0, 10)
  const who = mark.byName ? `by ${mark.byName} ` : ''
  return `${commRatioLabel(mark.ratio)} ${who}on ${formatDate(myt)}${mark.note ? ` — ${mark.note}` : ''}`
}

/** A ratio the database would take: a finite number 0–1. */
export function isRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}
