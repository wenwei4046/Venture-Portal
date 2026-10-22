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
  /**
   * A sofa's name of the portal's own (2026-10-19). Sent only when it changed —
   * absent leaves the stored name as it is; blank or null clears it, and the
   * ERP's own name shows again.
   */
  modelName?: string | null
}

/** The longest model name `catalogue_models_model_name_valid` takes. */
export const MODEL_NAME_MAX = 80

/**
 * A typed model name as it is kept: in capitals, as the ERP writes every name
 * (NOVA, SOFFIO — the user 2026-10-19: "aaaa" reads "AAAA"), one space between
 * words, none around them.
 */
export function tidyModelName(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/** A model name as `catalogue_models.model_name` stores it: tidied, blank = none. */
export function parseModelName(raw: string | null | undefined): string | null {
  const name = tidyModelName(raw)
  if (name === '') return null
  if (name.length > MODEL_NAME_MAX) throw new EditError(`A model name is at most ${MODEL_NAME_MAX} characters`)
  return name
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPTION_KEYS = new Set([
  'sizes', 'leg_heights', 'specials', 'divan_heights', 'total_heights', 'gaps',
])
const CALC = new Set(['Mattress', 'Bed frame', 'Sofa', 'Pillow', 'Protector', 'Accessory', 'Other'])

export function validateModelEdit(e: ModelEdit): {
  model: {
    erp_model_id: string; offered: boolean; enabled: Record<string, string[]>; gift: boolean | null; calc_category: string | null; brand_code: string | null
    /** Only when the edit carries a name: an upsert leaves a column it does not name as it was. */
    model_name?: string | null
  }
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
  if (e.modelName !== undefined && e.modelName !== null && typeof e.modelName !== 'string') throw new EditError('A model name is text')
  return {
    model: {
      erp_model_id: e.erpModelId,
      offered: e.offered === true,
      enabled,
      gift: e.gift === null || e.gift === undefined ? null : e.gift === true,
      calc_category: calc,
      brand_code: brand,
      ...(e.modelName === undefined ? {} : { model_name: parseModelName(e.modelName) }),
    },
    skus,
  }
}

export interface OptionPriceEdit {
  value: string
  price: string | null
}

/**
 * A price on Maintenance is what the CUSTOMER pays for the option (2026-10-05,
 * every priced pool since 2026-10-06), so it is never negative (CHECK
 * catalogue_option_prices_charge_not_negative). A sofa's seat size carries no
 * price at all (CHECK catalogue_option_prices_unpriced_pools).
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
    const price = parseMoney(e.price, value)
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

export interface NewComboEdit {
  baseModel: string
  /** One piece per slot, each the module it is or the modules it may be: [["1A"], ["2A-LHF", "2A-RHF"], ["CNR"]]. */
  modules: string[][]
  label: string
  /** Positive prices only: tier → seat height → RM. */
  prices: Record<string, Record<string, number | string>>
}

export interface NewComboPlan {
  base_model: string
  modules: string[][]
  label: string
  prices: Record<string, Record<string, number>>
  filled: number
}

/** A compartment code as the ERP writes one: 1A, 2A(LHF), Console — no quote or backslash, 80 characters at most. */
const MODULE_CODE = /^[^\s"\\][^"\\]{0,79}$/

/**
 * A sofa set made on the Product List (2026-10-08): the shape the database's
 * `catalogue_add_combo` is handed, checked before it is. The database checks
 * again what only it can — that the model and its modules exist, that the set
 * and its name are new to the model.
 */
export function validateNewCombo(edit: NewComboEdit): NewComboPlan {
  const baseModel = String(edit?.baseModel ?? '').trim().toUpperCase()
  if (!baseModel) throw new EditError('Pick a sofa model.')
  if (baseModel.length > 80) throw new EditError('That model code is too long.')
  const modules = Array.isArray(edit.modules) ? edit.modules : []
  if (modules.length < 2) throw new EditError('Add at least two compartments.')
  if (modules.length > 30) throw new EditError('A set holds at most 30 pieces.')
  // A piece is one module, or a few it may be instead — the left or the right
  // of a pair (2026-10-08), as the ERP's own combos write a slot.
  const slots = modules.map(slot => {
    if (!Array.isArray(slot) || slot.length === 0) throw new EditError('Each piece is one compartment.')
    if (slot.length > 4) throw new EditError('A compartment may be one of four modules at most.')
    const codes = slot.map(raw => {
      const code = String(raw ?? '').trim()
      if (!MODULE_CODE.test(code)) throw new EditError(`"${code}" is not a compartment code.`)
      return code
    })
    if (new Set(codes).size !== codes.length) throw new EditError('A compartment names the same module twice.')
    return codes
  })
  const label = String(edit.label ?? '').trim()
  if (!label) throw new EditError('Give the set a name.')
  if (label.length > 120) throw new EditError('The set name is too long (120 characters at most).')
  const prices: Record<string, Record<string, number>> = {}
  let filled = 0
  for (const [tier, byHeight] of Object.entries(edit.prices ?? {})) {
    if (!(TIERS as readonly string[]).includes(tier)) throw new EditError(`Unknown tier ${tier}`)
    const seen = new Set<string>()
    for (const [h, raw] of Object.entries(byHeight ?? {})) {
      const height = h.trim()
      if (!height || height.length > 20) throw new EditError(`"${h}" is not a seat height.`)
      const p = parseMoney(raw, `Fabric ${tier.replace('PRICE_', 'P')} at ${height}`)
      if (p === null || p <= 0) continue
      const k = heightKey(height)!
      if (seen.has(k)) throw new EditError(`Two prices for seat height ${height} in fabric ${tier.replace('PRICE_', 'P')}.`)
      seen.add(k)
      prices[tier] = { ...(prices[tier] ?? {}), [height]: p }
      filled++
    }
  }
  if (filled === 0) throw new EditError('Fill at least one price.')
  return { base_model: baseModel, modules: slots, label, prices, filled }
}

/** A set to take away (Combo Pricing › Edit prices › Remove): every fabric tier of it. */
export interface ComboSetRef {
  baseModel: string
  slotsKey: string
}

/** What `catalogue_remove_combos` takes: each set once, as the table keys it. */
export function validateComboRemovals(sets: readonly ComboSetRef[]): Array<{ base_model: string; slots_key: string }> {
  if (!Array.isArray(sets) || sets.length === 0) throw new EditError('Pick a combo to remove.')
  if (sets.length > 500) throw new EditError('Remove at most 500 combos at a time.')
  const out = new Map<string, { base_model: string; slots_key: string }>()
  for (const s of sets) {
    const baseModel = String(s?.baseModel ?? '').trim().toUpperCase()
    const slotsKey = String(s?.slotsKey ?? '').trim()
    if (!baseModel || baseModel.length > 80 || !slotsKey.startsWith('[') || slotsKey.length > 4000) {
      throw new EditError('A combo row is incomplete')
    }
    out.set(`${baseModel}|${slotsKey}`, { base_model: baseModel, slots_key: slotsKey })
  }
  return [...out.values()]
}
