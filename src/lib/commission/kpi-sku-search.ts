import type { SupabaseClient } from '@supabase/supabase-js'
import { kpiSkuSearchFilter, SKU_SEARCH_LIMIT } from './kpi-items-edit'

/** A SKU as Rules › KPI items' picker lists it — no price: Rules never shows what a product costs. */
export interface KpiSkuHit {
  erpId: string
  code: string
  description: string | null
  category: string | null
  /** False while the ERP has it switched off — still a SKU, still pickable. */
  active: boolean
}

export type SearchKpiSkusResult = { ok: true; hits: KpiSkuHit[]; total: number } | { ok: false; reason: string }

const FAILED = 'The SKU Master could not be searched just now. Try again.'

/**
 * SKUs of the SKU Master whose code or description contains the text, for the
 * picker — at most twenty, and how many matched in all. A SKU the ERP removed
 * is left out: no new bill can carry it.
 *
 * Read from the BROWSER, under the reader's own session (2026-10-11, the
 * user: "fix the kpi bug"). It was a Server Action, and a section picked while
 * it ran (`?tab=`, a pushState) made Next's action queue drop it and refresh
 * the route; a Back pressed during that refresh left the `[sub]` skeleton on
 * screen until a reload — on production five times out of five. A read in the
 * browser is not in that queue. RLS answers it exactly as it answered the
 * action (erp_products: Revenue, the Product List).
 */
export async function searchSkuMaster(sb: SupabaseClient, query: string): Promise<SearchKpiSkusResult> {
  const filter = kpiSkuSearchFilter(typeof query === 'string' ? query : '')
  if (!filter) return { ok: true, hits: [], total: 0 }
  try {
    const { data, error, count } = await sb
      .from('erp_products')
      .select('erp_id, item_code, description, category, active', { count: 'exact' })
      .is('removed_at', null)
      .or(filter)
      .order('item_code')
      .order('erp_id')
      .limit(SKU_SEARCH_LIMIT)
    if (error) return { ok: false, reason: FAILED }
    const rows = (data ?? []) as Array<{ erp_id: string; item_code: string; description: string | null; category: string | null; active: boolean | null }>
    return {
      ok: true,
      hits: rows.map(r => ({
        erpId: String(r.erp_id),
        code: String(r.item_code),
        description: r.description ?? null,
        category: r.category ?? null,
        active: r.active !== false,
      })),
      total: count ?? rows.length,
    }
  } catch {
    return { ok: false, reason: FAILED }
  }
}
