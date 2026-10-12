import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import type { CloseBills } from '@/lib/commission/row-origin'

/**
 * What a ledger row from another month needs beyond the engine's line
 * (2026-10-12, `lib/commission/row-origin.ts`): the bill an upsell or a drop
 * changed — so its row can say which month's bill it was and open it — and
 * the closes of the months a carried bill came from, which say whether it
 * waited on its deposit or came in after its month closed.
 */

/** An upsell or a drop on a ledger: what its `comm_upsales` row says, and the bill it is about. */
export interface UpsaleFact {
  kind: 'upsale' | 'drop'
  /** The paper number HR knows the bill by — HC13254. */
  originalRef: string
  /** The ERP document it was found on — HC-SO-013387; null for one typed by hand. */
  erpDocNo: string | null
  /** The month the bill was settled in. */
  originalPeriod: string | null
  /** The bill's own page — its id and the month it sits in; null when the portal holds no such bill. */
  bill: { orderId: string; periodMonth: string } | null
}

interface UpsaleRow {
  id: string
  kind: 'upsale' | 'drop' | null
  amount: number | string
  original_ref: string
  erp_doc_no: string | null
  original_period: string | null
}

interface BillRow {
  id: string
  order_no: string
  period_month: string
}

/** The facts of these upsales and drops (`comm_upsales.id`), keyed by id. */
export async function loadUpsaleFacts(
  db: SupabaseClient,
  subDepartmentId: string,
  upsaleIds: readonly string[],
): Promise<Record<string, UpsaleFact>> {
  const ids = [...new Set(upsaleIds)]
  if (ids.length === 0) return {}
  const rows = await fetchByKeys<UpsaleRow, string>(ids, keys =>
    db.from('comm_upsales')
      .select('id, kind, amount, original_ref, erp_doc_no, original_period')
      .in('id', keys), 'the month’s upsells and drops')
  // The bill each was found on, among this sub-department's months as they stand.
  const docNos = [...new Set(rows.flatMap(row => row.erp_doc_no ? [row.erp_doc_no] : []))]
  const bills = await fetchByKeys<BillRow, string>(docNos, keys =>
    db.from('sales_orders')
      .select('id, order_no, period_month, sales_import_batches!inner (status, sub_department_id)')
      .in('order_no', keys)
      .eq('sales_import_batches.status', 'committed')
      .eq('sales_import_batches.sub_department_id', subDepartmentId), 'the bills the upsells and drops changed')
  const billOf = new Map<string, BillRow>()
  for (const bill of bills) if (!billOf.has(bill.order_no)) billOf.set(bill.order_no, bill)
  return Object.fromEntries(rows.map(row => {
    const bill = row.erp_doc_no ? billOf.get(row.erp_doc_no) : undefined
    const fact: UpsaleFact = {
      kind: row.kind === 'drop' || (row.kind === null && Number(row.amount) < 0) ? 'drop' : 'upsale',
      originalRef: row.original_ref,
      erpDocNo: row.erp_doc_no,
      originalPeriod: row.original_period ?? bill?.period_month ?? null,
      bill: bill ? { orderId: bill.id, periodMonth: bill.period_month } : null,
    }
    return [row.id, fact]
  }))
}

interface CloseRow {
  staff_id: string
  period_month: string
  deferred_orders: unknown
  order_ids: string[] | null
}

/**
 * The standing closes of the months a ledger carries bills in from: what each
 * held for its deposit (`deferred_orders`) and every bill it closed with.
 */
export async function loadCarriedCloses(
  db: SupabaseClient,
  subDepartmentId: string,
  months: readonly string[],
): Promise<CloseBills[]> {
  if (months.length === 0) return []
  const { data, error } = await db
    .from('comm_salesperson_closes')
    .select('staff_id, period_month, deferred_orders, order_ids')
    .eq('sub_department_id', subDepartmentId)
    .in('period_month', [...new Set(months)])
    .is('reopened_at', null)
  if (error) throw new Error(`Could not read the closes of the months bills were carried from: ${error.message}`)
  return ((data ?? []) as CloseRow[]).map(row => ({
    staffId: row.staff_id,
    periodMonth: row.period_month,
    heldIds: Array.isArray(row.deferred_orders)
      ? row.deferred_orders.flatMap(held => {
        const id = held && typeof held === 'object' ? (held as { orderId?: unknown }).orderId : null
        return typeof id === 'string' ? [id] : []
      })
      : [],
    billIds: row.order_ids ?? [],
  }))
}
