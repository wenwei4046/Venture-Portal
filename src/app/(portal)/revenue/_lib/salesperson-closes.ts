import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCloseSummary, type SalespersonClose } from '@/lib/commission/closes'

/**
 * Salespeople whose month is closed on Comm Cal (2026-09-27,
 * `comm_salesperson_closes`): what the month page reads, and the check the
 * bill-editing actions make before they write.
 *
 * The table postdates database.types.ts — untyped-client convention.
 */

interface CloseRow {
  staff_id: string
  closed_at: string
  closed_by_name: string | null
  total_commission: number | string
  summary: unknown
  hr_staff_costs: { employee_name: string } | { employee_name: string }[] | null
}

const nameOf = (row: Pick<CloseRow, 'staff_id' | 'hr_staff_costs'>): string => {
  const staff = Array.isArray(row.hr_staff_costs) ? row.hr_staff_costs[0] : row.hr_staff_costs
  return staff?.employee_name ?? row.staff_id
}

/** The standing closes of one sub-department's month. */
export async function loadSalespersonCloses(
  db: SupabaseClient,
  subDepartmentId: string,
  period: string,
): Promise<SalespersonClose[]> {
  const { data, error } = await db
    .from('comm_salesperson_closes')
    .select('staff_id, closed_at, closed_by_name, total_commission, summary, hr_staff_costs (employee_name)')
    .eq('sub_department_id', subDepartmentId)
    .eq('period_month', period)
    .is('reopened_at', null)
  if (error) throw new Error(`Could not read who is closed this month: ${error.message}`)
  return ((data ?? []) as unknown as CloseRow[]).map(row => ({
    staffId: row.staff_id,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    total: Number(row.total_commission),
    summary: parseCloseSummary(row.summary, nameOf(row)),
  }))
}

function monthName(period: string): string {
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Refuses a change to any of these bills while somebody paid on them has
 * their month closed — an Open Bill pick, a share, taking a bill out or
 * counting it again, a keyed margin. Asked here rather than by trigger
 * because the ERP receiver writes the same tables and must never be refused;
 * the close itself cannot move either way.
 */
export async function assertBillsNotClosed(db: SupabaseClient, orderIds: readonly string[]): Promise<void> {
  const ids = [...new Set(orderIds.filter(id => typeof id === 'string' && id))]
  if (ids.length === 0) return
  const { data, error } = await db
    .from('comm_salesperson_closes')
    .select('staff_id, period_month, hr_staff_costs (employee_name)')
    .is('reopened_at', null)
    .overlaps('order_ids', ids)
  if (error) throw new Error(`Could not check who is closed: ${error.message}`)
  const rows = (data ?? []) as unknown as Array<Pick<CloseRow, 'staff_id' | 'hr_staff_costs'> & { period_month: string }>
  if (rows.length === 0) return
  const who = [...new Set(rows.map(row => `${nameOf(row)}’s ${monthName(row.period_month)}`))].sort()
  throw new Error(
    `${who.join(', ')} ${who.length === 1 ? 'is' : 'are'} closed. Reopen ${who.length === 1 ? 'it' : 'them'} on Comm Cal before changing ${ids.length === 1 ? 'this bill' : 'these bills'}.`,
  )
}
