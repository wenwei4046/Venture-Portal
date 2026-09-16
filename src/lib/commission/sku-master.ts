/**
 * Reading the ERP SKU-master mirror on the Product List page.
 *
 * The page is a mirror, so it decides nothing — but it has to SHOW two things
 * the mirror does not store: which of a SKU's price-shaped fields would
 * actually be used as its cost, and how much of each category is costed at all.
 * Both are here rather than in the component so the answer the page prints is
 * the answer `erp_resolve_unit_cost()` gives, and a change to one is a failing
 * test on the other.
 */

export interface SeatHeightCost {
  height: string
  tier: string | null
  price: number
}

export interface SkuLike {
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
}

/** Which field answered, in the words the page prints. */
export type CostField = 'cost_price' | 'seat_height' | 'base_price' | 'price_1' | null

export interface ResolvedCost {
  /** The unit cost the portal would use, or null when nothing can cost it. */
  cost: number | null
  field: CostField
  /** How many seat-height entries the grid carries, for the sofa hint. */
  seatHeights: number
}

export function seatHeightCosts(v: unknown): SeatHeightCost[] {
  if (!Array.isArray(v)) return []
  const out: SeatHeightCost[] = []
  for (const e of v) {
    if (typeof e !== 'object' || e === null) continue
    const row = e as Record<string, unknown>
    const height = row.height === null || row.height === undefined ? null : String(row.height)
    const price = Number(row.price)
    if (height === null || !Number.isFinite(price) || price <= 0) continue
    out.push({ height, tier: row.tier === null || row.tier === undefined ? null : String(row.tier), price })
  }
  return out
}

/**
 * The same chain `erp_resolve_unit_cost()` walks, minus the exception table
 * (which is a different row and shown separately): cost_price → the sofa
 * seat-height grid → base_price → price_1.
 *
 * `sell_price` is NEVER consulted. Costing a line at its own selling price
 * would read as a 0% margin, which is a different wrong answer from the one
 * the mirror exists to remove, and a more convincing one.
 *
 * Zero is not a cost. A field set to 0 means the ERP has not priced it, and
 * treating that as "this is free" is the exact defect the mirror replaces.
 */
export function resolveCost(sku: SkuLike): ResolvedCost {
  const grid = seatHeightCosts(sku.seat_height_costs)

  if ((sku.cost_price ?? 0) > 0) {
    return { cost: sku.cost_price, field: 'cost_price', seatHeights: grid.length }
  }
  if (grid.length > 0) {
    // The page shows the cheapest priced height, which is the same entry the
    // SQL resolver falls back to when a build names no seat height.
    const cheapest = grid.reduce((a, b) => (b.price < a.price ? b : a))
    return { cost: cheapest.price, field: 'seat_height', seatHeights: grid.length }
  }
  if ((sku.base_price ?? 0) > 0) {
    return { cost: sku.base_price, field: 'base_price', seatHeights: 0 }
  }
  if ((sku.price_1 ?? 0) > 0) {
    return { cost: sku.price_1, field: 'price_1', seatHeights: 0 }
  }
  return { cost: null, field: null, seatHeights: 0 }
}

export interface CategoryCount {
  category: string
  total: number
  costed: number
}

/**
 * One row per category, biggest first, with how many of its SKUs the portal
 * could actually cost. A category at 0 costed is the interesting one — it is
 * where a whole product line's margin is unknowable — so the label carries the
 * pair rather than a percentage, which hides the size.
 */
export function categoryCounts(skus: readonly SkuLike[]): CategoryCount[] {
  const map = new Map<string, CategoryCount>()
  for (const sku of skus) {
    if (!sku.active) continue
    const category = sku.category ?? 'UNCATEGORISED'
    const row = map.get(category) ?? { category, total: 0, costed: 0 }
    row.total += 1
    if (resolveCost(sku).cost !== null) row.costed += 1
    map.set(category, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))
}

export interface SkuFilter {
  query: string
  category: string | null
  onlyUncosted: boolean
  includeInactive: boolean
}

/**
 * Search matches the code, the description, the brand and the base model.
 * The base model is in there deliberately: a salesperson looking for "8030"
 * wants every compartment of that sofa, and the code alone would only match if
 * they typed the module too.
 */
export function filterSkus(skus: readonly SkuLike[], f: SkuFilter): SkuLike[] {
  const q = f.query.trim().toLowerCase()
  return skus.filter(sku => {
    if (!f.includeInactive && !sku.active) return false
    if (f.category !== null && (sku.category ?? 'UNCATEGORISED') !== f.category) return false
    if (f.onlyUncosted && resolveCost(sku).cost !== null) return false
    if (q === '') return true
    return (
      sku.item_code.toLowerCase().includes(q) ||
      (sku.description ?? '').toLowerCase().includes(q) ||
      (sku.brand_code ?? '').toLowerCase().includes(q) ||
      (sku.base_model ?? '').toLowerCase().includes(q)
    )
  })
}
