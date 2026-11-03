/**
 * Sales exhibitions — one BRAND at one fair (2026-10-03).
 *
 * The month page's *Sales exhibition* tab, *Sales by venue* until then. A
 * venue is not what a result is read by (user 2026-10-03): 我做 Akemi，然后在
 * 哪个 venue、什么 organizer、什么日期 — and 同一个日期里，可能会在同一个
 * venue、同一个 organizer，但是是不同的 brand. The same hall, organiser and
 * days with another brand is ANOTHER exhibition, which is how the ERP opens
 * them (one project per brand booth: MVEC SOUTHKEY 18–20 Sep MLE is projects
 * 344 + 345) and how the Arena ranks the Revenue Team (by brand).
 *
 * The fair — place, days, organiser — is the bill's `fair_event_id`, which
 * folds an event's booths into one row (`erp_sync_fair`). The BRAND is the
 * BOOTH the salesperson picked when opening the bill in the ERP: a Dunlopillo
 * pillow sold at the Akemi booth is the Akemi exhibition's (user 2026-10-03 —
 * 还是会落在他选的那个 venue、那个 fair 那一边). A bill with no booth goes by
 * its own brand (`sales_orders.brand_code`: its goods, or the brand the
 * salesperson named in the ERP for goods that name none — a bed frame alone),
 * and a bill with neither has no brand. Only the grouping follows the booth:
 * the margin ladder still reads the bill's own brand.
 */

import { brandCodeFor, type BrandWords } from './brand-code'
import { venueKey, venueName } from './venues'

/** One row of *Sales exhibition*: a brand at a fair, or a brand's bills at a place no fair claims. */
export interface ExhibitionSales {
  /** `fair:<id>` or `place:<key>`, then `|<brand>` — '' for bills that name no brand. */
  key: string
  /** The exhibition's brand (`exhibitionBrandOf`). Null for bills with no booth and no brand. */
  brand: string | null
  /** The PLACE's key. '' for bills that name no venue. */
  venueKey: string
  displayName: string
  fairId: string | null
  /** The days the fair was open ("4–6 Sep"). Null when no fair claims these bills. */
  event: string | null
  organizer: string | null
  orders: number
  /** People with at least one bill here. */
  people: number
  /** Everything on the bills, transport and every other charge included. */
  total: number
  /** The part of those bills that earns commission. */
  commissionable: number
}

export interface ExhibitionOrderInput {
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
  /** The fair the bill was placed at (`sales_orders.fair_event_id`), with its place. */
  fair?: { id: string; venueKey: string; venueName: string } | null
  /** That fair's days, as the rest of the month page prints them. */
  event?: string | null
  organizer?: string | null
  /** The exhibition's brand — the booth's, else the bill's own (`exhibitionBrandOf`). */
  brand: string | null
  staffKey: string | null
  amount: number
  commissionable?: number
}

/** `?brand=none` on All bills: the bills that name no brand. Brand codes are upper case. */
export const NO_BRAND = 'none'
/** `?fair=none` on All bills: the bills no fair claims. A fair is a uuid. */
export const NO_FAIR = 'none'

/** A brand code as stored, or null when there is none. */
function brandOf(code: string | null | undefined): string | null {
  return code?.trim() || null
}

/**
 * A brand the portal sells under: its code, its name and its sub-brands. The
 * portal's brand an ERP brand name stands for — `DUNLOPILLO` is `DUNLOP`,
 * `HAPPI SLEEP` is `AKEMI` — is `brandCodeFor`, SQL's `erp_sync_brand_code`.
 */
export type BrandName = BrandWords
export { brandCodeFor }

/**
 * The booth a bill was written at, as the ERP's fair picker named it
 * (`raw.fair.brand`) — only while the bill's fair IS that pick
 * (`fair_source = 'erp'`) and the project was not cancelled, the way
 * `erp_sync_order_brand` reads it. A fair a person pinned, or the calendar
 * guessed from the venue, has no booth.
 */
