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
  /** The venue this spelling really is. Null when this row is itself a place. */
  canonicalKey: string | null
}

export interface VenueSales {
  /** The PLACE's key — the canonical one when the spelling has been merged. */
  venueKey: string
  /** The spelling the orders carry; the register's name when the month has none. */
  displayName: string
  organizer: string | null
  /**
   * Every ERP spelling that rolled into this place, tidy and alphabetical.
   * One entry is the ordinary case; more than one means somebody merged them.
   */
  spellings: string[]
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
  staffKey: string | null
  amount: number
}

/**
 * A month's orders grouped by PLACE, biggest first, with the organiser
 * attached.
 *
 * The ERP's venue is free text typed at the fair, so one place arrives under
 * several spellings; `canonical_key` in the register is where somebody records
 * that they are the same place, and `venue_group_key` on each order is that
 * answer applied. Grouping on it here — rather than on the raw spelling —
 * is what makes an event one row and one organiser rather than three.
 *
 * Orders with no venue are collected under one unnamed row rather than
 * dropped: a venue the ERP forgot is a gap HR should see.
 */
export function salesByVenue(
  orders: VenueOrderInput[],
  register: Map<string, { displayName: string; organizer: string | null }>,
): VenueSales[] {
  const byKey = new Map<string, VenueSales & { staff: Set<string>; seen: Set<string> }>()
  for (const o of orders) {
    const key = (o.groupKey ?? undefined) || venueKey(o.venue) || ''
    const row =
      byKey.get(key) ??
      {
        venueKey: key,
        displayName:
          o.groupName ??
          register.get(key)?.displayName ??
          venueName(o.venue) ??
          '(no venue)',
        organizer: register.get(key)?.organizer ?? null,
        spellings: [],
        orders: 0,
        people: 0,
        total: 0,
        staff: new Set<string>(),
        seen: new Set<string>(),
      }
    row.orders += 1
    row.total = round2(row.total + o.amount)
    if (o.staffKey) row.staff.add(o.staffKey)
    const spelling = venueName(o.venue)
    if (spelling) row.seen.add(spelling)
    byKey.set(key, row)
  }
  return [...byKey.values()]
    .map(({ staff, seen, ...rest }) => ({
      ...rest,
      people: staff.size,
      spellings: [...seen].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName))
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
