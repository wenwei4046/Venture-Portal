// dayjs, on the office's clock.
//
// A server component that prints a moment with `dayjs(x).format('… HH:mm')`
// prints it in the SERVER's zone. Vercel keeps UTC and the office is UTC+8, so
// every time a page rendered on the server was eight hours slow: a voucher sent
// at 12:47 read "04:47" on the Approvals page (user 2026-10-02, on the voucher
// page first; then asked for the rest).
//
// `officeTime(x)` is `dayjs(x)` moved to +08:00, so every existing format
// string keeps working and only the zone changes:
//
//     dayjs(row.created_at).format('D MMM YYYY HH:mm')        // 04:47 on Vercel
//     officeTime(row.created_at).format('D MMM YYYY HH:mm')   // 12:47 everywhere
//
// A fixed offset, not a zone lookup: Malaysia has kept UTC+8 without daylight
// saving since 1982, and a fixed offset needs no timezone database on the
// server. The same instant gives the same string in the browser, so a
// component rendered on both sides cannot disagree with itself.
//
// For a MOMENT only (created_at, approved_at, now). A date column such as
// payment_date has no time and no zone; format it as it is — and a value that
// may be either goes through `officeDay` below.
//
// "Now" is a moment too: `officeTime()` is the office's now, and
// `officeToday()` / `officeMonth()` its day and month. A server that asks
// `dayjs()` or `new Date()` for today gets UTC's today, which until 08:00 in
// the office is yesterday — and on the 1st, last month.

import dayjs, { type ConfigType, type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

const OFFICE_UTC_OFFSET_MINUTES = 8 * 60

export function officeTime(at?: ConfigType): Dayjs {
  return dayjs(at).utcOffset(OFFICE_UTC_OFFSET_MINUTES)
}

/**
 * Today in the office, `YYYY-MM-DD` — what a server must use for "today"
 * (a default payment date, an "as at" day, a day picker's default).
 *
 * `dayjs().format('YYYY-MM-DD')` asks the MACHINE's calendar: on Vercel (UTC)
 * it was still yesterday until 08:00 in the office, so a voucher keyed at
 * 07:30 was dated the day before and /daily-bank opened on yesterday
 * (2026-10-08). The same day as `officeDate()` in office-clock.ts.
 */
export function officeToday(): string {
  return officeTime().format('YYYY-MM-DD')
}

/**
 * This month in the office, `YYYY-MM` — a report's default period, the month
 * a new document is filed under. On the 1st, until 08:00, the server's own
 * calendar still says last month.
 */
export function officeMonth(): string {
  return officeTime().format('YYYY-MM')
}

/**
 * When a calendar day begins in the office, as an instant:
 * `officeDayStart('2026-10-01')` = `2026-09-30T16:00:00.000Z`. The bound of a
 * range over a timestamp column — handed a bare `2026-10-01`, the database
 * reads UTC midnight, eight hours into the office's day, so whatever happened
 * before 08:00 on the 1st was counted in the month before.
 */
export function officeDayStart(day: string): string {
  return new Date(`${day.slice(0, 10)}T00:00:00+08:00`).toISOString()
}

/** A date column as PostgREST sends it: `2026-09-29`, no time and no zone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The office's day for a value that is sometimes a date column and sometimes
 * a moment — the payments ledger's `payment_date ?? created_at`. A bare
 * `YYYY-MM-DD` already names its day and is read as it is (through
 * `officeTime` it would land on the day before for a reader east of UTC+8); a
 * moment moves to the office clock.
 *
 * `dayjs(x).format('D MMM')` read the moment on the MACHINE's clock: a voucher
 * made after midnight in the office was "10 Sep" on the server (UTC) and
 * "11 Sep" in the browser, and React threw the server's page away (2026-10-08).
 */
export function officeDay(at: string): Dayjs {
  return DATE_ONLY.test(at) ? dayjs(at) : officeTime(at)
}
