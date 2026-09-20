/**
 * The fair calendar — which days a fair was open, and therefore which month
 * its bills belong to.
 *
 * The ERP dates a sales order `so_date`: the day the document was opened in
 * the back office, days or weeks after the customer signed at the fair. That
 * is the wrong month for every fair that runs at month end, and the August
 * 2026 reconciliation measured what it costs — RM 674,744 of August's bills
 * sitting in September, and July's month-end fairs sitting in August.
 *
 * The feed cannot fix it: no delivery carries a fair, event or campaign date,
 * and `header.venue_id` has been NULL on every order ever received. So the
 * calendar is the portal's own fact, typed once per fair, and
 * `venue_event_for_order()` reads the month off it.
 *
 * Everything here is pure string and number work on `YYYY-MM-DD` dates. Month
 * arithmetic is done by slicing rather than by `Date`, because a fair on the
 * 1st or the 31st is exactly where a timezone shifts a parsed date into the
 * wrong month.
 */

/** One fair: a place, the days it was open, and who ran it. */
export interface Fair {
  fairId: string
  venueKey: string
  displayName: string
  /** The month its bills count in. Always the 1st. */
  periodMonth: string
  /** `YYYY-MM-DD`, or null on a legacy row that only names the organiser. */
  startDate: string | null
  endDate: string | null
  organiserId: string | null
  organiserName: string | null
  erpOrganiserText: string | null
  source: 'manual' | 'erp'
  notes: string | null
  /** Bills stamped to this fair, wherever they currently sit. */
  bills: number
  total: number
  /** Of those, how many are still in a different month than the fair. */
  billsToMove: number
  valueToMove: number
}

/** Bills that belong to no fair yet, grouped by place and order month. */
export interface FairGap {
  venueKey: string
  displayName: string
  periodMonth: string
  bills: number
  total: number
  firstOrder: string
  lastOrder: string
  spreadDays: number
}

/**
 * A fair does not run for three weeks. When the bills at one place spread
 * wider than this, that month held more than one fair there and the gap needs
 * splitting into several rows rather than covered by one wide window.
 *
 * Eight days: a long fair is Friday to the following Sunday (10 days keyed in
 * over 8), and the August data separates cleanly at this width — the real
 * fairs measured 0–4 days of spread, the two-fair places 14–25.
 */
export const MULTI_FAIR_SPREAD_DAYS = 8

export function gapLooksLikeSeveralFairs(gap: FairGap): boolean {
  return gap.spreadDays > MULTI_FAIR_SPREAD_DAYS
}

/** `2026-08-28` -> `2026-08-01`. Slicing, not Date: see the module note. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/**
 * The months a fair may be counted in: the month it opened, and the month it
 * closed when those differ. A fair over month end (30 Aug – 2 Sep) is a real
 * thing and only the person who was there knows which payroll it belongs to,
 * so both are offered and the database accepts either.
 */
export function candidateMonths(startDate: string, endDate: string): string[] {
  const a = monthOf(startDate)
  const b = monthOf(endDate)
  return a === b ? [a] : [a, b]
}

/**
 * Why this window cannot be saved, or null. The database enforces all of it
 * too — this is so the answer arrives before the round trip.
 */
export function fairWindowError(
  startDate: string,
  endDate: string,
  periodMonth: string,
): string | null {
  if (!startDate || !endDate) return 'A fair needs both a first and a last day'
  if (endDate < startDate) return 'The fair cannot close before it opens'
  if (!candidateMonths(startDate, endDate).includes(periodMonth)) {
    return 'A fair counts in the month it opened or the month it closed'
  }
  return null
}

/** Whether two windows share a day. Inclusive at both ends, like the database. */
export function windowsOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

/**
 * The fairs at one place that a new window would collide with. The database
 * refuses the overlap outright (`comm_venue_events_no_overlap`), so this only
 * exists to name the offender instead of showing a constraint code.
 */
export function collidingFairs(
  fairs: readonly Fair[],
  venueKey: string,
  window: { startDate: string; endDate: string },
  ignoreFairId?: string,
): Fair[] {
  return fairs.filter(
    f =>
      f.venueKey === venueKey &&
      f.fairId !== ignoreFairId &&
      f.startDate !== null &&
      f.endDate !== null &&
      windowsOverlap({ startDate: f.startDate, endDate: f.endDate }, window),
  )
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function parts(date: string): { d: number; m: number; y: number } {
  return {
    y: Number(date.slice(0, 4)),
    m: Number(date.slice(5, 7)),
    d: Number(date.slice(8, 10)),
  }
}

/**
 * `28–31 Aug 2026`, or `30 Aug – 2 Sep 2026` over a month end, or `9 Aug 2026`
 * for a one-day fair. Read far more often than it is typed, so it collapses
 * whatever the two dates share.
 */
export function fairWindowLabel(startDate: string | null, endDate: string | null): string {
  if (!startDate || !endDate) return '—'
  const a = parts(startDate)
  const b = parts(endDate)
  const month = (m: number) => MONTH_NAMES[m - 1] ?? '??'
  if (startDate === endDate) return `${a.d} ${month(a.m)} ${a.y}`
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${month(a.m)} ${a.y}`
  if (a.y === b.y) return `${a.d} ${month(a.m)} – ${b.d} ${month(b.m)} ${a.y}`
  return `${a.d} ${month(a.m)} ${a.y} – ${b.d} ${month(b.m)} ${b.y}`
}

/** `2026-08-01` -> `Aug 2026`. The twin of venue-register's monthLabel. */
export function fairMonthLabel(periodMonth: string): string {
  const p = parts(periodMonth)
  return `${MONTH_NAMES[p.m - 1] ?? '??'} ${p.y}`
}

export interface FairCalendarSummary {
  /** Fairs with real days on them — the ones that can place a bill. */
  dated: number
  /** Legacy rows that only name a month's organiser. */
  undated: number
  /** Bills sitting in a month their fair disagrees with. */
  billsToMove: number
  valueToMove: number
  /** Bills belonging to no fair at all. */
  unplacedBills: number
  unplacedValue: number
  /** Places × months still to type, of which these look like several fairs. */
  gaps: number
  gapsNeedingSplit: number
}

export function fairCalendarSummary(
  fairs: readonly Fair[],
  gaps: readonly FairGap[],
): FairCalendarSummary {
  return {
    dated: fairs.filter(f => f.startDate !== null).length,
    undated: fairs.filter(f => f.startDate === null).length,
    billsToMove: fairs.reduce((n, f) => n + f.billsToMove, 0),
    valueToMove: fairs.reduce((n, f) => n + f.valueToMove, 0),
    unplacedBills: gaps.reduce((n, g) => n + g.bills, 0),
    unplacedValue: gaps.reduce((n, g) => n + g.total, 0),
    gaps: gaps.length,
    gapsNeedingSplit: gaps.filter(gapLooksLikeSeveralFairs).length,
  }
}

/**
 * The fairs, newest first, a dated fair ranking on the day it opened and an
 * undated one on its month. Matches the RPC's own order so the page does not
 * depend on which of the two sorted it.
 */
export function sortFairs(fairs: readonly Fair[]): Fair[] {
  return [...fairs].sort((a, b) => {
    const ka = a.startDate ?? a.periodMonth
    const kb = b.startDate ?? b.periodMonth
    if (ka !== kb) return kb.localeCompare(ka)
    return a.displayName.localeCompare(b.displayName)
  })
}
