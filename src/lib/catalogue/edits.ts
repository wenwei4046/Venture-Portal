/**
 * Validating what the Principal types on the Product List, before it becomes
 * the price a margin is measured against. Pure, so the rules are tested here
 * rather than through the Server Actions that call them
 * (`app/(portal)/revenue/catalogue-actions.ts`).
 *
 * A PRICE IS EITHER A NUMBER OR NOTHING. Blank clears it — the SKU goes back to
 * "no price", its bills back to "no margin", which is honest. It is never read
 * as zero: a zero here would be a margin of 100%.
 */

import { heightKey, valueKey } from './keys'
import { poolPriceOf, TIERS, type PriceCell } from './pricing'

export class EditError extends Error {}

/** `1,234.50` → 1234.5; blank → null. Two decimals at most, never negative unless `allowNegative`. */
export function parseMoney(raw: string | number | null | undefined, what: string, allowNegative = false): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).replace(/,/g, '').trim()
  if (s === '') return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new EditError(`${what}: "${raw}" is not an amount (up to two decimals)`)
  const n = Number(s)
  if (!Number.isFinite(n) || Math.abs(n) > 99_999_999) throw new EditError(`${what}: "${raw}" is out of range`)
  if (n < 0 && !allowNegative) throw new EditError(`${what}: a price cannot be negative`)
  const rounded = Math.round(n * 100) / 100
  return rounded === 0 ? 0 : rounded
}

export interface SkuPriceEdit {
  erpId: string
  price: string | null
  /** The WHOLE grid after the edit, one cell per (height, tier) with a price. */
  grid?: Array<{ height: string; tier: string; price: string | null }> | null
}

export interface SkuPriceRow {
  erp_product_id: string
  price: number | null
  price_grid: PriceCell[] | null
}

const ERP_ID = /^[A-Za-z0-9_.:-]{1,80}$/

/** One row per SKU; a grid's blank cells are dropped; a repeated cell is refused. */
export function validateSkuPrices(edits: readonly SkuPriceEdit[]): SkuPriceRow[] {
  if (!Array.isArray(edits) || edits.length === 0) throw new EditError('Nothing to save')
  if (edits.length > 5000) throw new EditError('Save at most 5,000 SKUs at a time')
  const seen = new Set<string>()
  return edits.map(e => {
    if (!e || typeof e.erpId !== 'string' || !ERP_ID.test(e.erpId)) throw new EditError('A row names no SKU')
    if (seen.has(e.erpId)) throw new EditError(`SKU ${e.erpId} appears twice`)
    seen.add(e.erpId)
    const price = parseMoney(e.price, 'Price')
    let grid: PriceCell[] | null = null
    if (Array.isArray(e.grid)) {
      const cells: PriceCell[] = []
      const keys = new Set<string>()
      for (const c of e.grid) {
        const height = String(c?.height ?? '').trim()
        const tier = String(c?.tier ?? '').trim().toUpperCase()
        if (!height || height.length > 20) throw new EditError('A grid cell has no seat height')
        if (!(TIERS as readonly string[]).includes(tier)) throw new EditError(`Unknown fabric tier ${c?.tier}`)
        const p = parseMoney(c.price, `Price at ${height} · ${tier}`)
        if (p === null) continue
        const k = `${heightKey(height)}\u0000${tier}`
        if (keys.has(k)) throw new EditError(`Two prices for ${height} · ${tier}`)
        keys.add(k)
        cells.push({ height, tier, price: p })
      }
      grid = cells.length > 0 ? cells : null
    }
    return { erp_product_id: e.erpId, price, price_grid: grid }
  })
}

