import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRowsParallel } from '@/lib/paginate'
import { isFabricSeriesPool, type FabricSeriesRow } from '@/lib/commission/kpi'
import type { BrandRow, BrandSkuModelRow } from '@/lib/commission/run-payload'

const COLUMNS = 'erp_company_id, fabric_code, series, removed_at, active, synced_at'

/**
 * The ERP's fabric list as a fabric series KPI item reads it (2026-10-29):
 * every fabric of the ERP's first company that has a series — about 900 rows,
 * so paged. The SQL twin, `comm_kpi_hits`, reads the same rows; both look a
 * line's fabric code up here, so the run and Comm Cal's month find the same
 * series.
 *
 * And, a brand on its own scheme's (2026-11-14 — 2990s, company 2), its own
 * company's WHOLE list, a fabric with no series too: its bills' fabrics are read
 * there, one with no series in its code's family (`brandFabricSeriesOf`).
 */
export async function readFabricSeries(supabase: SupabaseClient, brandCompanies: readonly number[] = []): Promise<FabricSeriesRow[]> {
  const companies = [...new Set(brandCompanies.filter(company => company !== 1))]
  const [own, brands] = await Promise.all([
    fetchAllRowsParallel<FabricSeriesRow>((from, to, withCount) =>
      supabase.from('erp_fabrics')
        .select(COLUMNS, withCount ? { count: 'exact' } : undefined)
        .eq('erp_company_id', 1)
        .not('series', 'is', null)
        .order('erp_id')
        .range(from, to), 'Could not read the fabric list'),
    companies.length > 0
      ? fetchAllRowsParallel<FabricSeriesRow>((from, to, withCount) =>
        supabase.from('erp_fabrics')
          .select(COLUMNS, withCount ? { count: 'exact' } : undefined)
          .in('erp_company_id', companies)
          .order('erp_company_id')
          .order('erp_id')
          .range(from, to), "Could not read a brand's fabric list")
      : Promise.resolve([] as FabricSeriesRow[]),
  ])
  return [...own, ...brands]
}

/** Whether any KPI item is a fabric series — the fabric list is read only then. */
export function namesFabricSeries(items: readonly { option_pool?: string | null }[]): boolean {
  return items.some(item => isFabricSeriesPool(item.option_pool))
}

/**
 * The ERP companies of the brands on their own scheme that have KPI items of their own matching `which`
 * (2026-11-14): whose fabric list, or SKU master, a run reads beside the ERP's first.
 */
export function brandCompaniesWith(
  brands: readonly BrandRow[] | undefined,
  items: readonly { brand_id?: string | null; option_pool?: string | null }[],
  which: (pool: string | null | undefined) => boolean,
): number[] {
  const wanted = new Set(items.filter(item => item.brand_id && which(item.option_pool)).map(item => item.brand_id!.toLowerCase()))
  return [...new Set((brands ?? []).flatMap(brand => {
    if (!brand.own_scheme || brand.is_active === false || !wanted.has(brand.id.toLowerCase())) return []
    const company = Number(brand.erp_company_id)
    return [Number.isFinite(company) && company > 0 ? company : 1]
  }))]
}

/**
 * A brand's own SKU master's base models (2026-11-14, `erp_products`): read for the brands with a model item — 2990s'
 * is some 700 SKUs, so paged.
 */
export async function readBrandSkuModels(supabase: SupabaseClient, companies: readonly number[]): Promise<BrandSkuModelRow[]> {
  if (companies.length === 0) return []
  return fetchAllRowsParallel<BrandSkuModelRow>((from, to, withCount) =>
    supabase.from('erp_products')
      .select('erp_company_id, erp_id, item_code, base_model, removed_at', withCount ? { count: 'exact' } : undefined)
      .in('erp_company_id', [...new Set(companies)])
      .not('base_model', 'is', null)
      .order('erp_id')
      .range(from, to), "Could not read a brand's SKU master")
}
