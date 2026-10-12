import type { CommissionOrderStatus } from './workbench'

/**
 * A LEDGER ROW FROM ANOTHER MONTH (2026-10-12).
 *
 * The user, on a salesperson's ledger: "if the commission is pay in current
 * month, but the bill is come from another month, i need the bar show
 * different colour … then add a column status (show the reason — top up
 * deposit, drop sales)". A month's ledger pays more than its own bills:
 *
 *   - a bill of an earlier month that was still under its deposit when that
 *     month closed for its salesperson, and has been topped up since
 *     (`carry.ts`) — **Top up deposit**;
 *   - a bill of an earlier month that came in after that month closed —
 *     **Late key-in**;
 *   - a bill sitting in this month that was sold at another month's fair,
 *     keyed after that month (the ERP puts a new document in the month it was
 *     keyed when it does not say which day of the fair it was sold) — **Late
 *     key-in** too, with the fair's month beside it. Nobody moves it any more:
 *     the month it sits in pays it (the user: *Bills of another month's fair*
 *     "no need anymore");
 *   - what the ERP added to or dropped from a settled bill (`comm_upsales`) —
 *     **Upsell** / **Drop sales**: an isolated line paid at the seller's rate
 *     and their upline's override, which moves neither the bill's own margin
 *     nor the month's (`engine.ts` keeps an upsale out of every margin).
 *
 * Every such row says where it came from in the ledger's Status column; the
 * ones whose commission THIS month pays are drawn in the other-month colour.
 * A carried bill still under its deposit is said but not coloured — nothing of
 * it is paid here yet.
 *
 * RECORDS FOLLOW THE SALE, COMMISSION THE MONTH STILL OPEN (the user, the same
 * day: a late key-in "will go in the table as well … this is use for calculate
 * sales for revenue view arena purpose. but commission, it will jump to the
 * same month, then show up with different colour. if hr know this order is non
 * calculation with comm, they will right click" — *Don't count this bill*). A
 * bill the ERP dates by its fair day sits in its sale month (that month's
 * sales, the Revenue app, the Arena); when its salesperson was already closed
 * for that month it is marked **After close** there, and the next month still
 * open for them pays it, coloured.
 */

export type RowOriginKind = 'upsell' | 'drop' | 'deposit' | 'late' | 'early' | 'held' | 'carried' | 'after_close'

export interface RowOrigin {
  kind: RowOriginKind
  /** The Status column's word: "Top up deposit", "Drop sales", … */
  label: string
  /** The month the sale belongs to, `YYYY-MM-01`; null when nobody recorded it (an upsale typed by hand). */
  fromMonth: string | null
  /** The line under the word: "Aug 2026 bill", "Sep 2026 fair". */
  detail: string
  /** This month pays its commission: the row is drawn in the other-month colour. */
  paysHere: boolean
}

/**
 * What the close of a carried bill's OWN month says about it: it was there
 * and the deposit gate held it (`held`), it was not there at all — it came in
 * after the close (`absent`) — or it was there and counted (`counted`).
 */
export type CloseVerdict = 'held' | 'absent' | 'counted'

export interface RowOriginFacts {
  /** An upsale or a drop: what the `comm_upsales` row says of itself. */
  upsale?: { kind: 'upsale' | 'drop'; originalPeriod: string | null } | null
  /** The month the bill was sold in by its fair (`saleMonthOf`); null when it has no fair. */
  saleMonth?: string | null
  /** A bill carried in from an earlier month: its own month's close (null when no close says). */
  closed?: CloseVerdict | null
  /**
   * The month's own bill came in after its salesperson was closed for the
   * month: the close did not pay it, so the next month still open for them
   * will (`carry.ts`) — said here so it is not missed (user 2026-10-12).
   */
  afterClose?: boolean
}

