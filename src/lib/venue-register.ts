/**
 * The venue register — every place the ERP has named, month by month.
 *
 * The month page's *Sales by venue* only lists the venues THAT month has bills
 * at, and Fair's two months share barely half their venues: 13 are August
 * only, 15 September only. So naming the organiser of every fair took as many
 * passes as there are months, and no screen ever showed the whole list. This
 * shapes `revenue_venue_register()` into that screen.
 *
 * The grain is the FAIR — one row per (place, month) — because the same venue
 * has a different organiser from month to month (`comm_venue_events`). A venue
 * with no bills at all still appears, with no months under it: it is a place
 * the ERP will name again.
 */

export type OrganiserSource = 'manual' | 'erp'

/** One fair: a place, a month, and who ran it. */
export interface VenueRegisterRow {
  /** The PLACE's key — canonical, never an alias. */
  venueKey: string
  displayName: string
  /** Other spellings folded into this place, tidy and alphabetical. */
  aliases: string[]
  /** `2026-08-01`, or null for a venue with no bills in any month. */
  periodMonth: string | null
  /** Whose month page this fair belongs to, for the link back. */
  subDepartmentId: string | null
  organiserId: string | null
  organiserName: string | null
  /** What the ERP called the organiser, if it ever sends one. */
  erpOrganiserText: string | null
  source: OrganiserSource | null
  people: number
  bills: number
  total: number
}

/** A place, with the fairs held there. */
export interface VenueRegisterVenue {
  venueKey: string
  displayName: string
  aliases: string[]
  /** Newest month first. Empty when the venue has no bills. */
  months: VenueRegisterRow[]
  bills: number
  total: number
  /** Months with an organiser named. */
  named: number
}

export interface RegisterSummary {
  venues: number
  /** (place, month) pairs with bills — the fairs that actually happened. */
  fairs: number
  named: number
  /**
   * Fairs the ERP named an organiser for that the register does not know.
   * Zero until the feed starts carrying the field; the whole point of keeping
   * the raw text is that this number is visible when it does.
   */
  unmatched: number
}

/** `2026-08-01` -> `Aug 2026`. Short, because a rail holds one per month. */
export function monthLabel(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Every month the register has bills in, newest first. */
export function registerMonths(rows: readonly VenueRegisterRow[]): string[] {
  const months = new Set<string>()
  for (const r of rows) if (r.periodMonth) months.add(r.periodMonth)
  return [...months].sort((a, b) => b.localeCompare(a))
}

/**
 * The register grouped into places, biggest first.
 *
 * With a `month`, only that month's fairs — one row per venue, which is the
 * shape for working down a month naming organisers. Venues with no bills that
 * month drop out: there was no fair to organise.
 *
 * Without one, every venue, each with its months newest first.
 */
export function groupByVenue(
  rows: readonly VenueRegisterRow[],
  month?: string | null,
): VenueRegisterVenue[] {
  const byKey = new Map<string, VenueRegisterVenue>()
  for (const r of rows) {
    if (month && r.periodMonth !== month) continue
    const venue =
      byKey.get(r.venueKey) ??
      {
        venueKey: r.venueKey,
        displayName: r.displayName,
        aliases: r.aliases,
        months: [],
        bills: 0,
        total: 0,
        named: 0,
      }
    if (r.periodMonth) {
      venue.months.push(r)
      venue.bills += r.bills
      venue.total = round2(venue.total + r.total)
      if (r.organiserName) venue.named += 1
    }
    byKey.set(r.venueKey, venue)
  }
  return [...byKey.values()]
    .map(v => ({
      ...v,
      months: [...v.months].sort((a, b) => (b.periodMonth ?? '').localeCompare(a.periodMonth ?? '')),
    }))
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName))
}

export function registerSummary(
  rows: readonly VenueRegisterRow[],
  month?: string | null,
): RegisterSummary {
  const venues = new Set<string>()
  let fairs = 0
  let named = 0
  let unmatched = 0
  for (const r of rows) {
    if (month && r.periodMonth !== month) continue
    venues.add(r.venueKey)
    if (!r.periodMonth) continue
    fairs += 1
    if (r.organiserName) named += 1
    else if (r.erpOrganiserText) unmatched += 1
  }
  return { venues: venues.size, fairs, named, unmatched }
}

/**
 * What each organiser has actually run, from the register's own rows.
 *
 * Counted here rather than in SQL because the register is already loaded and
 * the two numbers must agree: an organiser's "4 fairs · RM 1.2m" is exactly
 * the rows the venue table below it shows, never a second query that could
 * drift from them.
 */
export function organiserTotals(
  rows: readonly VenueRegisterRow[],
): Map<string, { fairs: number; bills: number; total: number }> {
  const totals = new Map<string, { fairs: number; bills: number; total: number }>()
  for (const r of rows) {
    if (!r.organiserId || !r.periodMonth) continue
    const t = totals.get(r.organiserId) ?? { fairs: 0, bills: 0, total: 0 }
    t.fairs += 1
    t.bills += r.bills
    t.total = round2(t.total + r.total)
    totals.set(r.organiserId, t)
  }
  return totals
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
