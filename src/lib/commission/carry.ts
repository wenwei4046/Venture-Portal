/**
 * WHEN AN UNPAID BILL IS PAID (2026-10-06).
 *
 * A bill's month is its own — the day it was sold (user: by record it follows
 * the date, never a close). A close decides only when a bill is PAID: one a
 * month's close did not pay (still under the deposit, or keyed after it) is
 * paid by the first month still open for its salesperson. So a month's run
 * carries a bill of an earlier month only once that month is closed for the
 * bill's salesperson — their own close on Comm Cal, or the whole month's run
 * applied. Before that it is still its own month's to pay.
 *
 * Comm Cal used to carry every earlier bill no run had released. On 6 October,
 * with nobody closed for September yet, that put all 357 September bills into
 * October's page a second time (Fair RM 185,329.41 instead of RM 24,834.81).
 * Months before the cutover never ride at all (`loadCommissionInput`).
 */

/** 'YYYY-MM-DD' → the first of the month after it. */
function monthAfter(month: string): string {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/**
 * The month whose run pays a bill no run has paid yet: its own month while that
 * month is open for its salesperson, else the first month after the last one
 * closed for them. 'YYYY-MM-01' in and out.
 */
export function payMonth(own: string, lastClosed: string | null, lastRun: string | null): string {
  let month = own.slice(0, 10);
  for (const closed of [lastClosed, lastRun]) {
    if (closed && monthAfter(closed) > month) month = monthAfter(closed);
  }
  return month;
}

/** Who has been closed on Comm Cal, and for which months ('YYYY-MM-01'). */
export interface MonthCloses {
  /** Standing closes — a reopened one is not. */
  closes: readonly { staffId: string; periodMonth: string }[];
  /** Months whose run was applied (or locked) for everybody. */
  appliedRuns: readonly string[];
}

/** Which bills of earlier months a run of `period` ('YYYY-MM-01') pays. */
export function carriesInto(period: string, facts: MonthCloses): (order: { staffId: string | null; periodMonth: string }) => boolean {
  const lastClosed = new Map<string, string>();
  for (const { staffId, periodMonth } of facts.closes) {
    const month = periodMonth.slice(0, 10);
    if (month > (lastClosed.get(staffId) ?? "")) lastClosed.set(staffId, month);
  }
  const lastRun = facts.appliedRuns.reduce<string | null>((last, m) => (m.slice(0, 10) > (last ?? "") ? m.slice(0, 10) : last), null);
  const target = period.slice(0, 10);
  return order => payMonth(order.periodMonth, order.staffId ? lastClosed.get(order.staffId) ?? null : null, lastRun) === target;
}
