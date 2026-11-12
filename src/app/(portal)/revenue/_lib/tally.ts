import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addMonths, buildTally, twoMonthOrderIds, type TallyBrand, type TallyOrder, type TallyReport,
} from '@/lib/commission/tally'
import { startRead } from '@/lib/start-read'
import { loadMonthOrders } from './month-orders'
import { loadOrderFairs } from './order-fairs'
import { loadFeedFloor } from './row-origins'

/**
 * Comm Cal › Tally (2026-11-12): every bill of the sub-department's months in
 * its two calendars — the ERP's SO date (what Houzs pays by) and the portal's
 * month (what we pay the salesperson by) — read under the viewer's own session.
 *
 * A month's bills come from `revenue_month_orders`, the month page's own read:
 * the same bills, the same "what earns" figure, nothing new in the database.
 */

/** The Tally shows a year of months; a bill is keyed at most a few weeks after its fair. */
const MONTHS_SHOWN = 12
/** Months read before the first one shown, for the bills keyed into it late. */
const MONTHS_BEFORE = 3
/** Months asked at a time. */
const AT_ONCE = 6

interface BrandRow {
  code: string
  name: string
  ref_prefixes: string[] | null
  hc_bill_pct: number | string | null
  own_scheme: boolean | null
}

export async function loadTally(
  db: SupabaseClient,
  sub: { id: string; schemeId: string | null },
  /** The months with a committed batch, `YYYY-MM-01`. */
  periods: readonly string[],
  /** The first month the portal pays; null when it pays every month. */
  firstPaidMonth: string | null,
): Promise<TallyReport> {
  const sorted = [...new Set(periods.map(p => p.slice(0, 10)))].sort()
  if (sorted.length === 0 || !sub.schemeId) return { from: null, months: [], twoMonthBills: 0, noPctBills: 0 }

  // A year back from the latest month, never before the portal began paying.
  const window = addMonths(sorted[sorted.length - 1], -(MONTHS_SHOWN - 1))
  const start = firstPaidMonth && firstPaidMonth.slice(0, 10) > window ? firstPaidMonth.slice(0, 10) : window
  const from = firstPaidMonth || sorted[0] < start ? start : null
  const wanted = sorted.filter(p => p >= addMonths(start, -MONTHS_BEFORE))

  const brandsRead = startRead(
    db
      .from('comm_brands')
      .select('code, name, ref_prefixes, hc_bill_pct, own_scheme')
      .eq('scheme_id', sub.schemeId)
      .order('code')
      .then(({ data, error }) => {
        if (error) throw new Error(`Could not read the brands: ${error.message}`)
        return (data ?? []) as BrandRow[]
      }),
  )
  const floorRead = startRead(loadFeedFloor(db, sub.id))

  const orders: TallyOrder[] = []
  for (let i = 0; i < wanted.length; i += AT_ONCE) {
    const chunk = wanted.slice(i, i + AT_ONCE)
    const months = await Promise.all(chunk.map(period => loadMonthOrders(db, sub.id, period)))
    months.forEach((rows, at) => {
      for (const o of rows) {
        orders.push({
          orderId: o.orderId,
          orderNo: o.orderNo,
          refNo: o.refNo,
          periodMonth: chunk[at],
          orderDate: o.orderDate,
          salesperson: o.employeeName ?? o.agentName,
          customer: o.customerName,
          brandCode: o.brandCode,
          commissionable: o.commissionable,
          cancelled: o.cancelled,
          excludedReason: o.excludedReason,
          depositMet: o.depositMet,
        })
      }
    })
  }

  const [brandRows, feedFloor] = await Promise.all([brandsRead, floorRead])
  const brands: TallyBrand[] = brandRows.map(b => ({
    code: b.code,
    name: b.name,
    refPrefixes: b.ref_prefixes ?? [],
    hcBillPct: b.hc_bill_pct === null ? null : Number(b.hc_bill_pct),
    ownScheme: b.own_scheme === true,
  }))

  // The fair day is read only for the bills the gap is made of.
  const fairs = await loadOrderFairs(db, twoMonthOrderIds(orders, feedFloor))
  const fairDates = new Map([...fairs.entries()].map(([id, fair]) => [id, fair.fairDate]))

  return buildTally(orders, brands, { feedFloor, from, fairDates })
}
