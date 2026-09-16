import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'

/**
 * What one run paid in Open Bill, bill by bill.
 *
 * Read from the RUN's own lines (`comm_statement_lines`, component
 * `open_bill`), never recomputed: the uplift is a percentage of the bill's
 * commission at the rate the statement was cut on, and rebuilding it from
 * today's ladder would make an old month drift every time a rank is edited.
 *
 * Paged, because a run's lines are not bounded by the month: it also pays the
 * bills carried in from earlier months, and PostgREST hands back the first
 * thousand rows without saying so.
 */
export async function loadOpenBillPaid(
  supabase: SupabaseClient,
  runId: string,
): Promise<Map<string, number>> {
  const rows = await fetchAllRows<{ source_order_id: string | null; amount: number | string }>(
    (from, to) =>
      supabase
        .from('comm_statement_lines')
        .select('source_order_id, amount, comm_statements!inner (run_id)')
        .eq('component', 'open_bill')
        .eq('comm_statements.run_id', runId)
        .order('id')
        .range(from, to),
  )

  const paid = new Map<string, number>()
  for (const r of rows) {
    if (!r.source_order_id) continue
    const next = (paid.get(r.source_order_id) ?? 0) + Number(r.amount)
    paid.set(r.source_order_id, Math.round((next + Number.EPSILON) * 100) / 100)
  }
  return paid
}