export interface ModelEdit {
  erpModelId: string
  offered: boolean
  /** Option pools ticked, keyed as the ERP's allowed_options keys them. */
  enabled: Record<string, string[]>
  gift: boolean | null
  calcCategory: string | null
  brandCode: string | null
  /** SKU ticks: erpId → offered. Only the SKUs listed are touched. */
  skuOffered: Record<string, boolean>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPTION_KEYS = new Set([
  'sizes', 'leg_heights', 'specials', 'divan_heights', 'total_heights', 'gaps',
])
const CALC = new Set(['Mattress', 'Bed frame', 'Sofa', 'Pillow', 'Protector', 'Accessory', 'Other'])

export function validateModelEdit(e: ModelEdit): {
  model: { erp_model_id: string; offered: boolean; enabled: Record<string, string[]>; gift: boolean | null; calc_category: string | null; brand_code: string | null }
  skus: Array<{ erp_product_id: string; offered: boolean }>
} {
  if (!e || typeof e.erpModelId !== 'string' || !UUID.test(e.erpModelId)) throw new EditError('No model named')
  const enabled: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(e.enabled ?? {})) {
    if (!OPTION_KEYS.has(key)) throw new EditError(`Unknown option list "${key}"`)
    if (!Array.isArray(values)) throw new EditError(`${key} must be a list`)
    const clean = [
      ...new Set(
        values
          .filter(v => v !== null && v !== undefined)
          .map(v => String(v).trim())
          .filter(v => v && v.length <= 80),
      ),
    ]
    enabled[key] = clean
  }
  const calc = e.calcCategory ? String(e.calcCategory) : null
  if (calc !== null && !CALC.has(calc)) throw new EditError(`Unknown calculator section "${calc}"`)
  const brand = e.brandCode ? String(e.brandCode).trim().toUpperCase() : null
  if (brand !== null && !/^[A-Z0-9_-]{1,30}$/.test(brand)) throw new EditError('Brand code is not valid')
  const skus = Object.entries(e.skuOffered ?? {}).map(([id, offered]) => {
    if (!ERP_ID.test(id)) throw new EditError('A SKU tick names no SKU')
    return { erp_product_id: id, offered: offered === true }
  })
  return {
    model: {
      erp_model_id: e.erpModelId,
      offered: e.offered === true,
      enabled,
      gift: e.gift === null || e.gift === undefined ? null : e.gift === true,
      calc_category: calc,
      brand_code: brand,
    },
    skus,
  }
}

export interface OptionPriceEdit {
  value: string
  price: string | null
}

/**
 * A cost surcharge may be negative — the ERP's own "No Side Panel" takes RM 40
 * off. A charge may not: it is what the customer pays for a bed frame's divan,
 * leg, gap or total height (2026-10-05). A sofa's seat size carries no price at
 * all (CHECK catalogue_option_prices_unpriced_pools).
 */
export function validateOptionPrices(pool: string, edits: readonly OptionPriceEdit[]): {
  upserts: Array<{ pool: string; value: string; price: number }>
  clears: string[]
} {
  if (!/^(bedframe|sofa)_[a-z_]+$/.test(pool)) throw new EditError('Unknown pool')
  const kind = poolPriceOf(pool)
  if (kind === null) throw new EditError('That list carries no price')
  const upserts: Array<{ pool: string; value: string; price: number }> = []
  const clears: string[] = []
  const seen = new Set<string>()
  for (const e of edits) {
    const value = String(e?.value ?? '').trim()
    if (!value) throw new EditError('An option names no value')
    const k = valueKey(value)!
    if (seen.has(k)) throw new EditError(`${value} appears twice`)
    seen.add(k)
    const price = parseMoney(e.price, value, kind === 'cost')
    if (price === null) clears.push(value)
    else upserts.push({ pool, value, price })
  }
  return { upserts, clears }
}

export interface ComboPriceEdit {
  baseModel: string
  slotsKey: string
  tier: string | null
  prices: Record<string, string | null>
}

export function validateComboPrices(edits: readonly ComboPriceEdit[]): Array<{
  base_model: string
  slots_key: string
  tier: string
  price_by_height: Record<string, number>
}> {
  if (!Array.isArray(edits) || edits.length === 0) throw new EditError('Nothing to save')
  return edits.map(e => {
    // The mirror stores a combo's base model upper-cased, and the price is
    // joined to it exactly.
    const baseModel = String(e?.baseModel ?? '').trim().toUpperCase()
    const slotsKey = String(e?.slotsKey ?? '').trim()
    if (!baseModel || !slotsKey.startsWith('[')) throw new EditError('A combo row is incomplete')
    const tier = e.tier ? String(e.tier).toUpperCase() : ''
    if (tier !== '' && !(TIERS as readonly string[]).includes(tier)) throw new EditError(`Unknown tier ${e.tier}`)
    const out: Record<string, number> = {}
    const heights = new Set<string>()
    const prices: Record<string, string | null> = e.prices ?? {}
    for (const [h, raw] of Object.entries(prices)) {
      const height = h.trim()
      if (!height || height.length > 20) continue
      const p = parseMoney(raw, `${baseModel} at ${height}`)
      if (p === null) continue
      // `30` and `30"` are one seat height; two prices for it would leave the
      // run to pick one.
      const k = heightKey(height)!
      if (heights.has(k)) throw new EditError(`${baseModel}: two prices for seat height ${height}`)
      heights.add(k)
      out[height] = p
    }
    return { base_model: baseModel, slots_key: slotsKey, tier, price_by_height: out }
  })
}
