/**
 * Sofa combos at the portal's prices — the TypeScript twins of
 * `erp_combo_slots_key`, `catalogue_match_slots` and `catalogue_apply_combos`
 * (migrations 20260919010000 / 20260924030000), and through them of the ERP's
 * own rules (scm/shared/sofa-combo-pricing.ts, mfg-sales-orders.ts
 * recomputeTotals), which were read, not assumed:
 *
 *   * A combo is ordered SLOTS, each an OR-set of module codes. A build MATCHES
 *     when every slot is covered by a DISTINCT built module whose code is in
 *     that slot's set. The build may carry more modules than the combo has
 *     slots; the extras keep their own price. Order is irrelevant.
 *   * The combo ALWAYS wins — there is no "only if it is cheaper" guard (the
 *     Chairman removed it 2026-05-30).
 *   * Same base model only; one tier and one seat height across the set; the
 *     matched lines must share one quantity (a combo is ONE set, and mixed
 *     quantities have no clean set count — never under-book).
 *   * The combo's total is spread across the matched lines in proportion to
 *     their own costs, the rounding residual to the dearest line; evenly when
 *     none of them has a cost.
 *
 * What differs is only WHOSE price: here, the portal's price per seat height
 * for the combo's (base model, slot-set, tier), from catalogue_combo_prices.
 */

import { heightKey } from './keys'

export type ComboSlots = string[][]

/**
 * Coerce a combo's `modules` into slots, tolerating the ERP's legacy flat form
 * (each code its own slot). Codes inside a slot are sorted, empty slots dropped.
 * Slot ORDER is kept — matching is order-independent anyway.
 */
export function normaliseComboModules(raw: unknown): ComboSlots {
  if (!Array.isArray(raw)) return []
  const out: ComboSlots = []
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      const slot = entry
        .map(c => (c === null || c === undefined ? '' : String(c).trim()))
        .filter(Boolean)
        .sort()
      if (slot.length > 0) out.push(slot)
    } else if (entry !== null && entry !== undefined && String(entry).trim() !== '') {
      out.push([String(entry).trim()])
    }
  }
  return out
}

/**
 * Order-independent key for a slot-set — sort within each slot, sort the
 * slots, stringify. Must agree with the ERP's `comboSlotsKey` and the SQL's
 * `erp_combo_slots_key()`, because it is half of the key the portal's combo
 * price is stored under.
 */
export function comboSlotsKey(raw: unknown): string {
  const slots = normaliseComboModules(raw)
    .map(slot => [...slot].sort())
    .sort((a, b) => (a.join('') < b.join('') ? -1 : a.join('') > b.join('') ? 1 : 0))
  return JSON.stringify(slots)
}

/**
 * Which built modules cover the combo's slots — 0-based indices into `built`,
 * ascending — or null when a slot cannot be filled. An exhaustive search in
 * slot order trying modules in build order, so a slot that CAN be covered
 * always is (the ERP uses Kuhn's matching for the same guarantee), and the
 * first choice is the same one the SQL twin makes.
 */
export function matchComboSlots(built: readonly string[], rawSlots: unknown): number[] | null {
  const slots = normaliseComboModules(rawSlots)
  const mods = built.map(m => m.trim())
  if (slots.length === 0 || mods.length < slots.length) return null

  const cand = slots.map(slot => {
    const set = new Set(slot)
    return mods.map((_m, i) => i).filter(i => mods[i] !== '' && set.has(mods[i]))
  })
  if (cand.some(c => c.length === 0)) return null

  const used = new Array<boolean>(mods.length).fill(false)
  const chosen = new Array<number>(slots.length).fill(-1)
  const pos = new Array<number>(slots.length).fill(-1)
  let j = 0
  while (j >= 0 && j < slots.length) {
    if (chosen[j] !== -1) {
      used[chosen[j]] = false
      chosen[j] = -1
    }
    let found = false
    for (let k = pos[j] + 1; k < cand[j].length; k++) {
      const i = cand[j][k]
      if (!used[i]) {
        used[i] = true
        chosen[j] = i
        pos[j] = k
        found = true
        break
      }
    }
    if (found) {
      j++
    } else {
      pos[j] = -1
      j--
    }
  }
  if (j < slots.length) return null
  return [...chosen].sort((a, b) => a - b)
}

/** A combo the ERP defines, with the portal's price per seat height. */
export interface PricedCombo {
  erpId: string
  baseModel: string
  modules: unknown
  /** null = any tier (the ERP's NULL). */
  tier: string | null
  label: string | null
  effectiveFrom: string
  createdAt: string | null
  /** The portal's price, keyed by seat height as typed. */
  priceByHeight: Record<string, number>
}

export interface ComboHit {
  combo: PricedCombo
  /** The portal's price for ONE set at this height. */
  price: number
  /** 0-based indices of the built modules the combo consumed. */
  matched: number[]
}

function priceAt(combo: PricedCombo, height: string): number | null {
  const want = heightKey(height)
  if (want === null) return null
  for (const [h, p] of Object.entries(combo.priceByHeight)) {
    if (heightKey(h) === want && typeof p === 'number' && Number.isFinite(p) && p > 0) return p
  }
  return null
}

/**
 * The combo a build is costed at, or null. Candidates are live combos of the
 * same base model whose tier is the build's (or any), that the build covers,
 * and that the portal priced at this seat height. A tier-specific combo beats
 * an any-tier one; then the newest effective row, the newest created, the id —
 * the ERP's own tie-breaks.
 */
export function pickCombo(
  build: { baseModel: string; modules: readonly string[]; height: string; tier: string },
  combos: readonly PricedCombo[],
  asOf?: string,
): ComboHit | null {
  const bm = build.baseModel.trim().toUpperCase()
  const hits: ComboHit[] = []
  for (const combo of combos) {
    if (combo.baseModel.trim().toUpperCase() !== bm) continue
    if (combo.tier !== null && combo.tier !== build.tier) continue
    if (asOf !== undefined && combo.effectiveFrom > asOf) continue
    const matched = matchComboSlots(build.modules, combo.modules)
    if (matched === null) continue
    const price = priceAt(combo, build.height)
    if (price === null) continue
    hits.push({ combo, price, matched })
  }
  if (hits.length === 0) return null
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)
  hits.sort(
    (a, b) =>
      Number(b.combo.tier !== null) - Number(a.combo.tier !== null) ||
      desc(a.combo.effectiveFrom, b.combo.effectiveFrom) ||
      desc(a.combo.createdAt ?? '', b.combo.createdAt ?? '') ||
      desc(a.combo.erpId, b.combo.erpId),
  )
  return hits[0]
}

/**
 * Spread a combo's total across the matched lines, in CENTS: in proportion to
 * each line's own cost, the rounding residual into the dearest line so the
 * shares sum to exactly the total; evenly when no line carries a cost. The
 * ERP's spreadComboTotal, unit-for-unit.
 */
export function spreadComboTotal(ownCents: readonly number[], totalCents: number): number[] {
  const n = ownCents.length
  if (n === 0) return []
  const total = Math.max(0, Math.round(totalCents))
  const weights = ownCents.map(c => Math.max(0, Math.round(c)))
  const sum = weights.reduce((a, b) => a + b, 0)
  const out = sum <= 0 ? weights.map(() => Math.floor(total / n)) : weights.map(w => Math.floor((w * total) / sum))
  let target = 0
  for (let i = 1; i < n; i++) if (weights[i] > weights[target]) target = i
  out[target] += total - out.reduce((a, b) => a + b, 0)
  return out
}
