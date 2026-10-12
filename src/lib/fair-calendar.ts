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
 * Until 2026-09-27 the calendar was typed by hand on Revenue › Venues. Now the
 * ERP names the fair on every sales order — the salesperson has to pick the
 * event to open one — and `erp_sync_fair` keeps it, so a fair here is mostly
 * the ERP's (`source = 'erp'`). Since 2026-10-12 nobody moves a bill into its
 * fair's month either: a bill keyed after its fair's month is paid in the
 * month it sits in, marked *Late key-in* on the ledger (`saleMonthOf`,
 * `lib/commission/row-origin.ts`).
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
  /**
   * Of THOSE, how many the ERP or a person placed at this fair (`fair_source`
   * `erp` / `manual`). The rest are `venue_event_for_order`'s guess.
   */
  confirmedToMove: number
  confirmedValueToMove: number
}

/**
 * The month a bill at a fair was SOLD in — the TS twin of SQL
 * `sales_order_sale_month()` (mig 20261006140000): the month of the day the
 * ERP says it was sold (`raw.fair.fairDate`) when that day is one of the
 * fair's, else the fair's own month. Null for a bill no fair claims.
 *
 * A bill keyed after its fair's month sits where it was keyed and is paid
 * there (2026-10-12); this is how its ledger row knows it is a late key-in.
 */
export function saleMonthOf(
  fairDate: string | null | undefined,
  fair: Pick<Fair, 'startDate' | 'endDate' | 'periodMonth'> | null | undefined,
): string | null {
  if (!fair) return null
  const day = typeof fairDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fairDate) ? fairDate.slice(0, 10) : null
  if (day && fair.startDate && day >= fair.startDate && day <= (fair.endDate ?? fair.startDate)) {
    return `${day.slice(0, 7)}-01`
  }
  return fair.periodMonth.slice(0, 10)
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