export function boothOf(bill: { fairSource: string | null; boothBrand: string | null; boothStatus: string | null }): string | null {
  if (bill.fairSource !== 'erp' || bill.boothStatus === 'cancelled') return null
  return bill.boothBrand?.trim() || null
}

/**
 * The brand an exhibition is (user 2026-10-03): the booth the salesperson
 * picked — a Dunlopillo pillow sold at the Akemi booth is the Akemi
 * exhibition's — in the portal's own code where it has one, the ERP's name
 * where it has not; else the bill's own brand; else none.
 */
export function exhibitionBrandOf(
  bill: { booth: string | null; brandCode: string | null },
  brands: readonly BrandName[],
): string | null {
  const booth = bill.booth?.trim()
  if (booth) return brandCodeFor(booth, brands) ?? booth.toUpperCase().replace(/\s+/g, ' ')
  return brandOf(bill.brandCode)
}

/**
 * The place a bill was written at: the merged place, else its own spelling,
 * else '' — what *Sales exhibition* groups unclaimed bills by and All bills'
 * `?venue=` matches, so the two always agree on which bills are one place's.
 */
export function placeOf(bill: { venue: string | null; groupKey?: string | null }): string {
  return (bill.groupKey ?? undefined) || venueKey(bill.venue) || ''
}

/**
 * A month's bills by the EXHIBITION they were written at, biggest first.
 *
 * A fair's bills split by brand; bills no fair claims fall back to their
 * PLACE — the canonical one, so the several spellings a venue arrives under
 * still read as one — split by brand the same way. Bills with no venue at all
 * are collected rather than dropped, and so are bills with no brand: both are
 * gaps HR should see, not sales to lose from the total.
 */
export function salesByExhibition(orders: ExhibitionOrderInput[]): ExhibitionSales[] {
  const byKey = new Map<string, ExhibitionSales & { staff: Set<string> }>()
  for (const o of orders) {
    const place = placeOf({ venue: o.venue, groupKey: o.groupKey })
    const brand = brandOf(o.brand)
    const key = `${o.fair ? `fair:${o.fair.id}` : `place:${place}`}|${brand ?? ''}`
    const row =
      byKey.get(key) ??
      {
        key,
        brand,
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
        (a.event ?? '').localeCompare(b.event ?? '') ||
        (a.brand ?? '').localeCompare(b.brand ?? ''),
    )
}

/**
 * The All bills query that lists exactly one exhibition's bills. A fair's
 * bills are the fair's whatever venue the document typed (an ERP pick beats
 * the typing), so a fair is matched on its own; a place's are the bills there
 * that no fair claims.
 */
export function exhibitionQuery(row: Pick<ExhibitionSales, 'fairId' | 'venueKey' | 'brand'>): string {
  const q = new URLSearchParams()
  if (row.fairId) {
    q.set('fair', row.fairId)
  } else {
    q.set('venue', row.venueKey)
    q.set('fair', NO_FAIR)
  }
  q.set('brand', row.brand ?? NO_BRAND)
  return q.toString()
}

/** All bills' `?fair=` and `?brand=`, as the URL carries them; absent means any. */
export interface ExhibitionFilter {
  fair?: string
  brand?: string
}

/** Whether a bill — its exhibition brand and its fair — is one the exhibition filter keeps. */
export function inExhibition(
  bill: { brand: string | null; fairId: string | null },
  filter: ExhibitionFilter,
): boolean {
  if (filter.brand !== undefined) {
    const brand = brandOf(bill.brand)
    if (filter.brand === NO_BRAND ? brand !== null : brand !== filter.brand) return false
  }
  if (filter.fair !== undefined) {
    if (filter.fair === NO_FAIR ? bill.fairId !== null : bill.fairId !== filter.fair) return false
  }
  return true
}

/** How a brand reads on the page: its code, or that the bills name none. */
export function brandLabel(brand: string | null): string {
  return brand ?? 'No brand'
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
