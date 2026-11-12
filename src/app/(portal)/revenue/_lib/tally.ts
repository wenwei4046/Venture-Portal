import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addMonths, commissionByMonth, tallyBills, tallyMonthExport, tallyOf,
  type TallyBrand, type TallyClose, type TallyCommission, type TallyMonthExport, type TallyOrder, type TallyReport,
} from '@/lib/commission/tally'
import { fetchAllRows, fetchAllRowsAsWritten } from '@/lib/paginate'
import { startRead } from '@/lib/start-read'
import { loadFeedFloor } from './row-origins'

/**
 * Comm Cal › Tally (2026-11-12): every bill of the sub-department's months
 * with the month each side pays it in — Houzs once its deposit is reached, by
 * its SO date; we in the month whose close released it — read under the
 * viewer's own session.
 *
 * A month's bills come from `revenue_tally_orders` (mig 20261112190000): what
 * earns on each, the day its payments reached the deposit, whether the ERP
 * names a fair, its fair day and the month a close paid it. Who is closed in
 * which month says which month will pay a bill no close has paid yet.
 */

/** The Tally shows a year of months; a bill is keyed at most a few weeks after its fair. */
const MONTHS_SHOWN = 12
/** Months read before the first one shown, for the bills Houzs pays in it late. */
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

interface OrderRow {
  order_id: string
  order_no: string
  period_month: string
  order_date: string
  staff_id: string | null
  salesperson: string | null
  customer_name: string | null
  brand_code: string | null
  ref_no: string | null
  goods: number | string
  cancelled: boolean
  excluded_reason: string | null
  deposit_met: boolean
  reached_on: string | null
  has_fair: boolean | null
  fair_date: string | null
  released_month: string | null
}

interface CloseRow {
  staff_id: string
  period_month: string
  total_commission: number | string
}

export interface TallyView {
  report: TallyReport
  commission: TallyCommission
}

const NOTHING: TallyView = { report: { from: null, months: [], apartBills: 0, noPctBills: 0 }, commission: {} }

interface TallyFacts {
  orders: TallyOrder[]
  brands: TallyBrand[]
  feedFloor: string | null
  /** The first month tallied; null = the first month a bill sits in. */
  from: string | null
  closes: TallyClose[]
  commission: TallyCommission
}

/** One month's bills as the Tally reads them. */
export async function loadTallyOrders(db: SupabaseClient, subDepartmentId: string, month: string): Promise<TallyOrder[]> {
  // One row per bill, and PostgREST caps a function's rows at 1000 like any
  // read: asked once while the month fits, a capped answer again in pages, in
  // the function's own order (SO date, number) with the bill's id last.
  const rows = await fetchAllRowsAsWritten<OrderRow>((page) => {
    const q = db.rpc('revenue_tally_orders', { p_sub_department_id: subDepartmentId, p_from: month, p_to: month })
    return page ? q.order('order_date').order('order_no').order('order_id').range(page.from, page.to) : q
  }, "Could not read the month's bills")
  return rows.map(r => ({
    orderId: r.order_id,
    orderNo: r.order_no,
    refNo: r.ref_no,
    periodMonth: r.period_month,
    orderDate: r.order_date,
    staffId: r.staff_id,
    salesperson: r.salesperson ?? '—',
    customer: r.customer_name,
    brandCode: r.brand_code,
    goods: Number(r.goods),
    cancelled: r.cancelled,
    excludedReason: r.excluded_reason,
    depositMet: r.deposit_met,
    reachedOn: r.reached_on,
    // False only when the ERP says the order has no fair.
    hasFair: r.has_fair !== false,
    fairDate: r.fair_date,
    releasedMonth: r.released_month,
  }))
}

/** Everything the Tally is worked out from; null when there is nothing to tally. */
async function readTally(
  db: SupabaseClient,
  sub: { id: string; schemeId: string | null },
  periods: readonly string[],
  firstPaidMonth: string | null,
): Promise<TallyFacts | null> {
  const sorted = [...new Set(periods.map(p => p.slice(0, 10)))].sort()
  if (sorted.length === 0 || !sub.schemeId) return null

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
  // Who is closed in which month, and what each close pays: a few dozen people
  // a month over the months read — paged all the same.
  const closesRead = startRead(
    fetchAllRows<CloseRow>((lo, hi) =>
      db
        .from('comm_salesperson_closes')
        .select('staff_id, period_month, total_commission')
        .eq('sub_department_id', sub.id)
        .gte('period_month', wanted[0] ?? start)
        .is('reopened_at', null)
        .order('id')
        .range(lo, hi), "Could not read the months' closes"),
  )

  const orders: TallyOrder[] = []
  for (let i = 0; i < wanted.length; i += AT_ONCE) {
    const months = await Promise.all(wanted.slice(i, i + AT_ONCE).map(period => loadTallyOrders(db, sub.id, period)))
    for (const rows of months) orders.push(...rows)
  }

  const [brandRows, feedFloor, closes] = await Promise.all([brandsRead, floorRead, closesRead])
  return {
    orders,
    brands: brandRows.map(b => ({
      code: b.code,
      name: b.name,
      refPrefixes: b.ref_prefixes ?? [],
      hcBillPct: b.hc_bill_pct === null ? null : Number(b.hc_bill_pct),
      ownScheme: b.own_scheme === true,
    })),
    feedFloor,
    from,
    closes: closes.map(c => ({ staffId: c.staff_id, month: c.period_month })),
    // The months shown: a close of a month before them pays nothing the Tally lists.
    commission: commissionByMonth(
      closes.filter(c => c.period_month.slice(0, 10) >= start).map(c => ({ month: c.period_month, total: Number(c.total_commission) })),
    ),
  }
}

const billsOf = (facts: TallyFacts) =>
  tallyBills(facts.orders, facts.brands, { feedFloor: facts.feedFloor, from: facts.from, closes: facts.closes })

/** The page's Tally: every month's row, and the bills the two sides pay apart. */
export async function loadTally(
  db: SupabaseClient,
  sub: { id: string; schemeId: string | null },
  /** The months with a committed batch, `YYYY-MM-01`. */
  periods: readonly string[],
  /** The first month the portal pays; null when it pays every month. */
  firstPaidMonth: string | null,
): Promise<TallyView> {
  const facts = await readTally(db, sub, periods, firstPaidMonth)
  if (!facts) return NOTHING
  return { report: tallyOf(billsOf(facts), facts.from), commission: facts.commission }
}

export interface TallyMonthView {
  month: TallyMonthExport
  commission: { total: number; closed: number } | null
}

/**
 * One month whole, for its export: every bill on each side. Null when the
 * month is not one the Tally lists.
 */
export async function loadTallyMonth(
  db: SupabaseClient,
  sub: { id: string; schemeId: string | null },
  periods: readonly string[],
  firstPaidMonth: string | null,
  /** `YYYY-MM-01`. */
  month: string,
): Promise<TallyMonthView | null> {
  const facts = await readTally(db, sub, periods, firstPaidMonth)
  if (!facts) return null
  const at = month.slice(0, 10)
  const whole = tallyMonthExport(billsOf(facts), facts.from, at)
  return whole ? { month: whole, commission: facts.commission[at] ?? null } : null
}
