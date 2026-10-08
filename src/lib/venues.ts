/**
 * Fair venues — the place an event was held.
 *
 * The venue travels on the order (`sales_orders.venue`); the organiser hangs
 * off the FAIR, not the place, because the same hall has a different
 * organiser from month to month (`comm_venue_events`). Since 2026-09-27 the
 * ERP names the fair on every order — the salesperson picks the event — and
 * `erp_sync_fair` keeps it. `comm_venues` is the register of places and of
 * which spellings are one place (`canonical_key`). What the month's bills
 * come to at each brand's booth is `lib/exhibitions.ts` (2026-10-03).
 *
 * The matching key must agree with SQL's `venue_key()`: upper case, single
 * spaces, empty becomes nothing.
 */

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
