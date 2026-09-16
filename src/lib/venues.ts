/**
 * Fair venues — the place an event was held, and who ran it.
 *
 * The ERP names the venue on every sales order and says nothing about the
 * ORGANISER, so the two facts live apart: the venue travels on the order
 * (`sales_orders.venue`), the organiser is the portal's own register
 * (`comm_venues`, keyed by the matching key below). Nothing here reaches the
 * ERP — an organiser typed on the month page stays typed however many times
 * that venue is delivered again.
 *
 * The matching key must agree with SQL's `venue_key()`: upper case, single
 * spaces, empty becomes nothing.
 */

export interface VenueRegistryRow {
  venueKey: string
  displayName: string
  organizer: string | null
  notes: string | null
}

export interface VenueSales {
  venueKey: string
  /** The spelling the orders carry; the register's name when the month has none. */
  displayName: string
  organizer: string | null
  orders: number
  /** People with at least one order at this venue. */
  people: number
  total: number
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

export interface VenueOrderInput {
  venue: string | null
  staffKey: string | null
  amount: number
}

/**
 * A month's orders grouped by venue, biggest first, with the register's
 * organiser attached. Orders with no venue are collected under one unnamed
 * row rather than dropped — a venue the ERP forgot is a gap HR should see.
 */
export function salesByVenue(
  orders: VenueOrderInput[],
  register: Map<string, { displayName: string; organizer: string | null }>,
): VenueSales[] {
  const byKey = new Map<string, VenueSales & { staff: Set<string> }>()
  for (const o of orders) {
    const key = venueKey(o.venue) ?? ''
    const row =
      byKey.get(key) ??
      {
        venueKey: key,
        displayName: venueName(o.venue) ?? register.get(key)?.displayName ?? '(no venue)',
        organizer: register.get(key)?.organizer ?? null,
        orders: 0,
        people: 0,
        total: 0,
        staff: new Set<string>(),
      }
    row.orders += 1
    row.total = round2(row.total + o.amount)
    if (o.staffKey) row.staff.add(o.staffKey)
    byKey.set(key, row)
  }
  return [...byKey.values()]
    .map(({ staff, ...rest }) => ({ ...rest, people: staff.size }))
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName))
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
