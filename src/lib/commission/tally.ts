import { brandOfRef, type BrandDef } from './brand-billing'
import { isOldBillDate } from './row-origin'

/**
 * THE TALLY (2026-11-12, the user: "我要在 HR 的 Commission Calculation 那边加多一个
 * tab，那个是 tally 的 … House entry 那边跟着 Sales Order creation date 去 payout；
 * 我 payout to Sales Person 是跟着 fair date 去 payout；然后我要对出中间的那个 gap";
 * and, the same day, of the first version: "need with the real commission
 * payout, for those below depo, houzs will not pay to venture as well").
 *
 * The same bill is paid twice, by two rules:
 *
 *   - HOUZS pays Houzs Venture once the bill's payments reach its deposit — in
 *     the month of its SO date, or the month the deposit was reached when that
 *     is later (the ERP's Event Commission, "by SO date") — and only for an
 *     order with a fair. A bill still under its deposit is paid by nobody.
 *   - WE pay the salesperson in the month whose close released the bill
 *     (`comm_order_releases`): its own month, the month its deposit was topped
 *     up, or the next month still open when it came in after its salesperson's
 *     close. A bill not paid yet is counted in the month that will pay it — the
 *     first from its own in which its salesperson is not closed — and said so.
 *
 * A bill sold at a fair on 8 Nov and keyed on 1 Dec is November's to the
 * salesperson and December's to Houzs: Houzs Venture has paid out before it is
 * paid. Month by month this lists both sides, what parts them, and the bills
 * that do — so no bill paid to a salesperson is missed in what Houzs clears.
 *
 * One amount on both sides, so the gap is the calendar's alone: the bill's
 * sales (its lines in a commissionable group — the goods the ERP pays its rate
 * on) and its Bill to HC (sales × the brand's Bill to HC %, Rules › Brands &
 * margin bands — the brand read as the month's export reads it: the paper's
 * Ref No. prefix, else the bill's own).
 *
 * Pure: `revenue/_lib/tally.ts` reads, this decides.
 */

/** A bill as `revenue_tally_orders` returns it. */
export interface TallyOrder {
  orderId: string
  orderNo: string
  refNo: string | null
  /** The month the portal counts its sales in — its fair day's — `YYYY-MM-01`. */
  periodMonth: string
  /** The ERP's SO date, `YYYY-MM-DD`. */
  orderDate: string
  /** Whose bill it is; null while nobody is matched to it. */
  staffId: string | null
  salesperson: string
  customer: string | null
  brandCode: string | null
  /** What earns on it: its lines in a commissionable group. */
  goods: number
  cancelled: boolean
  excludedReason: string | null
  /** The portal's deposit gate, as Comm Cal reads it. */
  depositMet: boolean
  /** The day its payments reached the deposit (the ERP's rule); null while they have not. */
  reachedOn: string | null
  /** Whether the ERP names a fair on it — an order with none is in neither of the ERP's reports. */
  hasFair: boolean
  /** The day of the fair the ERP says it was sold on; null when it named none. */
  fairDate: string | null
  /** The month whose close released it — when its commission was really paid; null = not paid yet. */
  releasedMonth: string | null
}

/** A salesperson's standing close of a month. */
export interface TallyClose {
  staffId: string
  /** `YYYY-MM-01`. */
  month: string
}

export interface TallyBrand extends BrandDef {
  /** A brand on its own scheme (2990s): a bill written under it is its brand's whatever its Ref No. says. */
  ownScheme: boolean
}

/**
 * What Houzs does with a bill: `pays` it in `houzsMonth`; holds it while it is
 * `below_deposit`; counts it nowhere when the ERP names `no_fair` on it.
 */
export type HouzsState = 'pays' | 'below_deposit' | 'no_fair'

/**
 * What we do with a bill: `paid` by a close in `ourMonth`; `open` — not paid
 * yet, `ourMonth` will pay it; settled `by_hand` in a month before the portal
 * paid; held while it is `below_deposit`.
 */
export type OurState = 'paid' | 'open' | 'by_hand' | 'below_deposit'

