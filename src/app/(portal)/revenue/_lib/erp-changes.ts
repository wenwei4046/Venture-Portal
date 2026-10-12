import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import {
  ERP_CHANGE_SELECT,
  toErpChange,
  type AdjustmentAnswer,
  type ErpChange,
  type ErpChangeRow,
} from '@/lib/commission/erp-changes'

/**
 * The ERP audit trail (`sales_order_erp_changes`, mig 20261013010000): every
 * save of a sales order the feed delivered that changed something, read under
 * the reader's own session. The rules are `lib/commission/erp-changes.ts`.
 *
 * The table postdates database.types.ts — untyped-client convention.
 */

/** The most rows a month's list holds: a month moves money on a few dozen bills, not hundreds. */
const MONTH_LIMIT = 500
/** The most saves one bill's page lists. */
const BILL_LIMIT = 200

/** Every recorded save of one document, newest first. */
export async function loadBillChanges(db: SupabaseClient, subDepartmentId: string, orderNo: string): Promise<ErpChange[]> {
  const { data, error } = await db
    .from('sales_order_erp_changes')
    .select(ERP_CHANGE_SELECT)
    .eq('sub_department_id', subDepartmentId)
    .eq('order_no', orderNo)
    .order('received_at', { ascending: false })
    .limit(BILL_LIMIT)
  if (error) throw new Error(`Could not read the ERP audit trail of ${orderNo}: ${error.message}`)
  return ((data ?? []) as unknown as ErpChangeRow[]).map(toErpChange)
}

/**
 * The saves that moved money on a month's bills — what earns, or the bill's
 * total — newest first. A status or a payment alone is on the bill's own page.
 */
export async function loadMonthChanges(db: SupabaseClient, subDepartmentId: string, period: string): Promise<{
  changes: ErpChange[]
  more: boolean
}> {
  const { data, error } = await db
    .from('sales_order_erp_changes')
    .select(ERP_CHANGE_SELECT)
    .eq('sub_department_id', subDepartmentId)
    .eq('period_month', period)
    .eq('money_moved', true)
    .order('received_at', { ascending: false })
    .range(0, MONTH_LIMIT)
  if (error) throw new Error(`Could not read the ERP audit trail of the month: ${error.message}`)
  const rows = ((data ?? []) as unknown as ErpChangeRow[]).map(toErpChange)
  return { changes: rows.slice(0, MONTH_LIMIT), more: rows.length > MONTH_LIMIT }
}

/** Every recorded save of these documents, newest first, by document. */
export async function loadDocChanges(db: SupabaseClient, subDepartmentId: string, docNos: readonly string[]): Promise<Map<string, ErpChange[]>> {
  const docs = [...new Set(docNos)]
  const rows = await fetchByKeys<ErpChangeRow, string>(docs, keys =>
    db.from('sales_order_erp_changes')
      .select(ERP_CHANGE_SELECT)
      .eq('sub_department_id', subDepartmentId)
      .in('order_no', keys)
      .order('received_at', { ascending: false }) as unknown as PromiseLike<{ data: ErpChangeRow[] | null; error: { message: string } | null }>,
  'the ERP audit trail')
  const byDoc = new Map<string, ErpChange[]>()
  for (const change of rows.map(toErpChange)) {
    byDoc.set(change.orderNo, [...(byDoc.get(change.orderNo) ?? []), change])
  }
  for (const list of byDoc.values()) list.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  return byDoc
}

/** Where each change's drop or upsell stands now (comm_upsales), by id. */
export async function loadAdjustmentAnswers(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, AdjustmentAnswer>> {
  const keys = [...new Set(ids)]
  const rows = await fetchByKeys<{ id: string; status: string; period_month: string; amount: number | string; answered_by_feed: boolean | null }, string>(keys, chunk =>
    db.from('comm_upsales').select('id, status, period_month, amount, answered_by_feed').in('id', chunk), 'the drops and upsells')
  return new Map(rows.map(r => [r.id, {
    id: r.id,
    status: r.status === 'confirmed' || r.status === 'dismissed' ? r.status : 'pending',
    periodMonth: r.period_month,
    amount: Number(r.amount),
    answeredByFeed: r.answered_by_feed === true,
  }]))
}
