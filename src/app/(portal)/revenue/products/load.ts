import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * What the Product List page reads.
 *
 * The page used to be a hand-keyed cost list. It is now the ERP's SKU master,
 * mirrored — `erp_products` — with `comm_products` demoted to the exceptions
 * beside it. Nothing here writes; the ERP owns the catalogue.
 *
 * EVERY QUERY THAT CAN EXCEED 1,000 ROWS PAGES EXPLICITLY. PostgREST caps a
 * response at 1,000 rows and says nothing, which is how the old page came to
 * print "1000 PRODUCTS" over a table of 1,553 — and how Open Bill came to pay
 * RM 0 on a 507-id `.in()`. A catalogue is 2,300 SKUs, so this is not a
 * theoretical limit here.
 */

const PAGE = 1000

/**
 * `erp_products`, `erp_sofa_combos` and `revenue_costing_gaps` postdate
 * `database.types.ts`. The untyped-client convention is the project's answer to
 * that, and it is applied ONCE here at the boundary so everything the page
 * touches stays typed — the same shape `_components/config/load.ts` uses.
 */
async function untyped(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export interface SkuRow {
  item_code: string
  description: string | null
  category: string | null
  size_display: string | null
  brand_code: string | null
  base_model: string | null
  module_code: string | null
  cost_price: number | null
  base_price: number | null
  price_1: number | null
  sell_price: number | null
  seat_height_costs: unknown
  active: boolean
  synced_at: string
}

export interface OverrideRow {
  id: string
  item_code: string
  erp_item_code: string | null
  product_name: string | null
  brand_code: string | null
  item_group: string | null
  unit_cost: number | null
  is_active: boolean
}

export interface CostingGap {
  item_code: string
  item_group: string | null
  product_name: string | null
  brand_code: string | null
  lines: number
  bills: number
  qty: number
  revenue: number
  in_sku_master: boolean
  in_product_list: boolean
}

export interface MirrorState {
  products: number
  costed: number
  combos: number
  comboModels: number
  lastSyncedAt: string | null
}

type Row = Record<string, unknown>

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Pull every row of a table, a page at a time, instead of the first 1,000. */
async function all<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as T[]
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

export async function loadSkuMaster(): Promise<SkuRow[]> {
  const supabase = await untyped()
  const rows = await all<Row>((from, to) =>
    supabase
      .from('erp_products')
      .select(
        'item_code, description, category, size_display, brand_code, base_model, module_code, ' +
          'cost_price, base_price, price_1, sell_price, seat_height_costs, active, synced_at',
      )
      .order('item_code')
      .range(from, to),
  )
  return rows.map(r => ({
    item_code: String(r.item_code),
    description: (r.description as string) ?? null,
    category: (r.category as string) ?? null,
    size_display: (r.size_display as string) ?? null,
    brand_code: (r.brand_code as string) ?? null,
    base_model: (r.base_model as string) ?? null,
    module_code: (r.module_code as string) ?? null,
    cost_price: num(r.cost_price),
    base_price: num(r.base_price),
    price_1: num(r.price_1),
    sell_price: num(r.sell_price),
    seat_height_costs: r.seat_height_costs ?? null,
    active: r.active !== false,
    synced_at: String(r.synced_at ?? ''),
  }))
}

export async function loadOverrides(): Promise<OverrideRow[]> {
  const supabase = await untyped()
  const rows = await all<Row>((from, to) =>
    supabase
      .from('comm_products')
      .select('id, item_code, erp_item_code, product_name, brand_code, item_group, unit_cost, is_active')
      .order('item_code')
      .range(from, to),
  )
  return rows.map(r => ({
    id: String(r.id),
    item_code: String(r.item_code),
    erp_item_code: (r.erp_item_code as string) ?? null,
    product_name: (r.product_name as string) ?? null,
    brand_code: (r.brand_code as string) ?? null,
    item_group: (r.item_group as string) ?? null,
    unit_cost: num(r.unit_cost),
    is_active: r.is_active !== false,
  }))
}

/**
 * The codes sold in the window that nothing could cost, worth-first.
 *
 * The window is the live feed's own: the portal keeps Fair from 2026-08-01, so
 * anything older is not a gap anybody can act on. Through an RPC because the
 * answer is a GROUP BY over every line of two months.
 */
export async function loadCostingGaps(from: string, to: string): Promise<CostingGap[]> {
  const supabase = await untyped()
  const { data, error } = await supabase.rpc('revenue_costing_gaps', { p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).map(r => ({
    item_code: String(r.item_code),
    item_group: (r.item_group as string) ?? null,
    product_name: (r.product_name as string) ?? null,
    brand_code: (r.brand_code as string) ?? null,
    lines: Number(r.lines ?? 0),
    bills: Number(r.bills ?? 0),
    qty: Number(r.qty ?? 0),
    revenue: Number(r.revenue ?? 0),
    in_sku_master: r.in_sku_master === true,
    in_product_list: r.in_product_list === true,
  }))
}

/** Headline numbers for the mirror: is it filled, when did it last move. */
export async function loadMirrorState(skus: SkuRow[]): Promise<MirrorState> {
  const supabase = await untyped()
  const { data } = await supabase
    .from('erp_sofa_combos')
    .select('base_model, synced_at')
    .is('deleted_at', null)
    .range(0, PAGE - 1)
  const combos = (data ?? []) as unknown as Row[]

  const stamps = [
    ...skus.map(s => s.synced_at),
    ...combos.map(c => String(c.synced_at ?? '')),
  ].filter(Boolean)

  return {
    products: skus.length,
    // "Costed" means one of the cost-shaped fields can answer, in the same
    // order erp_resolve_unit_cost asks them. sell_price is not one of them.
    costed: skus.filter(s =>
      (s.cost_price ?? 0) > 0 ||
      (s.base_price ?? 0) > 0 ||
      (s.price_1 ?? 0) > 0 ||
      (Array.isArray(s.seat_height_costs) && s.seat_height_costs.length > 0),
    ).length,
    combos: combos.length,
    comboModels: new Set(combos.map(c => String(c.base_model ?? ''))).size,
    lastSyncedAt: stamps.length > 0 ? stamps.reduce((a, b) => (a > b ? a : b)) : null,
  }
}
