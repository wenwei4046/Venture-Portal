/**
 * A bill's commission ratio in the Revenue app (2026-11-27, mig 20261127140500 — the user, on a bill's sheet: a Revenue
 * Director "点三个点后可以调动 commission：1. 他可以选 ratio 自己填（25%、50%、75% 都可以调）2. … below margin 的，他觉得可以
 * 调的就改成 [standard] margin，不用扣 50% … 同理，如果觉得说这个不应该是属于 normal commission，他可以调成 50%"; the salesperson
 * is told — "要通知").
 *
 * The rule is the database's (`member_comm_ratio_context`, `member_comm_ratio_set`, both SECURITY DEFINER under the
 * caller's own session: Commission ratio · Edit, the sub-departments they reach on Comm Cal, never their own bill, never a
 * Revenue Director's own, never a paid month or a close that gave it). This file reads their answers field by field and
 * holds the checks the sheet and the server share. A ratio is a fraction, 0–1, as the engine reads it.
 */
import { isRatio } from '@/lib/commission/bill-comm-ratio'

/** The longest *Why* the database keeps. */
export const COMM_RATIO_NOTE_MAX = 500

/** A ratio set on a bill: who set it, when, why. `pct` is a fraction (0.75), as the database keeps it. */
export interface CommRatioSet {
  pct: number
  by: string | null
  /** ISO timestamp. */
  at: string | null
  note: string | null
}

/** What the Adjust commission sheet draws. */
export interface CommRatioContext {
  orderId: string
  orderNo: string
  /** `YYYY-MM`: the bill's month. */
  month: string
  /** The bill's margin, % (two decimals), as the Revenue app reads it; null while a line has no cost. */
  margin: number | null
  /** What its margin alone pays it: the penalty band's label (null: none cuts it) and its multiplier (1: uncut). */
  ladder: { label: string | null; multiplier: number }
  /** The ratio set on it now; null while its margin decides. */
  ratio: CommRatioSet | null
  /** Why it cannot be changed now — null when it can. */
  refusal: string | null
}

/** What a save answers. `changed` false: it was already so. */
export interface CommRatioSaved {
  orderId: string
  orderNo: string
  ratio: number | null
  changed: boolean
}

type Raw = Record<string, unknown>
const isObject = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** A ratio set on a bill, from the database's `{pct, by, at, note}`; null when it is none, or not that shape. */
export function commRatioSetFromRow(v: unknown): CommRatioSet | null {
  if (!isObject(v)) return null
  const pct = num(v.pct)
  if (pct === null || !isRatio(pct)) return null
  return { pct, by: text(v.by), at: text(v.at), note: text(v.note) }
}

/** `member_comm_ratio_context`'s answer; null when it is not the shape this app reads. */
export function commRatioContextFromRow(v: unknown): CommRatioContext | null {
  if (!isObject(v)) return null
  const orderId = text(v.orderId)
  const orderNo = text(v.orderNo)
  const month = text(v.month)
  if (!orderId || !orderNo || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
  const margin = v.margin === null || v.margin === undefined ? null : num(v.margin)
  if (margin === null && v.margin !== null && v.margin !== undefined) return null
  const ladder = isObject(v.ladder) ? v.ladder : {}
  const multiplier = num(ladder.multiplier)
  return {
    orderId, orderNo, month, margin,
    ladder: { label: text(ladder.label), multiplier: multiplier !== null && isRatio(multiplier) ? multiplier : 1 },
    ratio: commRatioSetFromRow(v.ratio),
    refusal: text(v.refusal),
  }
}

/** `member_comm_ratio_set`'s answer. */
export function commRatioSavedFromRow(v: unknown): CommRatioSaved | null {
  if (!isObject(v)) return null
  const orderId = text(v.orderId)
  const orderNo = text(v.orderNo)
  if (!orderId || !orderNo || typeof v.changed !== 'boolean') return null
  const ratio = v.ratio === null || v.ratio === undefined ? null : num(v.ratio)
  if (ratio !== null && !isRatio(ratio)) return null
  return { orderId, orderNo, ratio, changed: v.changed }
}

/** Why a *Why* cannot be kept as typed — null when it can. Empty is fine: it is optional. */
export function commRatioNoteRefusal(note: string): string | null {
  return note.trim().length > COMM_RATIO_NOTE_MAX ? `Keep why to ${COMM_RATIO_NOTE_MAX} characters.` : null
}

/** Two ratios the same to the hundredth of a percent (what the database keeps: numeric(5,4)). */
export function sameRatio(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.round(a * 10_000) === Math.round(b * 10_000)
}
