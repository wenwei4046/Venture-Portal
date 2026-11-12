import { brandOfRef, type BrandDef } from './brand-billing'
import { isOldBillDate } from './row-origin'

/**
 * THE TALLY (2026-11-12, the user: "我要在 HR 的 Commission Calculation 那边加多一个
 * tab，那个是 tally 的 … House entry 那边跟着 Sales Order creation date 去 payout；
 * 我 payout to Sales Person 是跟着 fair date 去 payout；然后我要对出中间的那个 gap").
 *
 * Two calendars count the same bill:
 *
 *   - Houzs pays Houzs Venture by the day the order was OPENED IN THE ERP — its
 *     SO date (the ERP's Event Commission, "by SO date");
 *   - Houzs Venture pays the salesperson by the day of the FAIR — the month the
 *     portal counts the bill in (`sales_orders.period_month`).
 *
 * A bill sold at a fair on 8 Nov and keyed on 1 Dec is November's to the
 * salesperson and December's to Houzs: Houzs Venture has paid out before it is
 * paid. Month by month this lists both sides, what parts them, and the bills
 * that do — so no bill paid to a salesperson is missed in what Houzs clears.
 *
 * One amount on both sides, so the gap is the calendar's alone: the bill's
 * sales (what the rate is paid on — `revenue_month_orders.commissionable`: its
 * commissionable lines, less its KPI items' amounts while KPI is on) and its
 * Bill to HC (sales × the brand's Bill to HC %, Rules › Brands & margin bands —
 * the brand read as the month's export reads it: the paper's Ref No. prefix,
 * else the bill's own).
 *
 * Pure: `revenue/_lib/tally.ts` reads, this decides.
 */

/** A bill as `revenue_month_orders` returns it, with the month it was asked for. */
export interface TallyOrder {
  orderId: string
  orderNo: string
  refNo: string | null
  /** The month the portal counts it in, `YYYY-MM-01`. */
  periodMonth: string
  /** The ERP's SO date, `YYYY-MM-DD`. */
  orderDate: string
  salesperson: string
  customer: string | null
  brandCode: string | null
  /** What the rate is paid on (`MonthOrder.commissionable`). */
  commissionable: number
  cancelled: boolean
  excludedReason: string | null
  depositMet: boolean
}

export interface TallyBrand extends BrandDef {
  /** A brand on its own scheme (2990s): a bill written under it is its brand's whatever its Ref No. says. */
  ownScheme: boolean
}

export interface TallyBill {
  orderId: string
  orderNo: string
  refNo: string | null
  salesperson: string
  customer: string | null
  /** The month we count it in — its fair day's month. */
  ourMonth: string
  /** The month Houzs pays it in — its SO date's month. */
  houzsMonth: string
  soDate: string
  /** The day of the fair the ERP says it was sold on; null when it named none. */
  fairDate: string | null
  /** A brand's code, or '' when nothing names one. */
  brandCode: string
  brandName: string
  sales: number
  /** The brand's Bill to HC %, 0–1; null when Rules sets none. */
  pct: number | null
  /** sales × pct; null when the % is not set. */
  bill: number | null
  /** An old bill topped up: both sides pay it in the month its top-up came in. */
  oldBill: boolean
  belowDeposit: boolean
}

export interface TallySide {
  bills: number
  sales: number
  bill: number
}

export interface TallyMonth {
  /** `YYYY-MM-01`. */
  month: string
  /** By SO date: what Houzs pays for this month. */
  so: TallySide
  /** By fair date: what we pay salespeople on this month. */
  fair: TallySide
  /** fair − so. */
  gap: TallySide
  /**
   * As at the month's end: the bills we have counted that Houzs has not yet
   * (plus), less the ones Houzs has counted and we have not yet (minus).
   */
  carried: TallySide
  /** Counted here by fair date, their SO date in another month. */
  ours: TallyBill[]
  /** SO date here, counted by fair date in another month. */
  theirs: TallyBill[]
}

export interface TallyReport {
  /** The first month tallied, `YYYY-MM-01`; null when there is nothing to tally. */
  from: string | null
  /** Newest first. */
  months: TallyMonth[]
  /** Bills whose two months differ. */
  twoMonthBills: number
  /** Counted bills whose brand has no Bill to HC % — their Bill to HC reads as nothing. */
  noPctBills: number
}