/** The row as `rowOrigin` reads it — a `CommissionOrderRow` will do. */
export interface OriginRow {
  upsale: boolean
  orderTotal: number
  /** The month the bill sits in, `YYYY-MM-01`. */
  periodMonth: string
  status: CommissionOrderStatus
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Aug 2026" from `2026-08-01` (DESIGN.md › Date format: a month is three letters). */
export function monthShort(month: string): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** Where a row of the ledger for `period` (`YYYY-MM-01`) came from — null for the month's own bill. */
export function rowOrigin(row: OriginRow, period: string, facts: RowOriginFacts = {}): RowOrigin | null {
  const month = period.slice(0, 10)
  const paysHere = row.status === 'eligible'
  if (row.upsale) {
    const drop = facts.upsale ? facts.upsale.kind === 'drop' : row.orderTotal < 0
    const from = facts.upsale?.originalPeriod?.slice(0, 10) ?? null
    return {
      kind: drop ? 'drop' : 'upsell',
      label: drop ? 'Drop sales' : 'Upsell',
      fromMonth: from,
      detail: from ? `${monthShort(from)} bill` : 'An earlier bill',
      paysHere,
    }
  }
  const own = row.periodMonth.slice(0, 10)
  if (own < month) {
    const detail = `${monthShort(own)} bill`
    if (row.status === 'deposit_pending') return { kind: 'held', label: 'Below deposit', fromMonth: own, detail, paysHere: false }
    if (facts.closed === 'held') return { kind: 'deposit', label: 'Top up deposit', fromMonth: own, detail, paysHere }
    if (facts.closed === 'absent') return { kind: 'late', label: 'Late key-in', fromMonth: own, detail, paysHere }
    return { kind: 'carried', label: `From ${monthShort(own)}`, fromMonth: own, detail, paysHere }
  }
  // Sold here, but the close already went: the next open month pays it.
  if (facts.afterClose) return { kind: 'after_close', label: 'After close', fromMonth: null, detail: 'Paid next month', paysHere: false }
  const sale = facts.saleMonth?.slice(0, 10) ?? null
  if (sale && sale !== month) {
    const detail = `${monthShort(sale)} fair`
    return sale < month
      ? { kind: 'late', label: 'Late key-in', fromMonth: sale, detail, paysHere }
      : { kind: 'early', label: 'Early key-in', fromMonth: sale, detail, paysHere }
  }
  return null
}

/** The chip a kind wears (`.chip <tone>`): green adds, red takes away, blue waited on a deposit, amber came late. */
export const ORIGIN_TONE: Record<RowOriginKind, 'ledger' | 'danger' | 'wait' | 'alert' | 'info'> = {
  upsell: 'ledger',
  drop: 'danger',
  deposit: 'wait',
  late: 'alert',
  early: 'alert',
  held: 'info',
  carried: 'info',
  after_close: 'info',
}

/** A standing close of one salesperson's month, as far as `closeVerdicts` needs it. */
export interface CloseBills {
  staffId: string
  /** `YYYY-MM-01`. */
  periodMonth: string
  /** Bills the deposit gate held when it closed (`deferred_orders`). */
  heldIds: readonly string[]
  /** Every bill of theirs it closed with (`order_ids`), held ones included. */
  billIds: readonly string[]
}

/**
 * Asks the closes what they say of one carried bill: `held` (it was there,
 * under its deposit), `absent` (it came in after), `counted`, or null when no
 * close of that salesperson's month exists — a month a whole run settled.
 */
export function closeVerdicts(closes: readonly CloseBills[]): (staffId: string, periodMonth: string, orderId: string) => CloseVerdict | null {
  const byPerson = new Map<string, { held: Set<string>; bills: Set<string> }>()
  for (const close of closes) {
    byPerson.set(`${close.staffId}|${close.periodMonth.slice(0, 10)}`, { held: new Set(close.heldIds), bills: new Set(close.billIds) })
  }
  return (staffId, periodMonth, orderId) => {
    const close = byPerson.get(`${staffId}|${periodMonth.slice(0, 10)}`)
    if (!close) return null
    if (close.held.has(orderId)) return 'held'
    return close.bills.has(orderId) ? 'counted' : 'absent'
  }
}
