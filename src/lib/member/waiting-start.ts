/**
 * A waiting list's joining date (2026-10-14, the user: "For the waiting list,
 * add on one things for join date, any time ready. Cause some of them is
 * anytime ready, just wait us to let then join"): a day, YYYY-MM-DD, or ANY
 * TIME — ready to start whenever HR calls them. Kept in the request's
 * `detail.start` as the word `anytime`, so the question stays one answer and
 * "required" still means "answered"; never a word Postgres reads as a date
 * (`today`, `now`, `infinity` … are). The database takes it where it reads the
 * date (`member_prepare_request`, `member_waiting_add`, mig 20261014213000).
 *
 * Pure, so HR's "+" window, the Revenue app's form and every list share it.
 */

export const ANY_TIME = "anytime";

/** How it reads — the choice on a form and the fact on a list. */
export const ANY_TIME_LABEL = "Any time ready";

export function isAnyTime(start: string | null | undefined): boolean {
  return start === ANY_TIME;
}

/** "2026-11-01" and a day the calendar has. */
export function isDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** A joining date answered: a day the calendar has, or any time. */
export function isJoiningDate(v: string): boolean {
  return isAnyTime(v) || isDay(v);
}

/** The joining date in words: "Any time ready", else the day as `day` writes it. */
export function joiningLabel(start: string | null | undefined, day: (date: string) => string): string {
  return isAnyTime(start) ? ANY_TIME_LABEL : day(start ?? "");
}
