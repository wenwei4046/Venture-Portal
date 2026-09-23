/**
 * The portal's own prices, read the way the run reads them — the TypeScript
 * twins of `catalogue_grid_price`, `catalogue_unit_price`,
 * `catalogue_line_surcharge` and `catalogue_line_cost` (migration
 * 20260924030000). The member calculator costs a quote with these, the Product
 * List shows what a SKU would cost with these, and the SQL costs a sales line
 * with its twins; a test pins each against the same examples so a quote and a
 * payslip cannot disagree about what a sofa cost.
 *
 * THE RULE (user 2026-09-24): every margin is measured against the price keyed
 * on the Product List — never the ERP's own costing.
 */

import { heightKey, valueKey } from './keys'
import type { LineFacts } from './facts'

export const TIERS = ['PRICE_1', 'PRICE_2', 'PRICE_3'] as const
export type Tier = (typeof TIERS)[number]

/** One cell of a sofa module's price grid: a price per (seat height, fabric tier). */
export interface PriceCell {
  height: string
  tier: string
  price: number
}

/** What the portal decided a SKU costs: one figure, and/or a sofa grid. */
export interface SkuPrice {
  price: number | null
  grid: PriceCell[] | null
}

/** Only well-formed cells, never a negative or non-finite price. */
export function priceGridOf(raw: unknown): PriceCell[] {
  if (!Array.isArray(raw)) return []
  const out: PriceCell[] = []
  for (const cell of raw) {
    if (!cell || typeof cell !== 'object') continue
    const c = cell as Record<string, unknown>
    const height = typeof c.height === 'string' ? c.height.trim() : ''
    const tier = typeof c.tier === 'string' ? c.tier.trim() : ''
    const value = typeof c.price === 'string' ? Number(c.price) : c.price
    if (!height || !tier || typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
    out.push({ height, tier, price: value })
  }
  return out
}

function tierRank(t: string): number {
  const i = (TIERS as readonly string[]).indexOf(t)
  return i === -1 ? 99 : i
}

/**
 * The cell for a build: exact (height, tier), else PRICE_2 at that height —
 * the ERP's legacy default tier — else the lowest tier at that height. Null
 * when the grid does not know the height: another height's price is never
 * borrowed.
 */
export function gridPrice(grid: readonly PriceCell[], height: string | null, tier: string | null): number | null {
  const want = heightKey(height)
  if (want === null) return null
  const atHeight = grid.filter(c => heightKey(c.height) === want)
  if (atHeight.length === 0) return null
  const wantTier = tier ?? 'PRICE_2'
  const ranked = [...atHeight].sort(
    (a, b) =>
      Number(b.tier === wantTier) - Number(a.tier === wantTier) ||
      Number(b.tier === 'PRICE_2') - Number(a.tier === 'PRICE_2') ||
      tierRank(a.tier) - tierRank(b.tier) ||
      a.tier.localeCompare(b.tier),
  )
  return ranked[0].price
}

export type PriceHow = 'grid' | 'price' | 'no_height' | 'unpriced'

/**
 * A SKU's unit price at a build. A grid of ONE seat height answers without a
 * height — there is only one cell it could be. Otherwise a grid needs the
 * height, and falls back to the one figure when it has none.
 */
export function unitPrice(
  sku: SkuPrice | null,
  height: string | null,
  tier: string | null,
): { price: number | null; how: PriceHow } {
  if (!sku) return { price: null, how: 'unpriced' }
  const grid = sku.grid ?? []
  if (grid.length > 0) {
    let h = height
    if (heightKey(h) === null) {
      const heights = new Set(grid.map(c => heightKey(c.height)))
      h = heights.size === 1 ? grid[0].height : null
    }
    const p = gridPrice(grid, h, tier)
    if (p !== null) return { price: p, how: 'grid' }
  }
  if (sku.price !== null && sku.price !== undefined) return { price: sku.price, how: 'price' }
  return { price: null, how: grid.length > 0 ? 'no_height' : 'unpriced' }
}

// ─── Maintenance options ─────────────────────────────────────────────────────

/** The portal's pools, named as `erp_maintenance_options.pool` names them. */
export const POOLS = [
  'bedframe_divan_heights',
  'bedframe_total_heights',
  'bedframe_gaps',
  'bedframe_leg_heights',
  'bedframe_specials',
  'sofa_sizes',
  'sofa_leg_heights',
  'sofa_specials',
] as const
export type Pool = (typeof POOLS)[number]

/** A pool whose options carry a surcharge. Gaps and seat sizes do not. */
export function isPricedPool(pool: string): boolean {
  return pool !== 'bedframe_gaps' && pool !== 'sofa_sizes'
}

/** An option price as keyed on the Maintenance tab. */
export interface OptionPrice {
  pool: string
  value: string
  price: number
}

/** `(pool, value)` → price, looked up by the value's folded spelling. */
export class OptionPrices {
  private readonly byKey = new Map<string, number>()

  constructor(prices: readonly OptionPrice[]) {
    for (const p of prices) {
      const k = valueKey(p.value)
      if (k !== null) this.byKey.set(`${p.pool}\u0000${k}`, p.price)
    }
  }

  /** A special printed with its choices (`Right Drawer (10")`) falls back to its bare code. */
  get(pool: string, value: string | null): number | null {
    const k = valueKey(value)
    if (k === null) return null
    const exact = this.byKey.get(`${pool}\u0000${k}`)
    if (exact !== undefined) return exact
    const bare = valueKey((value ?? '').replace(/\s*\(.*\)\s*$/, ''))
    if (bare === null || bare === k) return null
    return this.byKey.get(`${pool}\u0000${bare}`) ?? null
  }
}

export interface SurchargePart {
  pool: string
  value: string
  /** Null = the option has no price keyed on the Maintenance tab; it adds nothing. */
  price: number | null
}

/**
 * The surcharges a line's options add, per unit — the ERP's computeMfgLineCost
 * shape: a bed frame's divan, leg and total height and its specials; a sofa
 * module's leg height and specials. Gaps and seat sizes add nothing. An option
 * with no portal price adds nothing too, and is reported so the page can say so.
 */
export function lineSurcharge(
  category: string | null,
  facts: Pick<LineFacts, 'leg' | 'divan' | 'total' | 'specials'>,
  prices: OptionPrices,
): { amount: number; parts: SurchargePart[] } {
  const cat = (category ?? '').toUpperCase()
  const pairs: Array<[string, string | null]> =
    cat === 'BEDFRAME'
      ? [
          ['bedframe_divan_heights', facts.divan],
          ['bedframe_leg_heights', facts.leg],
          ['bedframe_total_heights', facts.total],
        ]
      : cat === 'SOFA'
        ? [['sofa_leg_heights', facts.leg]]
        : []
  if (pairs.length === 0) return { amount: 0, parts: [] }

  const parts: SurchargePart[] = []
  for (const [pool, value] of pairs) {
    if (value === null) continue
    parts.push({ pool, value, price: prices.get(pool, value) })
  }
  const specialsPool = cat === 'BEDFRAME' ? 'bedframe_specials' : 'sofa_specials'
  for (const sp of facts.specials) {
    parts.push({ pool: specialsPool, value: sp, price: prices.get(specialsPool, sp) })
  }
  const amount = parts.reduce((a, p) => a + (p.price ?? 0), 0)
  return { amount, parts }
}

/** Money to the cent, the way the SQL's ROUND(…, 2) lands it. */
export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
