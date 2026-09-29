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
  const reason = await billsClosedReason(db, orderIds)
  if (reason) throw new Error(reason)
}

/** `assertBillsNotClosed`'s refusal as words, or null — for an action that returns its refusals. */
export async function billsClosedReason(db: SupabaseClient, orderIds: readonly string[]): Promise<string | null> {
  const ids = [...new Set(orderIds.filter(id => typeof id === 'string' && id))]
  if (ids.length === 0) return null
  const { data, error } = await db
    .from('comm_salesperson_closes')
    .select('staff_id, period_month, hr_staff_costs (employee_name)')
    .is('reopened_at', null)
    .overlaps('order_ids', ids)
  if (error) throw new Error(`Could not check who is closed: ${error.message}`)
  const rows = (data ?? []) as unknown as Array<Pick<CloseRow, 'staff_id' | 'hr_staff_costs'> & { period_month: string }>
  if (rows.length === 0) return null
  const who = [...new Set(rows.map(row => `${nameOf(row)}’s ${monthName(row.period_month)}`))].sort()
  return `${who.join(', ')} ${who.length === 1 ? 'is' : 'are'} closed. Reopen ${who.length === 1 ? 'it' : 'them'} on Comm Cal before changing ${ids.length === 1 ? 'this bill' : 'these bills'}.`
}

/**
 * Why somebody cannot be given a part of a bill — their month is closed
 * (2026-09-30) — or null. `billsClosedReason` asks about the people ALREADY
 * paid on the bill; a new holder is not among them yet, and their locked
 * figure would silently stop matching their ledger. Any standing close of
 * theirs from the bill's own month on counts — a bill carried forward pays
 * in a later month.
 */
export async function staffClosedReason(
  db: SupabaseClient,
  staffId: string,
  subDepartmentId: string,
  fromPeriod: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('comm_salesperson_closes')
    .select('period_month, hr_staff_costs (employee_name)')
    .eq('staff_id', staffId)
    .eq('sub_department_id', subDepartmentId)
    .gte('period_month', fromPeriod)
    .is('reopened_at', null)
    .order('period_month')
  if (error) throw new Error(`Could not check who is closed: ${error.message}`)
  const rows = (data ?? []) as unknown as Array<Pick<CloseRow, 'hr_staff_costs'> & { period_month: string }>
  if (rows.length === 0) return null
  const name = nameOf({ staff_id: staffId, hr_staff_costs: rows[0].hr_staff_costs })
  return `${name}’s ${monthName(rows[0].period_month)} is closed. Reopen it on Comm Cal before giving ${name} a part of this bill.`
}