export interface TallyOptions {
  /** The feed window's floor (`erp_feed_settings.min_order_date`): tells an old bill topped up. */
  feedFloor: string | null
  /** The first month the portal pays (`comm_cutovers`); null = from the first month with data. */
  from: string | null
  /** Each bill's fair day (`raw.fair.fairDate`), where one was read. */
  fairDates?: ReadonlyMap<string, string | null>
}

const r2 = (n: number) => Math.round(n * 100) / 100
const norm = (s: string) => s.trim().toUpperCase()

/** `2026-11-08` → `2026-11-01`. */
export function monthOf(day: string): string {
  return `${day.slice(0, 7)}-01`
}

/** The month after (`n` = 1) or before (`n` = −1) a `YYYY-MM-01`. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  const at = y * 12 + (m - 1) + n
  return `${Math.floor(at / 12)}-${String((at % 12 + 12) % 12 + 1).padStart(2, '0')}-01`
}

/** Whether a bill counts on either side: the ERP's live order, ours to pay. */
export function countsInTally(order: Pick<TallyOrder, 'cancelled' | 'excludedReason'>): boolean {
  return !order.cancelled && !order.excludedReason
}

/**
 * The month Houzs pays a bill in: its SO date's month. An old bill topped up
 * (dated before the feed window, in a month from it on — `isOldBillDate`) is
 * paid on both sides when its top-up reaches the deposit, which is the month
 * the portal put it in.
 */
export function houzsMonthOf(order: Pick<TallyOrder, 'orderDate' | 'periodMonth'>, feedFloor: string | null): string {
  return isOldBillDate(order.orderDate, order.periodMonth, feedFloor) ? order.periodMonth.slice(0, 10) : monthOf(order.orderDate)
}

/** The counted bills whose two months differ — the ones whose fair day is worth reading. */
export function twoMonthOrderIds(orders: readonly TallyOrder[], feedFloor: string | null): string[] {
  return orders
    .filter(o => countsInTally(o) && houzsMonthOf(o, feedFloor) !== o.periodMonth.slice(0, 10))
    .map(o => o.orderId)
}

const emptySide = (): TallySide => ({ bills: 0, sales: 0, bill: 0 })
const roundSide = (s: TallySide): TallySide => ({ bills: s.bills, sales: r2(s.sales), bill: r2(s.bill) })

function add(side: TallySide, bill: TallyBill, sign = 1) {
  side.bills += 1
  side.sales += sign * bill.sales
  side.bill += sign * (bill.bill ?? 0)
}

const byDay = (a: TallyBill, b: TallyBill) =>
  a.soDate.localeCompare(b.soDate) || a.orderNo.localeCompare(b.orderNo) || a.orderId.localeCompare(b.orderId)

/**
 * Every counted bill in its two months, with its brand and its Bill to HC —
 * what `buildTally` sums, and what the month's export lists whole.
 */
export function tallyBills(
  orders: readonly TallyOrder[], brands: readonly TallyBrand[], options: Pick<TallyOptions, 'feedFloor' | 'fairDates'>,
): TallyBill[] {
  const brandByCode = new Map(brands.map(b => [norm(b.code), b]))
  const ownScheme = new Set(brands.filter(b => b.ownScheme).map(b => norm(b.code)))

  const bills: TallyBill[] = []
  for (const o of orders) {
    if (!countsInTally(o)) continue
    const own = o.brandCode && ownScheme.has(norm(o.brandCode)) ? brandByCode.get(norm(o.brandCode))!.code : null
    const code = own ?? brandOfRef(o.refNo, brands) ?? o.brandCode?.trim() ?? ''
    const brand = code ? brandByCode.get(norm(code)) : undefined
    const pct = brand?.hcBillPct ?? null
    const sales = r2(o.commissionable)
    const ourMonth = o.periodMonth.slice(0, 10)
    bills.push({
      orderId: o.orderId,
      orderNo: o.orderNo,
      refNo: o.refNo,
      salesperson: o.salesperson,
      customer: o.customer,
      ourMonth,
      houzsMonth: houzsMonthOf(o, options.feedFloor),
      soDate: o.orderDate.slice(0, 10),
      fairDate: options.fairDates?.get(o.orderId) ?? null,
      brandCode: brand?.code ?? code,
      brandName: brand?.name ?? (code || 'No brand'),
      sales,
      pct,
      bill: pct === null ? null : r2(sales * pct),
      oldBill: isOldBillDate(o.orderDate, o.periodMonth, options.feedFloor),
      belowDeposit: !o.depositMet,
    })
  }
  return bills
}

