/**
 * The Houzs ERP's SKU master and Combo Pricing, translated into the portal's
 * shape.
 *
 * WHY THE PORTAL WANTS THEM. Cost used to be typed into `comm_products` by
 * hand, and 599 of its rows had none. The ERP has carried a cost per SKU all
 * along (`scm.mfg_products.cost_price_sen`, plus a per-seat-height cost grid
 * for sofas) and carries the sofa COMBO's cost and selling grids on one row.
 * Mirroring both is what lets a bill's margin be resolved from the ERP's own
 * numbers instead of guessed.
 *
 * TWO THINGS ABOUT COMBOS, read out of the ERP's source rather than assumed,
 * because both decide how the portal may read a sofa:
 *
 *   1. **A matched combo always wins.** `sofa-build.ts` `groupPrice`: when a
 *      SUBSET of the build's cells covers a combo's slots and that seat height
 *      is priced above zero, the combo price REPLACES that subset's à-la-carte
 *      sum and overrides the bundle path; cells outside the subset stay at full
 *      price. The "only if it is cheaper" guard was REMOVED (Chairman
 *      2026-05-30), so a matched combo is the price even when it is dearer than
 *      adding the compartments up. There is no path where the sum of the
 *      compartments overrides the combo.
 *   2. **Every combo row carries both sides.** `prices_by_height` is the COST
 *      grid and `selling_prices_by_height` the SELLING grid;
 *      `comboChargedPrices(selling, cost)` lays selling over cost to get what
 *      is charged. The ERP's sofa SKU rows are largely unpriced — PRICE 1 and
 *      PRICE 2 both blank on the SKU Master screen — so for a sofa the combo
 *      table is the ONLY place the money lives.
 *
 * Money arrives in sen and leaves in ringgit, the same edge conversion
 * `toCanonicalLines` already does for a sales order.
 */

import { isRow, text, num, senToRinggit, isoDate, isoTimestamp, type Row } from './contract'

/** One delivery may not carry more than this. A full catalogue is ~2,300 SKUs
 *  and ~300 combos, so the ERP pages it; the cap keeps one bad batch from
 *  becoming one enormous transaction. */
export const ERP_PRODUCTS_MAX_ROWS = 2000

/** A seat-height COST entry from `mfg_products.seat_height_prices`. The ERP's
 *  own PATCH comment says `priceSen` here is the COST, not a selling price. */
export interface SeatHeightCost {
  height: string
  tier: string | null
  price: number
}

export interface CanonicalProduct {
  itemCode: string
  erpId: string | null
  description: string | null
  category: string | null
  size: string | null
  brand: string | null
  barcode: string | null
  uom: string | null
  unitM3: number | null
  active: boolean
  baseModel: string | null
  moduleCode: string | null
  /** `cost_price_sen` — the real, confidential cost. */
  costPrice: number | null
  /** `base_price_sen`, shown as "PRICE 2" on the ERP's SKU Master. */
  basePrice: number | null
  /** `price1_sen`, shown as "PRICE 1". */
  price1: number | null
  /** `sell_price_sen` — the selling reference. Never used as a cost. */
  sellPrice: number | null
  seatHeightCosts: SeatHeightCost[] | null
}

export interface CanonicalCombo {
  erpId: string
  baseModel: string
  /** Ordered slots, each an OR-set: `[["2A(LHF)","2A(RHF)"],["L(LHF)"]]`. */
  modules: string[][]
  slotsKey: string
  tier: string | null
  customerId: string | null
  /** null = the sales-side master row; a uuid = that supplier's cost. */
  supplierId: string | null
  /** `prices_by_height` — the COST grid, keyed by seat height. */
  costByHeight: Record<string, number | null>
  /** `selling_prices_by_height` — the SELLING grid. */
  sellingByHeight: Record<string, number | null>
  label: string | null
  effectiveFrom: string
  deletedAt: string | null
}

export interface CanonicalProductBatch {
  snapshotAt: string | null
  /** true = the whole catalogue. Anything absent is retired, not deleted. */
  full: boolean
  products: CanonicalProduct[]
  combos: CanonicalCombo[]
}

export type ProductParseResult =
  | { ok: true; batch: CanonicalProductBatch }
  | { ok: false; error: string }

