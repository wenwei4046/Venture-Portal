import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, fetchByKeys } from '@/lib/paginate'
import type { BrandRow, KpiItemRow, SpecialMoneyRow } from '@/lib/commission/run-payload'
import { ownSchemeBrandsOf } from '@/lib/commission/run-payload'

/**
 * What the special orders of these bills charge for each special (2026-11-12):
 * `sales_order_special_money`, under the reader's own session — one row a line
 * and special, only those charged above nothing. A brand's own KPI item is
 * found where its bill charges for it and takes that off the bill's sales; the
 * SQL twin, `comm_kpi_hits`, reads the same rows, so the run and Comm Cal's
 * month find the same items. Asked in chunks of bills and paged: an rpc's rows
 * stop at 1,000 like any read.
 */
export async function readSpecialMoney(supabase: SupabaseClient, orderIds: readonly string[]): Promise<SpecialMoneyRow[]> {
  return fetchByKeys<SpecialMoneyRow, string>(orderIds, async chunk => ({
    data: await fetchAllRows<SpecialMoneyRow>((from, to) =>
      supabase.rpc('sales_order_special_money', { p_order_ids: chunk })
        .order('line_id').order('special_key').range(from, to), 'Could not read what the special orders charge'),
    error: null,
  }), 'Could not read what the special orders charge')
}

/**
 * The bills whose special orders are worth reading: those of a brand on its own
 * scheme that has KPI items of its own. None — the usual month of a
 * sub-department with no such brand — and nothing is asked.
 */
export function billsWithBrandKpi<T extends { id: string; brand_code?: string | null }>(
  orders: readonly T[],
  brands: readonly BrandRow[] | undefined,
  items: readonly KpiItemRow[],
): string[] {
  const own = ownSchemeBrandsOf(brands)
  const withItems = new Set(items.flatMap(item => {
    const code = item.brand_id ? own.get(item.brand_id) ?? own.get(item.brand_id.toLowerCase()) : undefined
    return code ? [code] : []
  }))
  if (withItems.size === 0) return []
  return orders.filter(order => withItems.has((order.brand_code ?? '').trim().toUpperCase())).map(order => order.id)
}