/** The first month tallied: the first the portal pays, else the first month any bill sits in. */
function firstTallyMonth(bills: readonly TallyBill[], from: string | null): string | null {
  if (from) return from.slice(0, 10)
  const seen = bills.flatMap(b => [b.ourMonth, b.houzsMonth])
  return seen.length > 0 ? seen.reduce((a, b) => (a < b ? a : b)) : null
}

export function buildTally(orders: readonly TallyOrder[], brands: readonly TallyBrand[], options: TallyOptions): TallyReport {
  return tallyOf(tallyBills(orders, brands, options), options.from)
}

/** The months of a set of bills, each in its two calendars. */
export function tallyOf(bills: readonly TallyBill[], firstMonth: string | null): TallyReport {
  let noPctBills = 0

  // The months tallied: from the first month the portal pays (else the first
  // month any bill sits in) to the last month a bill sits in on either side.
  const from = firstTallyMonth(bills, firstMonth)
  const inScope = from === null ? [] : bills.filter(b => b.ourMonth >= from || b.houzsMonth >= from)
  if (from === null || inScope.length === 0) return { from: null, months: [], twoMonthBills: 0, noPctBills: 0 }

  const last = inScope.flatMap(b => [b.ourMonth, b.houzsMonth]).reduce((a, b) => (a > b ? a : b))
  const rows = new Map<string, { so: TallySide; fair: TallySide; carried: TallySide; ours: TallyBill[]; theirs: TallyBill[] }>()
  for (let m = from; m <= last; m = addMonths(m, 1)) {
    rows.set(m, { so: emptySide(), fair: emptySide(), carried: emptySide(), ours: [], theirs: [] })
  }

  let twoMonthBills = 0
  for (const b of inScope) {
    if (b.pct === null) noPctBills += 1
    const mine = rows.get(b.ourMonth)
    const theirs = rows.get(b.houzsMonth)
    if (mine) add(mine.fair, b)
    if (theirs) add(theirs.so, b)
    if (b.ourMonth === b.houzsMonth) continue
    twoMonthBills += 1
    mine?.ours.push(b)
    theirs?.theirs.push(b)
    // Between its two months the bill is counted on one side only.
    const [start, end, sign] = b.ourMonth < b.houzsMonth ? [b.ourMonth, b.houzsMonth, 1] : [b.houzsMonth, b.ourMonth, -1]
    for (let m = start < from ? from : start; m < end; m = addMonths(m, 1)) {
      const row = rows.get(m)
      if (row) add(row.carried, b, sign)
    }
  }

  const months: TallyMonth[] = [...rows.entries()]
    .map(([month, r]) => ({
      month,
      so: roundSide(r.so),
      fair: roundSide(r.fair),
      gap: roundSide({ bills: r.fair.bills - r.so.bills, sales: r.fair.sales - r.so.sales, bill: r.fair.bill - r.so.bill }),
      carried: roundSide(r.carried),
      ours: r.ours.sort(byDay),
      theirs: r.theirs.sort(byDay),
    }))
    .sort((a, b) => b.month.localeCompare(a.month))

  return { from, months, twoMonthBills, noPctBills }
}

// ─── A month, whole — its export ─────────────────────────────────────────────

/** A brand on both sides of a month. */
export interface TallyBrandRow {
  /** '' = no brand. */
  code: string
  name: string
  pct: number | null
  so: TallySide
  fair: TallySide
}

/**
 * A month as its export lists it (2026-11-12): the month's row, EVERY bill on
 * each side — the page lists only the ones in two months — and each brand's
 * part of both.
 */
export interface TallyMonthExport {
  month: string
  from: string | null
  row: TallyMonth
  /** Every bill whose SO date is in the month: what Houzs pays for it. */
  so: TallyBill[]
  /** Every bill counted in the month by its fair date: what we pay salespeople on. */
  fair: TallyBill[]
  brands: TallyBrandRow[]
}

