/**
 * ONE look for every calendar and date picker in the CRM, phone and desktop (the owner, 2026-11-10, with the v4 handoff:
 * "unify the calendar look"). Every month grid and range picker draws its days with these, so today, a picked day, a
 * range, a day outside the month, a leave and an appointment read the same on every screen:
 * A MONTH GRID (Calendar, Assignment › Leave, the salesperson's and the Team's Calendar):
 *   - today: a rust circle with a white number;
 *   - the day it lists below: the sand fill;
 * A RANGE PICKER (Custom periods: date-range.tsx, the phone Insight's period sheet, the Team Calendar's range sheet):
 *   - the range's two ends: rust with a white number; the days between: the peach band;
 *   - today (not an end): a rust ring;
 * Both:
 *   - a day outside the month: white, its number faint-2 (notes/19 §5 — no beige fill);
 *   - a day that cannot be picked (the future, where nothing can exist yet): the disabled number;
 *   - grid lines: --crm-cal-grid (notes/19 §6);
 *   - a leave: its reason's tint and words (README "Design tokens" › Tints; Other keeps the CRM's own);
 *   - an appointment: a 5 px amber dot (notes/19 §7).
 */
import { C, LEAVE_TINT } from "./palette";

export const CAL = {
  grid: "var(--crm-cal-grid)",
  todayBg: C.rust, todayFg: "#fff",
  /** A month grid's listed day. */
  selBg: "var(--crm-sel)",
  /** A range picker: its ends, the band between, today's ring. */
  pickBg: C.rust, pickFg: "#fff", rangeBg: C.tintAttention, todayRing: `inset 0 0 0 1.5px ${C.rust}`,
  dayFg: C.ink, outFg: C.faint2, offFg: C.disabled, outBg: "#fff",
  apptDot: "var(--crm-amber)",
} as const;

export type CalReason = "Annual" | "Sick" | "Training" | "Other";
const LEAVE: Record<CalReason, readonly [string, string]> = {
  Annual: ["var(--crm-series-tint-4)", "var(--crm-text-appt)"],
  Sick: ["var(--crm-tint-attention)", "var(--crm-oxblood)"],
  Training: ["var(--crm-tint-follow)", "var(--crm-brown)"],
  Other: LEAVE_TINT.Other,
};
/** A leave's [fill, words] by its reason. */
export const calLeave = (r: CalReason): [string, string] => [LEAVE[r][0], LEAVE[r][1]];

/** A day number's circle: today rust, picked ink, else none; its words. */
export function calDay(o: { today: boolean; picked: boolean; inMonth: boolean; off?: boolean }): { bg: string; fg: string; w: number } {
  if (o.picked) return { bg: CAL.pickBg, fg: CAL.pickFg, w: 600 };
  if (o.today) return { bg: CAL.todayBg, fg: CAL.todayFg, w: 600 };
  return { bg: "transparent", fg: o.off ? CAL.offFg : o.inMonth ? CAL.dayFg : CAL.outFg, w: 500 };
}
