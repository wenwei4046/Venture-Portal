import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import { loadCommissionInput } from './commission-input'
import { loadMonthOrders, type MonthOrder } from './month-orders'
import { loadFairCalendar } from './fair-calendar'
import { fairDays } from './upsales'
import { loadPayBoard } from './pay-preview'

/** Read-only inputs: opening the workbench never creates a run or changes payroll. */
export async function loadCommissionWorkbench(
  db: SupabaseClient, subDepartmentId: string, period: string,
  monthOrders: MonthOrder[], runId?: string,
  /** The All bills page reads commission only; the salary preview is the month page's. */
  { pay: withPay = true }: { pay?: boolean } = {},
) {
  const [{ input, currentHierarchy, currentRules, unmatchedOrderNos }, calendar] = await Promise.all([
    loadCommissionInput(period, subDepartmentId, db, { replayRunId: runId, includeCurrentRules: true }),
    loadFairCalendar(db),
  ])
  const ids = [...new Set([...input.hierarchy.map(n => n.staffId), ...currentHierarchy.map(n => n.staffId), ...input.orders.map(o => o.staffId)])]
  const [people, pay] = await Promise.all([
    fetchByKeys<{ id: string; employee_name: string; employee_code: string | null }, string>(ids, keys =>
      db.from('hr_staff_costs').select('id, employee_name, employee_code').in('id', keys)),
    withPay
      ? loadPayBoard(db, subDepartmentId, period, { allowWithoutRun: true, previewStaffIds: ids })
        .then(value => ({ ...value, unavailable: false }))
        .catch(() => ({ rows: [], unavailable: true }))
      : Promise.resolve({ rows: [], unavailable: true }),
  ])
  // Carry-forward bills need the same resolved venue/organiser as the source month's board.
  const earlierPeriods = [...new Set(input.orders.filter(o => !o.upsale && o.periodMonth !== period).map(o => o.periodMonth))]
  const earlier = await Promise.all(earlierPeriods.map(p => loadMonthOrders(db, subDepartmentId, p)))
  const allOrders = [...monthOrders, ...earlier.flat()]
  const assignments = await fetchByKeys<{ id: string; fair_event_id: string | null }, string>(
    [...new Set(allOrders.map(order => order.orderId))], ids =>
      db.from('sales_orders').select('id, fair_event_id').in('id', ids),
  )
  const fairByOrder = new Map(assignments.map(assignment => [assignment.id, assignment.fair_event_id]))
  const fairById = new Map(calendar.map(fair => [fair.fairId, fair]))
  const orders = allOrders.map(o => {
    // ERP document dates can be weeks after a fair. The persisted assignment
    // also includes manually confirmed claim forms; do not guess from dates.
    const fairId = fairByOrder.get(o.orderId)
    const fair = fairId ? fairById.get(fairId) : undefined
    return {
      orderId: o.orderId, venue: o.venueGroupName ?? o.venue, location: o.location,
      organizer: fair?.organiserName ?? fair?.erpOrganiserText ?? o.organizer,
      eventName: fair?.startDate ? fairDays(fair.startDate, fair.endDate) : null,
    }
  })
  return {
    input, currentHierarchy, currentRules, orders, unmatchedOrderNos,
    people: people.map(p => ({ staffId: p.id, name: p.employee_name, employeeCode: p.employee_code })),
    payRows: pay.rows, payUnavailable: pay.unavailable,
  }
}

export type CommissionWorkbenchData = Awaited<ReturnType<typeof loadCommissionWorkbench>>