/** `ACTIVE` / `active` / true → true. Only an explicit inactive marker turns a
 *  SKU off: a row whose status the ERP has not set is still sellable, and
 *  treating an unknown as retired would silently un-cost every line using it. */
function isActive(row: Row): boolean {
  const explicit = row.active
  if (typeof explicit === 'boolean') return explicit
  const status = text(row.status ?? row.pos_active)
  if (status === null) return true
  const s = status.toUpperCase()
  if (s === 'FALSE' || s === 'INACTIVE' || s === 'RETIRED' || s === 'DISABLED') return false
  return true
}

/**
 * `8030-1A(LHF)` → base `8030`, module `1A(LHF)`. Cuts at the FIRST dash only,
 * which is exactly `splitSofaCode` in the ERP's `scm/shared/sofa-combo-pricing.ts`
 * — and the parenthesised form IS the one vocabulary a combo's slots are stored
 * in. A code with no dash (`1068 STOOL`) is its own base and has no module, so
 * it can never match a combo slot, which is correct: it is not a sectional.
 *
 * Only used when the ERP does not send its own `base_model` / `size_code`; it
 * usually does, and those win.
 */
export function splitItemCode(code: string): { baseModel: string; moduleCode: string | null } {
  const i = code.indexOf('-')
  if (i < 1) return { baseModel: code, moduleCode: null }
  return { baseModel: code.slice(0, i), moduleCode: code.slice(i + 1) || null }
}

/** The ERP's seat-height cost grid, sen → ringgit. Entries with no usable price
 *  are dropped rather than carried as zero — a zero here would read as "this
 *  module is free", which is the exact lie the mirror exists to remove. */
export function toSeatHeightCosts(v: unknown): SeatHeightCost[] | null {
  if (!Array.isArray(v)) return null
  const out: SeatHeightCost[] = []
  for (const entry of v) {
    if (!isRow(entry)) continue
    const height = text(entry.height ?? entry.seatHeight)
    const price = senToRinggit(entry.priceSen ?? entry.price_sen ?? entry.price)
    if (height === null || price === null || price <= 0) continue
    out.push({ height, tier: text(entry.tier), price })
  }
  return out.length > 0 ? out : null
}

/**
 * Coerce a combo's `modules` into the slot shape, tolerating the ERP's LEGACY
 * flat form where each code was its own slot. Codes inside a slot are sorted,
 * empty slots dropped. Slot ORDER is left alone here — matching is
 * order-independent, and `comboSlotsKey` is what canonicalises for identity.
 *
 * Mirrors `normalizeComboModules` in the ERP's `sofa-combo-pricing.ts`.
 */
export function normaliseComboModules(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return []
  const out: string[][] = []
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      const slot = entry.map(c => text(c)).filter((c): c is string => c !== null).sort()
      if (slot.length > 0) out.push(slot)
    } else {
      const code = text(entry)
      if (code !== null) out.push([code])
    }
  }
  return out
}

/**
 * Order-independent canonical key for a slot-set: sort within each slot, sort
 * the slots, stringify. Two spellings of one combo produce one key, which is
 * how the mirror groups an append-only history into a single logical combo.
 * `comboSlotsKey` in the ERP, and `erp_combo_slots_key()` in SQL — the three
 * must agree or a delivery groups differently from a query.
 */
export function comboSlotsKey(raw: unknown): string {
  const slots = normaliseComboModules(raw)
    .map(slot => [...slot].sort())
    .sort((a, b) => (a.join('') < b.join('') ? -1 : a.join('') > b.join('') ? 1 : 0))
  return JSON.stringify(slots)
}

/** A `{ height: sen }` map → `{ height: ringgit }`. A null stays null: "this
 *  height is not priced" is different from "this height is free". */
export function toPriceGrid(v: unknown): Record<string, number | null> {
  if (!isRow(v)) return {}
  const out: Record<string, number | null> = {}
  for (const [height, sen] of Object.entries(v)) {
    const key = text(height)
    if (key === null) continue
    out[key] = senToRinggit(sen)
  }
  return out
}