export interface TallyBill {
  orderId: string
  orderNo: string
  refNo: string | null
  salesperson: string
  customer: string | null
  /** The month the portal counts its sales in — where its page is. */
  saleMonth: string
  /** The month we pay it in; null while we hold it. */
  ourMonth: string | null
  ours: OurState
  /** The month Houzs pays it in; null while Houzs does not. */
  houzsMonth: string | null
  houzs: HouzsState
  soDate: string
  fairDate: string | null
  /** The day its payments reached the deposit; null while they have not. */
  reachedOn: string | null
  /** A brand's code, or '' when nothing names one. */
  brandCode: string
  brandName: string
  sales: number
  /** The brand's Bill to HC %, 0–1; null when Rules sets none. */
  pct: number | null
  /** sales × pct; null when the % is not set. */
  bill: number | null
  /** An old bill topped up: dated before the feed window, paid when its top-up reached the deposit. */
  oldBill: boolean
}

export interface TallySide {
  bills: number
  sales: number
  bill: number
}

export interface TallyMonth {
  /** `YYYY-MM-01`. */
  month: string
  /** What Houzs pays for this month. */
  houzs: TallySide
  /** What we pay salespeople on this month — paid by its closes, or waiting for them. */
  we: TallySide
  /** The part of `we` not paid yet: its salespeople are not closed. */
  open: TallySide
  /** we − houzs. */
  gap: TallySide
  /**
   * As at the month's end: the bills we have paid that Houzs has not
   * (plus), less the ones Houzs has paid and we have not (minus).
   */
  carried: TallySide
  /** We pay them here; Houzs in another month, or not at all. */
  ours: TallyBill[]
  /** Houzs pays them here; we in another month, or not yet. */
  theirs: TallyBill[]
  /** Sold in this month and paid by neither side: under their deposit. */
  held: TallyBill[]
}

export interface TallyReport {
  /** The first month tallied, `YYYY-MM-01`; null when there is nothing to tally. */
  from: string | null
  /** Newest first. */
  months: TallyMonth[]
  /** Bills the two sides do not pay in the same month. */
  apartBills: number
  /** Counted bills whose brand has no Bill to HC % — their Bill to HC reads as nothing. */
  noPctBills: number
}

