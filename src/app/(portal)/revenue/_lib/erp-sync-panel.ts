import type { SupabaseClient } from '@supabase/supabase-js'
import { suggestStaffByName } from '@/lib/erp-sync/suggest-staff'
import { fetchAllRows } from '@/lib/paginate'

/**
 * What the Comm Cal page shows about the ERP live feed. Read here, rendered
 * by _components/ErpSyncPanel.tsx. The existing Houzs ERP endpoint owns Fair;
 * another programme must never display or replay its deliveries.
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
  /** The one person on the list with this exact name, if there is exactly one. */
  suggestedStaffId: string | null
}

/** A name somebody has said will never be anybody, and what it costs the month. */
export interface IgnoredAgentView {
  agentKey: string
  agentName: string
  erpSalespersonId: string | null
  note: string | null
  orders: number
  total: number
}

export interface StaffOptionView {
  id: string
  name: string
  code: string | null
}

export interface ErpSyncPanelData {
  subDepartmentId: string
  lastEventAt: string | null
  events: SyncEventView[]
  held: HeldPeriodView[]
  unmatched: UnmatchedAgentView[]
  ignored: IgnoredAgentView[]
  staff: StaffOptionView[]
}

const RECENT = 15

export async function loadErpSyncPanelData(supabase: SupabaseClient, subDepartmentId: string): Promise<ErpSyncPanelData | null> {
  const { data: feedSub, error } = await supabase.rpc('erp_sync_sub_department')
  if (error) throw new Error(`Could not identify the ERP programme: ${error.message}`)
  if (feedSub !== subDepartmentId) return null
  const [
    { data: eventRows },
    { data: heldRows },
    { data: agentRows },
    { data: ignoredRows },
    { data: staffRows },
  ] = await Promise.all([
    supabase
      .from('erp_sync_events')
      .select('id, doc_no, status, message, warnings, received_at, period_month')
      .eq('sub_department_id', subDepartmentId)
      .order('received_at', { ascending: false })
      .limit(RECENT),
    // Every held delivery (2026-10-08): a month closed to the feed for good
    // keeps holding each re-save of its documents (329 already), and past
    // PostgREST's 1000-row cap the counts below would silently come up short.
    // Only counted by month, so the pages' order will do; a failed read
    // still counts none, as before.
    fetchAllRows((lo, hi) =>
      supabase
        .from('erp_sync_events')
        .select('period_month')
        .eq('sub_department_id', subDepartmentId)
        .eq('status', 'held')
        .is('replayed_at', null)
        .order('id')
        .range(lo, hi),
    ).then((data) => ({ data }), () => ({ data: null })),
    // Counted in SQL, deliberately (2026-09-16). Read as rows and grouped
    // here, this was capped at PostgREST's first 1,000 — so after the ERP
    // back-fill delivered 2,889 unplaced orders the panel showed a third of
    // them, under-counted every name and dropped some people entirely.
    supabase.rpc('erp_sync_unmatched_agents'),
    supabase.rpc('erp_sync_ignored_agents'),
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

  const staff = ((staffRows ?? []) as Array<{ id: string; employee_name: string; employee_code: string | null }>).map(
    s => ({ id: s.id, name: s.employee_name, code: s.employee_code }),
  )

  const unmatched = ((agentRows ?? []) as Array<{
    agent_key: string
    agent_name: string | null
    erp_salesperson_id: string | null
    orders: number | string
    total: number | string
  }>).map(a => {
    const agentName = a.agent_name ?? a.agent_key
    return {
      agentKey: a.agent_key,
      agentName,
      erpSalespersonId: a.erp_salesperson_id,
      orders: Number(a.orders),
      total: Number(a.total),
      suggestedStaffId: suggestStaffByName(agentName, staff),
    }
  })

  const ignored = ((ignoredRows ?? []) as Array<{
    agent_key: string
    agent_name: string | null
    erp_salesperson_id: string | null
    note: string | null
    orders: number | string
    total: number | string
  }>).map(a => ({
    agentKey: a.agent_key,
    agentName: a.agent_name ?? a.agent_key,
    erpSalespersonId: a.erp_salesperson_id,
    note: a.note,
    orders: Number(a.orders),
    total: Number(a.total),
  }))

  return {
    subDepartmentId,
    lastEventAt: events[0]?.receivedAt ?? null,
    events,
    held,
    unmatched,
    ignored,
    staff,
  }
}