export function tallyMonthExport(bills: readonly TallyBill[], firstMonth: string | null, month: string): TallyMonthExport | null {
  const report = tallyOf(bills, firstMonth)
  const row = report.months.find(m => m.month === month.slice(0, 10))
  if (!row) return null
  const so = bills.filter(b => b.houzsMonth === row.month).sort(byDay)
  const fair = bills.filter(b => b.ourMonth === row.month).sort(byDay)

  const byBrand = new Map<string, TallyBrandRow>()
  const brandOf = (b: TallyBill) => {
    const at = byBrand.get(b.brandCode) ?? { code: b.brandCode, name: b.brandName, pct: b.pct, so: emptySide(), fair: emptySide() }
    byBrand.set(b.brandCode, at)
    return at
  }
  for (const b of so) add(brandOf(b).so, b)
  for (const b of fair) add(brandOf(b).fair, b)
  // Biggest first, as the month's Sales by Brand & Billing; "No brand" last.
  const brands = [...byBrand.values()]
    .map(b => ({ ...b, so: roundSide(b.so), fair: roundSide(b.fair) }))
    .sort((a, b) => (a.code === '' ? 1 : 0) - (b.code === '' ? 1 : 0) || b.fair.sales + b.so.sales - (a.fair.sales + a.so.sales) || a.name.localeCompare(b.name))

  return { month: row.month, from: report.from, row, so, fair, brands }
}

/**
 * What a month pays its salespeople, by month `YYYY-MM-01`: the standing
 * closes' commission (`comm_salesperson_closes` — a salesperson goes to payroll
 * when closed) and how many are closed. Not `comm_runs.total_commission`, which
 * nobody keeps in step once a month is closed person by person (October 2026:
 * a draft run at RM 0.00 beside thirteen closes).
 */
export type TallyCommission = Record<string, { total: number; closed: number }>

/** Each month's standing closes, summed to the sen. */
export function commissionByMonth(closes: ReadonlyArray<{ month: string; total: number }>): TallyCommission {
  const sums = new Map<string, { sen: number; closed: number }>()
  for (const close of closes) {
    const month = close.month.slice(0, 10)
    const at = sums.get(month) ?? { sen: 0, closed: 0 }
    at.sen += Math.round(close.total * 100)
    at.closed += 1
    sums.set(month, at)
  }
  return Object.fromEntries([...sums.entries()].map(([month, at]) => [month, { total: at.sen / 100, closed: at.closed }]))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG =['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `2026-11-01` → "Nov 2026" (DESIGN.md › Date format: a month is three letters). */
export function tallyMonthShort(month: string): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** `2026-11-01` → "November 2026" — a heading's month, as the months list writes it. */
export function tallyMonthLong(month: string): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** `2026-11-08` → "8 Nov 2026". */
export function tallyDay(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export type TallyChipTone = 'alert' | 'ledger' | 'info' | 'plain'

/**
 * What the other side does with a bill, read from the month `month` it is
 * listed under. `side` says which list: `ours` — we count it here, so the word
 * is about Houzs; `theirs` — Houzs pays it here, so the word is about us.
 */
export function tallyOtherSide(
  bill: TallyBill, side: 'ours' | 'theirs', from: string | null,
): { text: string; tone: TallyChipTone; title?: string } {
  if (side === 'ours') {
    return bill.houzsMonth > bill.ourMonth
      ? { text: `Houzs pays ${tallyMonthShort(bill.houzsMonth)}`, tone: 'alert' }
      : { text: `Houzs paid ${tallyMonthShort(bill.houzsMonth)}`, tone: 'info' }
  }
  // A month before the portal paid: settled by hand, on its claim form. Kept as short as the other words.
  if (from && bill.ourMonth < from) {
    return { text: `By hand · ${tallyMonthShort(bill.ourMonth)}`, tone: 'plain', title: `Settled by hand — ${tallyMonthLong(bill.ourMonth)} was paid before the portal paid` }
  }
  return bill.ourMonth < bill.houzsMonth
    ? { text: `We paid ${tallyMonthShort(bill.ourMonth)}`, tone: 'ledger' }
    : { text: `We pay ${tallyMonthShort(bill.ourMonth)}`, tone: 'info' }
}

/** The month the Tally opens on: the latest with a bill in two months, else the latest. */
export function defaultTallyMonth(report: TallyReport): string | null {
  const withGap = report.months.find(m => m.ours.length > 0 || m.theirs.length > 0)
  return (withGap ?? report.months[0])?.month ?? null
}
