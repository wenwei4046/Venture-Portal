/**
 * The portal's own prices, read the way the run reads them — the TypeScript
 * twins of `catalogue_grid_price` and `catalogue_unit_price` (migration
 * 20260924030000), `catalogue_line_charge` and the sofa's once-a-set charge
 * of `catalogue_apply_sofa_charges` (20261006050000); the twin of
 * `catalogue_line_cost` + `catalogue_apply_combos` built from them is the
 * member calculator's `costLines` (lib/member/calculator.ts). The Product List
 * shows what a SKU would cost with these, and the SQL costs a sales line with
 * its twins; tests pin each against the same examples so a quote and a
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

/**
 * Only well-formed cells, never a negative or non-finite price — and a price
 * written as text must be a plain decimal (`^\d+(\.\d+)?$`, the SQL's own
 * test): a blank is NO price, never RM 0 (a zero cost reads as a 100% margin).
 */
export function priceGridOf(raw: unknown): PriceCell[] {
  if (!Array.isArray(raw)) return []
  const out: PriceCell[] = []
  for (const cell of raw) {
    if (!cell || typeof cell !== 'object') continue
    const c = cell as Record<string, unknown>
    const height = typeof c.height === 'string' ? c.height.trim() : ''
    const tier = typeof c.tier === 'string' ? c.tier.trim() : ''
    const value =
      typeof c.price === 'number'
        ? c.price
        : typeof c.price === 'string' && /^\d+(\.\d+)?$/.test(c.price)
          ? Number(c.price)
          : NaN
    if (!height || !tier || !Number.isFinite(value) || value < 0) continue
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

/**
 * What a price keyed on the Maintenance tab MEANS (user 2026-10-04, every
 * priced pool since 2026-10-06: "我要那些价钱是不会算进 margin 的，加 100 就一定
 * default calculator 100"):
 *
 *   'charge' — what the CUSTOMER pays for that option, on top: out of the
 *              margin on both sides, in the commissionable sales, never KPI.
 *              A bed frame's divan, leg, gap, total height and specials, per
 *              frame (`lineCharge`); a sofa's leg height and specials, ONCE
 *              PER SOFA however many pieces (`sofaSetCharges`).
 *   null     — no price: a sofa's seat size, which is the grid's own axis.
 *
 * No option adds to a line's COST any more (catalogue_line_surcharge answers 0).
 */
export type PoolPrice = 'charge' | null

export const CHARGED_POOLS = [
  'bedframe_divan_heights',
  'bedframe_leg_heights',
  'bedframe_gaps',
  'bedframe_total_heights',
  'bedframe_specials',
  'sofa_leg_heights',
  'sofa_specials',
] as const
export type ChargedPool = (typeof CHARGED_POOLS)[number]

export function poolPriceOf(pool: string): PoolPrice {
  return (CHARGED_POOLS as readonly string[]).includes(pool) ? 'charge' : null
}

/** A pool whose options may carry a price. A sofa's seat sizes do not. */
export function isPricedPool(pool: string): boolean {
  return poolPriceOf(pool) !== null
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

export interface ChargePart {
  pool: ChargedPool
  value: string
  /** What the customer pays for it — always above zero. */
  price: number
}

/** The option values a line names, in the pools its category reads. */
type ChargeFacts = Pick<LineFacts, 'divan' | 'leg' | 'gap' | 'total' | 'specials'>

/**
 * What one line's options are CHARGED to the customer, per unit — the twin of
 * catalogue_line_charge (7 arguments, 20261006050000): a bed frame's divan,
 * leg, gap, total height and specials; a sofa's leg height and specials. Only
 * an option priced above zero is a charge; one nobody priced, or priced at 0,
 * is FOC. A special named twice counts once. Anything but a bed frame or a
 * sofa is never charged — and a sofa is charged once per SET, not per line
 * (`sofaSetCharges`).
 */
export function lineCharge(
  category: string | null,
  facts: ChargeFacts,
  prices: OptionPrices,
): { amount: number; parts: ChargePart[] } {
  const cat = (category ?? '').toUpperCase()
  let pairs: Array<[ChargedPool, string | null]>
  let specialsPool: ChargedPool
  if (cat === 'BEDFRAME') {
    pairs = [
      ['bedframe_divan_heights', facts.divan],
      ['bedframe_leg_heights', facts.leg],
      ['bedframe_gaps', facts.gap],
      ['bedframe_total_heights', facts.total],
    ]
    specialsPool = 'bedframe_specials'
  } else if (cat === 'SOFA') {
    pairs = [['sofa_leg_heights', facts.leg]]
    specialsPool = 'sofa_specials'
  } else {
    return { amount: 0, parts: [] }
  }
  const parts: ChargePart[] = []
  const add = (pool: ChargedPool, value: string | null) => {
    if (value === null || value.trim() === '') return
    const price = prices.get(pool, value)
    if (price === null || !(price > 0)) return
    parts.push({ pool, value, price })
  }
  for (const [pool, value] of pairs) add(pool, value)
  const seen = new Set<string>()
  for (const sp of facts.specials) {
    const k = valueKey(sp)
    if (k === null || seen.has(k)) continue
    seen.add(k)
    add(specialsPool, sp)
  }
  return { amount: parts.reduce((a, p) => a + p.price, 0), parts }
}

/** One sofa line as the set charge reads it: which sofa it belongs to, how many, what it names. */
export interface SofaSetLine {
  /** The sofa it is a piece of: its base model (one order's lines of one model are one sofa). */
  group: string
  qty: number
  leg: string | null
  specials: readonly string[]
}

export interface SofaSetCharge {
  group: string
  /** How many sofas: the smallest quantity among its pieces (×2 everywhere = two sofas). */
  sets: number
  /** What one sofa is charged: every distinct leg height and special any piece names. */
  unit: number
  /** unit × sets. */
  total: number
  parts: ChargePart[]
}

/**
 * A sofa's options, ONCE PER SOFA (user 2026-10-06: "整组 sofa 只加一次") —
 * the twin of catalogue_apply_sofa_charges' grouping: the lines of one base
 * model are one sofa; each distinct leg height and special any of them names
 * is charged once (priced above zero), times the sets — the smallest quantity
 * among the pieces. A group nothing is charged for is left out. (The SQL then
 * spreads each set's total over its lines by what they sell for; a quote needs
 * only the total.)
 */
export function sofaSetCharges(lines: readonly SofaSetLine[], prices: OptionPrices): SofaSetCharge[] {
  const groups = new Map<string, SofaSetLine[]>()
  for (const l of lines) {
    if (!(l.qty > 0)) continue
    groups.set(l.group, [...(groups.get(l.group) ?? []), l])
  }
  const out: SofaSetCharge[] = []
  for (const [group, members] of groups) {
    const parts: ChargePart[] = []
    const seen = new Set<string>()
    const add = (pool: ChargedPool, value: string | null) => {
      const k = valueKey(value)
      if (k === null || seen.has(`${pool}\u0000${k}`)) return
      seen.add(`${pool}\u0000${k}`)
      const price = prices.get(pool, value)
      if (price === null || !(price > 0)) return
      parts.push({ pool, value: value!.trim(), price })
    }
    for (const m of members) add('sofa_leg_heights', m.leg)
    for (const m of members) for (const sp of m.specials) add('sofa_specials', sp)
    const unit = parts.reduce((a, p) => a + p.price, 0)
    if (!(unit > 0)) continue
    const sets = Math.max(1, Math.floor(Math.min(...members.map(m => m.qty))))
    out.push({ group, sets, unit, total: roundCents(unit * sets), parts })
  }
  return out
}

/**
 * Money to the cent, the way the SQL's ROUND(…, 2) lands it: half away from
 * zero, on the DECIMAL the number prints as — 10.075 rounds to 10.08 though
 * its binary double is a hair below, and -1.005 to -1.01.
 */
export function roundCents(n: number): number {
  if (!Number.isFinite(n)) return n
  const sign = n < 0 ? -1 : 1
  const shifted = Number(`${Math.abs(n)}e2`)
  const cents = Math.round(Number.isFinite(shifted) ? shifted : Math.abs(n) * 100)
  return cents === 0 ? 0 : (sign * cents) / 100
}
