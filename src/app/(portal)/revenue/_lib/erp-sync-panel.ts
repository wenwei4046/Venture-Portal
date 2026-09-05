import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * What the Comm Cal page shows about the ERP live feed. Read here, rendered
 * by _components/ErpSyncPanel.tsx. Department-wide, like the batches: the feed
 * does not know about sub-departments.
 */

export interface SyncEventView {
  id: string
  docNo: string | null
  status: string
  message: string | null
  warnings: string[]
  receivedAt: string
  periodMonth: string | null
}

export interface HeldPeriodView {
  period: string
  count: number
}

export interface UnmatchedAgentView {
  agentKey: string
  agentName: string
  erpSalespersonId: string | null
  orders: number
  total: number
}

export interface StaffOptionView {
  id: string
  name: string
  code: string | null
}

export interface ErpSyncPanelData {
  lastEventAt: string | null
  events: SyncEventView[]
  held: HeldPeriodView[]
  unmatched: UnmatchedAgentView[]
  staff: StaffOptionView[]
}

const RECENT = 15

export async function loadErpSyncPanelData(supabase: SupabaseClient): Promise<ErpSyncPanelData> {
  const [{ data: eventRows }, { data: heldRows }, { data: orderRows }, { data: staffRows }] = await Promise.all([
    supabase
      .from('erp_sync_events')
      .select('id, doc_no, status, message, warnings, received_at, period_month')
      .order('received_at', { ascending: false })
      .limit(RECENT),
    supabase
      .from('erp_sync_events')
      .select('period_month')
      .eq('status', 'held')
      .is('replayed_at', null),
    supabase
      .from('sales_orders')
      .select('agent_key, agent_name, erp_salesperson_id, order_total')
      .eq('source', 'erp_sync')
      .eq('cancelled', false)
      .is('staff_id', null),
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, employee_code, departments!inner (payroll_source)')
      .eq('status', 'active')
      .eq('departments.payroll_source', 'commission')
      .order('employee_name'),
  ])

  const events = ((eventRows ?? []) as Array<{
    id: string
    doc_no: string | null
    status: string
    message: string | null
    warnings: string[] | null
    received_at: string
    period_month: string | null
  }>).map(e => ({
    id: e.id,
    docNo: e.doc_no,
    status: e.status,
    message: e.message,
    warnings: e.warnings ?? [],
    receivedAt: e.received_at,
    periodMonth: e.period_month,
  }))

  const heldCount = new Map<string, number>()
  for (const r of (heldRows ?? []) as Array<{ period_month: string | null }>) {
    const key = r.period_month ?? 'unknown'
    heldCount.set(key, (heldCount.get(key) ?? 0) + 1)
  }
  const held = [...heldCount.entries()]
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => b.period.localeCompare(a.period))

  const byAgent = new Map<string, UnmatchedAgentView>()
  for (const o of (orderRows ?? []) as Array<{
    agent_key: string
    agent_name: string
    erp_salesperson_id: string | null
    order_total: number | string
  }>) {
    const key = o.erp_salesperson_id ? `${o.agent_key}|${o.erp_salesperson_id}` : o.agent_key
    const e = byAgent.get(key) ?? {
      agentKey: o.agent_key,
      agentName: o.agent_name,
      erpSalespersonId: o.erp_salesperson_id,
      orders: 0,
      total: 0,
    }
    e.orders++
    e.total += Number(o.order_total)
    byAgent.set(key, e)
  }
  const unmatched = [...byAgent.values()].sort((a, b) => b.total - a.total)

  const staff = ((staffRows ?? []) as Array<{ id: string; employee_name: string; employee_code: string | null }>).map(
    s => ({ id: s.id, name: s.employee_name, code: s.employee_code }),
  )

  return {
    lastEventAt: events[0]?.receivedAt ?? null,
    events,
    held,
    unmatched,
    staff,
  }
}