function toCanonicalProduct(row: Row): CanonicalProduct | null {
  const itemCode = text(row.code ?? row.item_code ?? row.itemCode)
  if (itemCode === null) return null

  const fallback = splitItemCode(itemCode)
  return {
    itemCode,
    erpId: text(row.id ?? row.erpId),
    description: text(row.name ?? row.description),
    category: text(row.category)?.toUpperCase() ?? null,
    size: text(row.size_label ?? row.size_code ?? row.size),
    brand: text(row.branding ?? row.brand)?.toUpperCase() ?? null,
    barcode: text(row.barcode),
    uom: text(row.uom),
    // The ERP stores cubic metres × 1000 as an integer (`unit_m3_milli`).
    unitM3: num(row.unit_m3_milli) !== null ? num(row.unit_m3_milli)! / 1000 : num(row.unitM3),
    active: isActive(row),
    baseModel: text(row.base_model ?? row.baseModel) ?? fallback.baseModel,
    moduleCode: text(row.size_code ?? row.moduleCode) ?? fallback.moduleCode,
    costPrice: senToRinggit(row.cost_price_sen ?? row.costPriceSen),
    basePrice: senToRinggit(row.base_price_sen ?? row.basePriceSen),
    price1: senToRinggit(row.price1_sen ?? row.price1Sen),
    sellPrice: senToRinggit(row.sell_price_sen ?? row.sellPriceSen),
    seatHeightCosts: toSeatHeightCosts(row.seat_height_prices ?? row.seatHeightCosts),
  }
}

function toCanonicalCombo(row: Row): CanonicalCombo | null {
  const erpId = text(row.id ?? row.erpId)
  const baseModel = text(row.base_model ?? row.baseModel)
  if (erpId === null || baseModel === null) return null

  const rawModules = row.modules
  const tier = text(row.tier)
  return {
    erpId,
    baseModel: baseModel.toUpperCase(),
    modules: normaliseComboModules(rawModules),
    slotsKey: comboSlotsKey(rawModules),
    tier: tier !== null && ['PRICE_1', 'PRICE_2', 'PRICE_3'].includes(tier.toUpperCase())
      ? tier.toUpperCase()
      : null,
    customerId: text(row.customer_id ?? row.customerId),
    supplierId: text(row.supplier_id ?? row.supplierId),
    costByHeight: toPriceGrid(row.prices_by_height ?? row.costByHeight),
    sellingByHeight: toPriceGrid(row.selling_prices_by_height ?? row.sellingByHeight),
    label: text(row.label),
    effectiveFrom: isoDate(row.effective_from ?? row.effectiveFrom) ?? new Date().toISOString().slice(0, 10),
    deletedAt: isoTimestamp(row.deleted_at ?? row.deletedAt),
  }
}

/**
 * One delivery → one canonical batch, or the reason it cannot be one. A failure
 * here is a CONTRACT failure (the ERP sent something the portal cannot read),
 * answered with 422 so it shows in the ERP's outbox rather than vanishing.
 *
 * A row the portal cannot read is SKIPPED, not fatal: one nameless SKU in a
 * 2,000-row catalogue must not cost the other 1,999 their costs. The count of
 * what was skipped comes back so silence is never mistaken for success.
 */
export function parseErpProductBatch(body: unknown): ProductParseResult {
  if (!isRow(body)) return { ok: false, error: 'delivery must be an object' }

  const rawProducts = body.products
  const rawCombos = body.combos
  if (rawProducts !== undefined && !Array.isArray(rawProducts)) {
    return { ok: false, error: 'products must be an array' }
  }
  if (rawCombos !== undefined && !Array.isArray(rawCombos)) {
    return { ok: false, error: 'combos must be an array' }
  }

  const products = Array.isArray(rawProducts) ? rawProducts : []
  const combos = Array.isArray(rawCombos) ? rawCombos : []
  if (products.length === 0 && combos.length === 0) {
    return { ok: false, error: 'delivery carried neither products nor combos' }
  }
  if (products.length + combos.length > ERP_PRODUCTS_MAX_ROWS) {
    return {
      ok: false,
      error: `delivery carries ${products.length + combos.length} rows; the cap is ${ERP_PRODUCTS_MAX_ROWS}`,
    }
  }

  return {
    ok: true,
    batch: {
      snapshotAt: isoTimestamp(body.snapshotAt ?? body.snapshot_at),
      full: body.full === true,
      products: products.filter(isRow).map(toCanonicalProduct).filter((p): p is CanonicalProduct => p !== null),
      combos: combos.filter(isRow).map(toCanonicalCombo).filter((c): c is CanonicalCombo => c !== null),
    },
  }
}

