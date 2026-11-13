import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import { loadCommissionInput } from './commission-input'
import { loadMonthOrders, type MonthOrder } from './month-orders'
import { saleMonthOf } from '@/lib/fair-calendar'
import { oldBillOf, type CloseBills, type OldBill } from '@/lib/commission/row-origin'
import { workbenchStaffIds } from '@/lib/commission/workbench'
import { loadFairCalendar } from './fair-calendar'
import { loadOrderFairs } from './order-fairs'
import { fairDays } from './upsales'
import { loadPayBoard } from './pay-preview'
import { loadBillMoves, loadCarriedCloses, loadFeedFloor, loadUpsaleFacts, type UpsaleFact } from './row-origins'
import type { BillMoved } from '@/lib/commission/bill-move'
import type { HalfCommMark } from '@/lib/commission/bill-half-comm'

/** Read-only inputs: opening the workbench never creates a run or changes payroll. */
export async function loadCommissionWorkbench(
  db: SupabaseClient, subDepartmentId: string, period: string,
  monthOrders: MonthOrder[], runId?: string,
  /** The All bills page reads commission only; the salary preview is the month page's. */
  { pay: withPay = true }: { pay?: boolean } = {},
) {
  const [{ input, currentHierarchy, currentRules, unmatchedOrderNos, halfComms }, calendar] = await Promise.all([
    // The month's bills ride along for the directors' incentive: the page
    // read them already, so the threshold is judged on the card's figure.
    loadCommissionInput(period, subDepartmentId, db, { replayRunId: runId, includeCurrentRules: true, monthOrders }),
    loadFairCalendar(db),
  ])
  // Everybody the board lists — a director paid in a month they sold nothing
  // too — named, and in the salary preview.
  const ids = [...new Set([...workbenchStaffIds(input), ...currentHierarchy.map(n => n.staffId)])]
  // Carry-forward bills need the same resolved venue/organiser as the source month's board.
  const earlierPeriods = [...new Set(input.orders.filter(o => !o.upsale && o.periodMonth !== period).map(o => o.periodMonth))]
  // Rows from another month (2026-10-12): the bill each upsell or drop
  // changed, and what the close of a carried bill's own month says of it.
  const upsaleIds = input.orders.filter(o => o.upsale).map(o => o.id)
  // Independent reads, side by side (2026-09-26): the names, the salary
  // preview (the slow one — a statutory lookup per wage band when no run
  // exists yet), the carried-forward bills with every bill's fair, and the
  // other-month rows' facts. One after another they were the whole of a
  // month's wait.
  const [people, pay, { allOrders, placed, periodOf }, upsales, carriedCloses, moves, feedFloor] = await Promise.all([
    fetchByKeys<{ id: string; employee_name: string; employee_code: string | null }, string>(ids, keys =>
      db.from('hr_staff_costs').select('id, employee_name, employee_code').in('id', keys)),
    withPay
      ? Promise.all([
        loadPayBoard(db, subDepartmentId, period, { allowWithoutRun: true, previewStaffIds: ids }),
        // Whether the month's pay lines can still change (2026-09-27): null, or
        // the sentence the save would be refused with — payroll submitted, a
        // voucher raised, the period locked.
        db.rpc('revenue_pay_lines_closed', { p_period: period }),
      ])
        .then(([value, closed]) => ({
          ...value,
          unavailable: false,
          linesClosed: closed.error ? 'Pay lines cannot be changed right now.' : (closed.data as string | null),
        }))
        .catch(() => ({ rows: [], unavailable: true, linesClosed: null }))
      : Promise.resolve({ rows: [], unavailable: true, linesClosed: null }),
    (async () => {
      const earlier = await Promise.all(earlierPeriods.map(p => loadMonthOrders(db, subDepartmentId, p)))
      const everyOrder = [...monthOrders, ...earlier.flat()]
      // The month each bill sits in — an old bill topped up is told by it (2026-11-07).
      const months = new Map<string, string>([
        ...monthOrders.map(o => [o.orderId, period] as const),
        ...earlier.flatMap((bills, i) => bills.map(o => [o.orderId, earlierPeriods[i]] as const)),
      ])
      return { allOrders: everyOrder, placed: await loadOrderFairs(db, everyOrder.map(order => order.orderId)), periodOf: months }
    })(),
    loadUpsaleFacts(db, subDepartmentId, upsaleIds),
    loadCarriedCloses(db, subDepartmentId, earlierPeriods),
    // Bills somebody moved to another salesperson (2026-10-12): the month's
    // own and every one the ledgers carry — the bills All bills lists too.
    loadBillMoves(db, [...new Set([...monthOrders.map(o => o.orderId), ...input.orders.filter(o => !o.upsale).map(o => o.id)])]),
    loadFeedFloor(db, subDepartmentId),
  ])
  const fairById = new Map(calendar.map(fair => [fair.fairId, fair]))
  const orders = allOrders.map(o => {
    // ERP document dates can be weeks after a fair. The persisted assignment
    // also includes manually confirmed claim forms; do not guess from dates.
    const fairId = placed.get(o.orderId)?.fairId
    const fair = fairId ? fairById.get(fairId) : undefined
    return {
      orderId: o.orderId, venue: o.venueGroupName ?? o.venue, location: o.location,
      refNo: o.refNo, paperNo: o.paperNo,
      // The Sales by Brand & Billing export's columns (2026-11-11).
      customer: o.customerName, brandCode: o.brandCode,
      organizer: fair?.organiserName ?? fair?.erpOrganiserText ?? o.organizer,
      eventName: fair?.startDate ? fairDays(fair.startDate, fair.endDate) : null,
      fair: fair ? { id: fair.fairId, venueKey: fair.venueKey, venueName: fair.displayName } : null,
      // The booth the salesperson picked in the ERP: what Sales exhibition
      // groups the bill under, whatever brand its goods are (2026-10-03).
      booth: placed.get(o.orderId)?.booth ?? null,
      // The month it was sold in by its fair: a bill keyed after its fair's
      // month is that month's late key-in, paid where it sits (2026-10-12).
      saleMonth: saleMonthOf(placed.get(o.orderId)?.fairDate, fair, o.orderDate),
      // A departed salesperson's bill from before the feed window, the
      // collector's on its top-up (2026-11-07): Top up deposit · Mar 2026 bill · Junie.
      oldBill: oldBillOf({ orderDate: o.orderDate, periodMonth: periodOf.get(o.orderId) ?? period, agentName: o.agentName }, feedFloor),
    }
  })
  // An old bill nobody the portal pays collected is nobody's until HR gives it
  // to whoever did (2026-11-07) — not an agent to match: said apart.
  const oldWithNobody = new Set(allOrders
    .filter(o => !o.staffId && !o.cancelled
      && oldBillOf({ orderDate: o.orderDate, periodMonth: periodOf.get(o.orderId) ?? period, agentName: o.agentName }, feedFloor))
    .map(o => o.orderNo))
  return {
    input, currentHierarchy, currentRules, orders,
    unmatchedOrderNos: unmatchedOrderNos.filter(orderNo => !oldWithNobody.has(orderNo)),
    /** Old bills topped up by nobody the portal pays (2026-11-07): HR moves each to whoever collected it. */
    unassignedOldBillNos: unmatchedOrderNos.filter(orderNo => oldWithNobody.has(orderNo)),
    /** Each upsell and drop on the ledgers (`comm_upsales.id`): the bill it changed. */
    upsales: upsales as Record<string, UpsaleFact>,
    /** The closes of the months the ledgers carry bills in from. */
    carriedCloses: carriedCloses as CloseBills[],
    /** The bills moved to another salesperson, keyed by bill. */
    moves: moves as Record<string, BillMoved>,
    /** Half comm (2026-11-10): who halved which bill, and why, keyed by bill. */
    halfComms: Object.fromEntries(halfComms ?? []) as Record<string, HalfCommMark>,
    people: people.map(p => ({ staffId: p.id, name: p.employee_name, employeeCode: p.employee_code })),
    payRows: pay.rows, payUnavailable: pay.unavailable,
    /** Why the month's pay lines cannot change, or null while they can. */
    payLinesClosed: pay.linesClosed,
  }
}

type Loaded = Awaited<ReturnType<typeof loadCommissionWorkbench>>

/**
 * `payLinesClosed` is optional to its readers (absent reads as "the month is
 * open"), so a hand-built fixture or an older caller stays valid. So are the
 * other-month rows' facts (2026-10-12): absent, a row says only what its own
 * fields can — an upsell is an upsell, a carried bill the month it came from.
 */
export type CommissionWorkbenchData = Omit<Loaded, 'payLinesClosed' | 'upsales' | 'carriedCloses' | 'moves' | 'halfComms' | 'orders' | 'unassignedOldBillNos'>
  & {
    payLinesClosed?: string | null
    unassignedOldBillNos?: readonly string[]
    upsales?: Readonly<Record<string, UpsaleFact>>
    carriedCloses?: readonly CloseBills[]
    moves?: Readonly<Record<string, BillMoved>>
    halfComms?: Readonly<Record<string, HalfCommMark>>
    orders: (Omit<Loaded['orders'][number], 'saleMonth' | 'oldBill' | 'customer' | 'brandCode'>
      & { saleMonth?: string | null; oldBill?: OldBill | null; customer?: string | null; brandCode?: string | null })[]
  }