export interface TallyOptions {
  /** The feed window's floor (`erp_feed_settings.min_order_date`): tells an old bill topped up. */
  feedFloor: string | null
  /** The first month the portal pays (`comm_cutovers`); null = from the first month with data. */
  from: string | null
  /** Who is closed in which month — decides which month pays a bill no close has paid yet. */
  closes?: readonly TallyClose[]
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
 * What Houzs does with a bill. The ERP's Event Commission earns an order the
 * day its payments first reach the deposit, and reports it "by SO date": in
 * the month it was opened when it had reached the deposit by then, else in the
 * month it did. An order with no fair is in neither of its reports.
 */
export function houzsSide(order: Pick<TallyOrder, 'orderDate' | 'reachedOn' | 'hasFair'>): { month: string | null; state: HouzsState } {
  if (!order.hasFair) return { month: null, state: 'no_fair' }
  if (!order.reachedOn) return { month: null, state: 'below_deposit' }
  const opened = monthOf(order.orderDate)
  const reached = monthOf(order.reachedOn)
  return { month: reached > opened ? reached : opened, state: 'pays' }
}

const closeKey = (staffId: string, month: string) => `${staffId}|${month.slice(0, 10)}`

/**
 * What we do with a bill. A close that released it paid it, in that close's
 * month. A month before the portal paid was settled by hand, in itself. A bill
 * under its deposit is held. Anything else is waiting for its salesperson's
 * close: the first month from its own in which they are not closed pays it —
 * its own month, or, once that is closed without it (a late key-in, a deposit
 * topped up since), the next month still open.
 */
export function ourSide(
  order: Pick<TallyOrder, 'periodMonth' | 'staffId' | 'depositMet' | 'releasedMonth'>,
  from: string | null,
  closed: ReadonlySet<string>,
): { month: string | null; state: OurState } {
  const own = order.periodMonth.slice(0, 10)
  if (order.releasedMonth) return { month: order.releasedMonth.slice(0, 10), state: 'paid' }
  if (from && own < from.slice(0, 10)) return { month: own, state: 'by_hand' }
  if (!order.depositMet) return { month: null, state: 'below_deposit' }
  let month = own
  while (order.staffId && closed.has(closeKey(order.staffId, month))) month = addMonths(month, 1)
  return { month, state: 'open' }
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
 * Every counted bill with the month each side pays it in, its brand and its
 * Bill to HC — what `buildTally` sums, and what the month's export lists whole.
 */
export function tallyBills(orders: readonly TallyOrder[], brands: readonly TallyBrand[], options: TallyOptions): TallyBill[] {
  const brandByCode = new Map(brands.map(b => [norm(b.code), b]))
  const ownScheme = new Set(brands.filter(b => b.ownScheme).map(b => norm(b.code)))
  const closed = new Set((options.closes ?? []).map(c => closeKey(c.staffId, c.month)))

  const bills: TallyBill[] = []
  for (const o of orders) {
    if (!countsInTally(o)) continue
    const own = o.brandCode && ownScheme.has(norm(o.brandCode)) ? brandByCode.get(norm(o.brandCode))!.code : null
    const code = own ?? brandOfRef(o.refNo, brands) ?? o.brandCode?.trim() ?? ''
    const brand = code ? brandByCode.get(norm(code)) : undefined
    const pct = brand?.hcBillPct ?? null
    const sales = r2(o.goods)
    const houzs = houzsSide(o)
    const ours = ourSide(o, options.from, closed)
    bills.push({
      orderId: o.orderId,
      orderNo: o.orderNo,
      refNo: o.refNo,
      salesperson: o.salesperson,
      customer: o.customer,
      saleMonth: o.periodMonth.slice(0, 10),
      ourMonth: ours.month,
      ours: ours.state,
      houzsMonth: houzs.month,
      houzs: houzs.state,
      soDate: o.orderDate.slice(0, 10),
      fairDate: o.fairDate ? o.fairDate.slice(0, 10) : null,
      reachedOn: o.reachedOn ? o.reachedOn.slice(0, 10) : null,
      brandCode: brand?.code ?? code,
      brandName: brand?.name ?? (code || 'No brand'),
      sales,
      pct,
      bill: pct === null ? null : r2(sales * pct),
      oldBill: isOldBillDate(o.orderDate, o.periodMonth, options.feedFloor),
    })
  }
  return bills
}

/** The months a bill sits in: where each side pays it, or — paid by neither — where it was sold. */
function monthsOf(bill: TallyBill): string[] {
  const months = [bill.ourMonth, bill.houzsMonth].filter((m): m is string => m !== null)
  return months.length > 0 ? months : [bill.saleMonth]
}

/** The first month tallied: the first the portal pays, else the first month any bill sits in. */
function firstTallyMonth(bills: readonly TallyBill[], from: string | null): string | null {
  if (from) return from.slice(0, 10)
  const seen = bills.flatMap(monthsOf)
  return seen.length > 0 ? seen.reduce((a, b) => (a < b ? a : b)) : null
}

export function buildTally(orders: readonly TallyOrder[], brands: readonly TallyBrand[], options: TallyOptions): TallyReport {
  return tallyOf(tallyBills(orders, brands, options), options.from)
}

type MonthSums = Pick<TallyMonth, 'houzs' | 'we' | 'open' | 'carried' | 'ours' | 'theirs' | 'held'>

/** The months of a set of bills, each with what the two sides pay in it. */
export function tallyOf(bills: readonly TallyBill[], firstMonth: string | null): TallyReport {
  const nothing: TallyReport = { from: null, months: [], apartBills: 0, noPctBills: 0 }

  // The months tallied: from the first month the portal pays (else the first
  // month any bill sits in) to the last month a bill sits in on either side.
  const from = firstTallyMonth(bills, firstMonth)
  if (from === null) return nothing
  const inScope = bills.filter(b => monthsOf(b).some(m => m >= from))
  if (inScope.length === 0) return nothing

  const last = inScope.flatMap(monthsOf).reduce((a, b) => (a > b ? a : b))
  const rows = new Map<string, MonthSums>()
  for (let m = from; m <= last; m = addMonths(m, 1)) {
    rows.set(m, { houzs: emptySide(), we: emptySide(), open: emptySide(), carried: emptySide(), ours: [], theirs: [], held: [] })
  }

  let apartBills = 0
  let noPctBills = 0
  for (const b of inScope) {
    if (b.pct === null) noPctBills += 1
    const mine = b.ourMonth === null ? undefined : rows.get(b.ourMonth)
    const theirs = b.houzsMonth === null ? undefined : rows.get(b.houzsMonth)
    if (mine) {
      add(mine.we, b)
      if (b.ours === 'open') add(mine.open, b)
    }
    if (theirs) add(theirs.houzs, b)
    if (b.ourMonth === b.houzsMonth) {
      // Paid by neither: listed where it was sold.
      if (b.ourMonth === null) rows.get(b.saleMonth)?.held.push(b)
      continue
    }
    apartBills += 1
    mine?.ours.push(b)
    theirs?.theirs.push(b)
    // While one side has paid it and the other has not, the bill is carried —
    // to the month the other side pays it, or on, while it never does.
    for (const [month, row] of rows) {
      const we = b.ourMonth !== null && b.ourMonth <= month
      const they = b.houzsMonth !== null && b.houzsMonth <= month
      if (we !== they) add(row.carried, b, we ? 1 : -1)
    }
  }

  const months: TallyMonth[] = [...rows.entries()]
    .map(([month, r]) => ({
      month,
      houzs: roundSide(r.houzs),
      we: roundSide(r.we),
      open: roundSide(r.open),
      gap: roundSide({ bills: r.we.bills - r.houzs.bills, sales: r.we.sales - r.houzs.sales, bill: r.we.bill - r.houzs.bill }),
      carried: roundSide(r.carried),
      ours: r.ours.sort(byDay),
      theirs: r.theirs.sort(byDay),
      held: r.held.sort(byDay),
    }))
    .sort((a, b) => b.month.localeCompare(a.month))

  return { from, months, apartBills, noPctBills }
}

// ─── A month, whole — its export ─────────────────────────────────────────────

/** A brand on both sides of a month. */
export interface TallyBrandRow {
  /** '' = no brand. */
  code: string
  name: string
  pct: number | null
  houzs: TallySide
  we: TallySide
}

/**
 * A month as its export lists it (2026-11-12): the month's row, EVERY bill on
 * each side — the page lists only the ones the two sides pay apart — the bills
 * neither pays, and each brand's part of both sides.
 */
export interface TallyMonthExport {
  month: string
  from: string | null
  row: TallyMonth
  /** Every bill Houzs pays in the month. */
  houzs: TallyBill[]
  /** Every bill we pay in the month, or will once its salesperson is closed. */
  we: TallyBill[]
  brands: TallyBrandRow[]
}

export function tallyMonthExport(bills: readonly TallyBill[], firstMonth: string | null, month: string): TallyMonthExport | null {
  const report = tallyOf(bills, firstMonth)
  const row = report.months.find(m => m.month === month.slice(0, 10))
  if (!row) return null
  const houzs = bills.filter(b => b.houzsMonth === row.month).sort(byDay)
  const we = bills.filter(b => b.ourMonth === row.month).sort(byDay)

  const byBrand = new Map<string, TallyBrandRow>()
  const brandOf = (b: TallyBill) => {
    const at = byBrand.get(b.brandCode) ?? { code: b.brandCode, name: b.brandName, pct: b.pct, houzs: emptySide(), we: emptySide() }
    byBrand.set(b.brandCode, at)
    return at
  }
  for (const b of houzs) add(brandOf(b).houzs, b)
  for (const b of we) add(brandOf(b).we, b)
  // Biggest first, as the month's Sales by Brand & Billing; "No brand" last.
  const brands = [...byBrand.values()]
    .map(b => ({ ...b, houzs: roundSide(b.houzs), we: roundSide(b.we) }))
    .sort((a, b) => (a.code === '' ? 1 : 0) - (b.code === '' ? 1 : 0) || b.we.sales + b.houzs.sales - (a.we.sales + a.houzs.sales) || a.name.localeCompare(b.name))

  return { month: row.month, from: report.from, row, houzs, we, brands }
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

export interface TallyChip {
  text: string
  tone: TallyChipTone
  title?: string
}

/** What Houzs does with a bill, in a few words. */
export function houzsWord(bill: TallyBill): TallyChip {
  if (bill.houzs === 'no_fair') {
    return { text: 'No fair in ERP', tone: 'alert', title: 'The ERP names no fair on this order — its Event Commission counts it in neither report' }
  }
  if (bill.houzs === 'below_deposit' || bill.houzsMonth === null) {
    return { text: 'Houzs · below deposit', tone: 'alert', title: 'Its payments have not reached the deposit in the ERP — Houzs pays nothing on it yet' }
  }
  // Why that month: the deposit came after the SO date, or the SO date itself.
  const late = bill.reachedOn !== null && monthOf(bill.reachedOn) > monthOf(bill.soDate)
  const title = late ? `Deposit reached ${tallyDay(bill.reachedOn!)}` : `SO date ${tallyDay(bill.soDate)}`
  // Not paid by us yet, or paid before Houzs: Houzs is the one still to pay.
  return bill.ourMonth === null || bill.houzsMonth > bill.ourMonth
    ? { text: `Houzs pays ${tallyMonthShort(bill.houzsMonth)}`, tone: bill.ourMonth === null ? 'info' : 'alert', title }
    : { text: `Houzs paid ${tallyMonthShort(bill.houzsMonth)}`, tone: 'info', title }
}

/** What we do with a bill, in a few words. */
export function ourWord(bill: TallyBill): TallyChip {
  if (bill.ours === 'below_deposit' || bill.ourMonth === null) {
    return { text: 'We hold · below deposit', tone: 'alert', title: 'Under its deposit on Comm Cal — no close has paid it' }
  }
  // A month before the portal paid: settled by hand, on its claim form. Kept as short as the other words.
  if (bill.ours === 'by_hand') {
    return { text: `By hand · ${tallyMonthShort(bill.ourMonth)}`, tone: 'plain', title: `Settled by hand — ${tallyMonthLong(bill.ourMonth)} was paid before the portal paid` }
  }
  if (bill.ours === 'open') {
    return { text: `We pay ${tallyMonthShort(bill.ourMonth)}`, tone: 'info', title: `${bill.salesperson} is not closed for ${tallyMonthLong(bill.ourMonth)} yet` }
  }
  return { text: `We paid ${tallyMonthShort(bill.ourMonth)}`, tone: 'ledger', title: `Paid by ${bill.salesperson}'s close of ${tallyMonthLong(bill.ourMonth)}` }
}

/**
 * What a bill's row says in the list it is in. `ours` — we pay it in the month
 * shown, so the words are about Houzs (and that we have not paid it yet, when
 * its salesperson is not closed); `theirs` — Houzs pays it there, so the words
 * are about us; `held` — neither pays, and why.
 */
export function tallyChips(bill: TallyBill, list: 'ours' | 'theirs' | 'held'): TallyChip[] {
  if (list === 'ours') {
    const open: TallyChip[] = bill.ours === 'open' && bill.ourMonth !== null
      ? [{ text: 'Not closed yet', tone: 'plain', title: `${bill.salesperson} is not closed for ${tallyMonthLong(bill.ourMonth)} yet` }]
      : []
    return [houzsWord(bill), ...open]
  }
  if (list === 'theirs') return [ourWord(bill)]
  const noFair: TallyChip[] = bill.houzs === 'no_fair' ? [houzsWord(bill)] : []
  return [{ text: 'Below deposit', tone: 'plain', title: 'Its payments have not reached the deposit — neither side pays it yet' }, ...noFair]
}

/** The month the Tally opens on: the latest with a bill the two sides pay apart, else the latest. */
export function defaultTallyMonth(report: TallyReport): string | null {
  const withGap = report.months.find(m => m.ours.length > 0 || m.theirs.length > 0)
  return (withGap ?? report.months[0])?.month ?? null
}
