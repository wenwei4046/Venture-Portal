/**
 * Fair venues — the place an event was held.
 *
 * The ERP names the venue on every sales order and says nothing about who
 * ORGANISED the event, so the two facts live apart: the venue travels on the
 * order (`sales_orders.venue`), the organiser is the portal's own — and since
 * 2026-09-17 it hangs off the FAIR, not the place, because the same hall has a
 * different organiser from month to month (`comm_venue_events`, shaped by
 * `lib/venue-register.ts`). `comm_venues` is the register of places and of
 * which spellings are one place (`canonical_key`).
 *
 * The matching key must agree with SQL's `venue_key()`: upper case, single
 * spaces, empty becomes nothing.
 */

/** One row of the month's *Sales by venue*: a fair, or a place's bills no fair claims. */
export interface FairSales {
  /** `fair:<id>` for the bills a fair claims, `place:<key>` for a place's unclaimed ones. */
  key: string
  /** The PLACE's key — what the All bills page filters on. '' for bills that name no venue. */
  venueKey: string
  displayName: string
  fairId: string | null
  /** The days the fair was open ("4–6 Sep"). Null when no fair claims these bills. */
  event: string | null
  organizer: string | null
  orders: number
  /** People with at least one order here. */
  people: number
  /** Everything on the bills, transport and every other charge included. */
  total: number
  /** The part of those bills that earns commission. */
  commissionable: number
}

/** `  spice   arena ` → `SPICE ARENA`. Empty or blank is null. */
export function venueKey(venue: string | null | undefined): string | null {
  if (venue === null || venue === undefined) return null
  const squeezed = venue.trim().replace(/\s+/g, ' ')
  return squeezed === '' ? null : squeezed.toUpperCase()
}

/** The tidy spelling a venue is stored and shown under. */
export function venueName(venue: string | null | undefined): string | null {
  if (venue === null || venue === undefined) return null
  const squeezed = venue.trim().replace(/\s+/g, ' ')
  return squeezed === '' ? null : squeezed
}

export interface FairOrderInput {
  /** The spelling on the document. */
  venue: string | null
  /**
   * The place that spelling belongs to, as the database resolved it
   * (`venue_group_key`). Left out, the spelling is its own place — which is
   * what an unmerged venue is anyway.
   */
  groupKey?: string | null
  /** The place's tidy name, when the register knows it. */
  groupName?: string | null
  /** The fair the calendar placed this bill at (`sales_orders.fair_event_id`), with its place. */
  fair?: { id: string; venueKey: string; venueName: string } | null
  /** That fair's days, as the rest of the month page prints them. */
  event?: string | null
  organizer?: string | null
  staffKey: string | null
  amount: number
  commissionable?: number
}

/**
 * A month's bills by the FAIR they were written at, biggest first (2026-09-26).
 *
 * Nobody picks a venue or an organiser here any more: the fair calendar on
 * Revenue › Venues stamps every bill with its fair by trigger
 * (`sales_orders.fair_event_id`), and the fair carries the place, the days and
 * the organiser. So the row is the fair, not the place — one hall holds two
 * fairs in a month with a different organiser each, and a row per place would
 * have to pick one of them.
 *
 * Bills no fair claims fall back to their PLACE — the canonical one, so the
 * several spellings a venue arrives under still read as one row — and bills
 * with no venue at all are collected under one unnamed row rather than
 * dropped: a venue the ERP forgot is a gap HR should see.
 */
export function salesByFair(orders: FairOrderInput[]): FairSales[] {
  const byKey = new Map<string, FairSales & { staff: Set<string> }>()
  for (const o of orders) {
    const place = (o.groupKey ?? undefined) || venueKey(o.venue) || ''
    const key = o.fair ? `fair:${o.fair.id}` : `place:${place}`
    const row =
      byKey.get(key) ??
      {
        key,
        venueKey: o.fair?.venueKey ?? place,
        displayName: o.fair?.venueName ?? o.groupName ?? venueName(o.venue) ?? '(no venue)',
        fairId: o.fair?.id ?? null,
        event: o.fair ? (o.event ?? null) : null,
        organizer: null,
        orders: 0,
        people: 0,
        total: 0,
        commissionable: 0,
        staff: new Set<string>(),
      }
    row.orders += 1
    row.total = round2(row.total + o.amount)
    row.commissionable = round2(row.commissionable + (o.commissionable ?? 0))
    row.organizer ??= o.organizer ?? null
    if (o.staffKey) row.staff.add(o.staffKey)
    byKey.set(key, row)
  }
  return [...byKey.values()]
    .map(({ staff, ...rest }) => ({ ...rest, people: staff.size }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.displayName.localeCompare(b.displayName) ||
        (a.event ?? '').localeCompare(b.event ?? ''),
    )
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
