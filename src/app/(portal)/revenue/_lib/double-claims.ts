import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { groupDoubleClaims, type DoubleClaimBill, type DoubleClaimGroup } from '@/lib/commission/double-claims'

/**
 * Every paper number on more than one bill a run could pay or already paid,
 * as `revenue_possible_double_claims` finds them. A read that fails leaves the
 * page standing and says so, rather than taking the month down with it.
 *
 * The RPC postdates database.types.ts — untyped-client convention.
 */

interface Row {
  bill_ref: string
  order_id: string
  order_no: string
  period_month: string
  order_date: string
  staff_id: string | null
  employee_name: string | null
  agent_name: string
  order_total: number | string
  source: string
  paid_by_run: boolean
  dismissed: boolean
}

export interface DoubleClaimsRead {
  groups: DoubleClaimGroup[]
  /** Set when the check could not run; the page says so instead of "none found". */
  unavailable: string | null
}

export async function loadDoubleClaims(supabase: SupabaseClient, subDepartmentId: string): Promise<DoubleClaimsRead> {
  const { data, error } = await supabase.rpc('revenue_possible_double_claims', { p_sub_department_id: subDepartmentId })
  if (error) return { groups: [], unavailable: error.message }
  const bills: DoubleClaimBill[] = ((data ?? []) as Row[]).map(r => ({
    billRef: r.bill_ref,
    orderId: r.order_id,
    orderNo: r.order_no,
    periodMonth: r.period_month,
    orderDate: r.order_date,
    staffId: r.staff_id,
    employeeName: r.employee_name,
    agentName: r.agent_name,
    orderTotal: Number(r.order_total),
    source: r.source,
    paidByRun: r.paid_by_run,
    dismissed: r.dismissed,
  }))
  return { groups: groupDoubleClaims(bills), unavailable: null }
}
