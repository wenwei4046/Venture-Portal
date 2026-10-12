import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import { loadCommissionInput } from './commission-input'
import { loadMonthOrders, type MonthOrder } from './month-orders'
import { saleMonthOf } from '@/lib/fair-calendar'
import type { CloseBills } from '@/lib/commission/row-origin'
import { loadFairCalendar } from './fair-calendar'
import { loadOrderFairs } from './order-fairs'
import { fairDays } from './upsales'
import { loadPayBoard } from './pay-preview'
import { loadBillMoves, loadCarriedCloses, loadUpsaleFacts, type UpsaleFact } from './row-origins'
import type { BillMoved } from '@/lib/commission/bill-move'

/** Read-only inputs: opening the workbench never creates a run or changes payroll. */
export async function loadCommissionWorkbench(
  db: SupabaseClient, subDepartmentId: string, period: string,
  monthOrders: MonthOrder[], runId?: string,
  /** The All bills page reads commission only; the salary preview is the month page's. */
  { pay: withPay = true }: { pay?: boolean } = {},
) {
  const [{ input, currentHierarchy, currentRules, unmatchedOrderNos }, calendar] = await Promise.all([
    // The month's bills ride along for the directors' incentive: the page
    // read them already, so the threshold is judged on the card's figure.
    loadCommissionInput(period, subDepartmentId, db, { replayRunId: runId, includeCurrentRules: true, monthOrders }),
    loadFairCalendar(db),
  ])
  const ids = [...new Set([...input.hierarchy.map(n => n.staffId), ...currentHierarchy.map(n => n.staffId), ...input.orders.map(o => o.staffId)])]
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
  const [people, pay, { allOrders, placed }, upsales, carriedCloses, moves] = await Promise.all([
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
      return { allOrders: everyOrder, placed: await loadOrderFairs(db, everyOrder.map(order => order.orderId)) }
    })(),
    loadUpsaleFacts(db, subDepartmentId, upsaleIds),
    loadCarriedCloses(db, subDepartmentId, earlierPeriods),
    // Bills somebody moved to another salesperson (2026-10-12): the month's
    // own and every one the ledgers carry — the bills All bills lists too.
    loadBillMoves(db, [...new Set([...monthOrders.map(o => o.orderId), ...input.orders.filter(o => !o.upsale).map(o => o.id)])]),
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
      organizer: fair?.organiserName ?? fair?.erpOrganiserText ?? o.organizer,
      eventName: fair?.startDate ? fairDays(fair.startDate, fair.endDate) : null,
      fair: fair ? { id: fair.fairId, venueKey: fair.venueKey, venueName: fair.displayName } : null,
      // The booth the salesperson picked in the ERP: what Sales exhibition
      // groups the bill under, whatever brand its goods are (2026-10-03).
      booth: placed.get(o.orderId)?.booth ?? null,
      // The month it was sold in by its fair: a bill keyed after its fair's
      // month is that month's late key-in, paid where it sits (2026-10-12).
      saleMonth: saleMonthOf(placed.get(o.orderId)?.fairDate, fair),
    }
  })
  return {
    input, currentHierarchy, currentRules, orders, unmatchedOrderNos,
    /** Each upsell and drop on the ledgers (`comm_upsales.id`): the bill it changed. */
    upsales: upsales as Record<string, UpsaleFact>,
    /** The closes of the months the ledgers carry bills in from. */
    carriedCloses: carriedCloses as CloseBills[],
    /** The bills moved to another salesperson, keyed by bill. */
    moves: moves as Record<string, BillMoved>,
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
export type CommissionWorkbenchData = Omit<Loaded, 'payLinesClosed' | 'upsales' | 'carriedCloses' | 'moves' | 'orders'>
  & {
    payLinesClosed?: string | null
    upsales?: Readonly<Record<string, UpsaleFact>>
    carriedCloses?: readonly CloseBills[]
    moves?: Readonly<Record<string, BillMoved>>
    orders: (Omit<Loaded['orders'][number], 'saleMonth'> & { saleMonth?: string | null })[]
  }