/**
 * What a sofa build costs, from the combo table, when the modules themselves
 * are not costed — which on this catalogue is the usual case.
 *
 * Picks the combo row whose slots the built modules can cover, preferring the
 * sales-side master row (`supplierId === null`) and the latest `effectiveFrom`
 * on or before `asOf`. Returns the COST grid's entry for the build's seat
 * height. Null when nothing matches or that height is unpriced — never zero,
 * because "no combo covers this" and "this combo is free" are different answers
 * and only one of them may reach a margin.
 *
 * MATCHING IS SUBSET COVERAGE, not equality: every slot must be filled by a
 * DISTINCT built module whose code is in that slot's OR-set, and a build may
 * carry more modules than the combo has slots — the extras are simply not part
 * of the combo. Order is irrelevant on both sides. This mirrors
 * `matchComboSubset`; the ERP uses bipartite matching because overlapping
 * OR-sets defeat a naive greedy pass, and so does this.
 */
export function matchComboSlots(built: readonly string[], slots: readonly string[][]): number[] | null {
  const mods = built.map(m => m.trim()).filter(m => m !== '')
  if (slots.length === 0 || mods.length < slots.length) return null

  const slotSets = slots.map(s => new Set(s))
  const canTake = slots.map((_, j) => mods.map((_m, i) => i).filter(i => slotSets[j].has(mods[i])))
  if (canTake.some(opts => opts.length === 0)) return null

  // Kuhn's augmenting path: modToSlot[i] = the slot built module i is assigned
  // to, -1 when free. Maximum matching, so a slot that CAN be covered always is.
  const modToSlot = new Array<number>(mods.length).fill(-1)
  const assign = (j: number, seen: boolean[]): boolean => {
    for (const i of canTake[j]) {
      if (seen[i]) continue
      seen[i] = true
      if (modToSlot[i] === -1 || assign(modToSlot[i], seen)) {
        modToSlot[i] = j
        return true
      }
    }
    return false
  }
  for (let j = 0; j < slots.length; j++) {
    if (!assign(j, new Array<boolean>(mods.length).fill(false))) return null
  }

  const subset: number[] = []
  for (let i = 0; i < mods.length; i++) if (modToSlot[i] !== -1) subset.push(i)
  return subset.sort((a, b) => a - b)
}

export interface ComboCostQuery {
  baseModel: string
  modules: string[]
  height: string
  tier?: string | null
  asOf?: string
}

export interface ComboCostHit {
  combo: CanonicalCombo
  /** The COST of the matched subset at this height. */
  cost: number
  /** The SELLING price of the same subset, when the row carries one. */
  selling: number | null
  matchedIndices: number[]
}

export function pickComboCost(
  query: ComboCostQuery,
  rows: readonly CanonicalCombo[],
): ComboCostHit | null {
  const asOf = query.asOf ?? new Date().toISOString().slice(0, 10)
  const candidates: ComboCostHit[] = []

  for (const combo of rows) {
    if (combo.deletedAt !== null) continue
    if (combo.baseModel !== query.baseModel) continue
    if (combo.tier !== null && query.tier != null && combo.tier !== query.tier) continue
    if (combo.effectiveFrom > asOf) continue

    const matched = matchComboSlots(query.modules, combo.modules)
    if (matched === null) continue

    const cost = combo.costByHeight[query.height]
    if (typeof cost !== 'number' || cost <= 0) continue

    const selling = combo.sellingByHeight[query.height]
    candidates.push({
      combo,
      cost,
      selling: typeof selling === 'number' ? selling : null,
      matchedIndices: matched,
    })
  }

  if (candidates.length === 0) return null

  // The sales-side master row first (a supplier row is that supplier's own
  // cost, which is a different question from what this sofa cost us), then the
  // freshest effective row, then the most slots covered so a richer combo is
  // not beaten by a two-slot one that happens to fit inside it.
  candidates.sort((a, b) =>
    Number(a.combo.supplierId !== null) - Number(b.combo.supplierId !== null) ||
    (a.combo.effectiveFrom < b.combo.effectiveFrom ? 1 : a.combo.effectiveFrom > b.combo.effectiveFrom ? -1 : 0) ||
    b.matchedIndices.length - a.matchedIndices.length,
  )
  return candidates[0]
}
