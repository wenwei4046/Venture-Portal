import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRowsParallel } from '@/lib/paginate'
import { isFabricSeriesPool, type FabricSeriesRow } from '@/lib/commission/kpi'

/**
 * The ERP's fabric list as a fabric series KPI item reads it (2026-10-29):
 * every fabric of the ERP's one company that has a series — about 900 rows,
 * so paged. The SQL twin, `comm_kpi_hits`, reads the same rows; both look a
 * line's fabric code up here, so the run and Comm Cal's month find the same
 * series.
 */
export async function readFabricSeries(supabase: SupabaseClient): Promise<FabricSeriesRow[]> {
  return fetchAllRowsParallel<FabricSeriesRow>((from, to, withCount) =>
    supabase.from('erp_fabrics')
      .select('fabric_code, series, removed_at, active, synced_at', withCount ? { count: 'exact' } : undefined)
      .eq('erp_company_id', 1)
      .not('series', 'is', null)
      .order('erp_id')
      .range(from, to), 'Could not read the fabric list')
}

/** Whether any KPI item is a fabric series — the fabric list is read only then. */
export function namesFabricSeries(items: readonly { option_pool?: string | null }[]): boolean {
  return items.some(item => isFabricSeriesPool(item.option_pool))
}
