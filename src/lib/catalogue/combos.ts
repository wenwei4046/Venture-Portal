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
 *     slots; the extras keep their own price. Order is irrelevant. Codes
 *     compare trimmed and ignoring case — the portal's rule, not the ERP's
 *     (2026-10-21): its SKU master holds the SOFFIO console as 8030-Console
 *     and a retired 8030-CONSOLE, and a set made on CONSOLE never met the
 *     Console a quote or a bill carries.
 *   * The combo ALWAYS wins — there is no "only if it is cheaper" guard (the
 *     Chairman removed it 2026-05-30).
 *   * Same base model only; one tier and one seat height across the set; the
 *     matched lines must share one quantity (a combo is ONE set, and mixed
 *     quantities have no clean set count — never under-book).
 *   * The set's price is found at the build's fabric tier the way a module's
 *     is (`gridPrice`, `catalogue_grid_price`): that tier, else PRICE_2, else
 *     the lowest tier the portal priced it at (2026-10-21: every sofa bill
 *     arrives at PRICE_2, the SOFFIO sets are priced at PRICE_1 only, and the
 *     Quote — which can only offer PRICE_1 for SOFFIO — and the run must cost
 *     the same sale alike).
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
 * The key the PORTAL stores a combo's price under — the text of the SQL's
 * `erp_combo_slots_key()` (migration 20260919010000), which is what
 * `erp_sofa_combos.slots_key` and `catalogue_combo_prices.slots_key` hold:
 * codes sorted inside each slot, slots ordered by their JSON text, printed the
 * way jsonb prints (`", "` between elements). Not the ERP's own
 * `comboSlotsKey` (plain JSON.stringify, slots by joined codes), which names
 * the same combo differently.
 *
 * Code order follows JavaScript's comparison; the database orders by its
 * collation, which can differ for mixed-case codes — so a price is always
 * found by JOINING on the stored key, never by recomputing it here.
 */
export function comboSlotsKey(raw: unknown): string {
  const slotText = (slot: string[]) => `[${[...slot].sort().map(c => JSON.stringify(c)).join(', ')}]`
  const slots = normaliseComboModules(raw).map(slotText)
  slots.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `[${slots.join(', ')}]`
}

/**
 * Which built modules cover the combo's slots — 0-based indices into `built`,
 * ascending — or null when a slot cannot be filled. The ERP's
 * `matchComboSubset` (scm/shared/sofa-combo-pricing.ts), line for line:
 * Kuhn's augmenting-path matching oriented slot → module, slots in order,
 * each trying modules in build order. Where the OR-sets overlap it can move an
 * earlier slot to another module to free one for a later slot, so WHICH
 * modules the combo consumes — and so which stay extras at their own price —
 * is the ERP's choice exactly. Codes compare ignoring case (2026-10-21: a slot
 * of `CONSOLE` takes the `Console` module). The SQL twin is `catalogue_match_slots`.
 */
export function matchComboSlots(built: readonly string[], rawSlots: unknown): number[] | null {
  const slots = normaliseComboModules(rawSlots)
  const mods = built.map(m => m.trim().toUpperCase())
  if (slots.length === 0 || mods.length < slots.length) return null

  const canTake = slots.map(slot => {
    const set = new Set(slot.map(code => code.toUpperCase()))
    return mods.map((_m, i) => i).filter(i => mods[i] !== '' && set.has(mods[i]))
  })
  if (canTake.some(c => c.length === 0)) return null

  const modToSlot = new Array<number>(mods.length).fill(-1)
  const assignSlot = (j: number, seen: boolean[]): boolean => {
    for (const i of canTake[j]) {
      if (seen[i]) continue
      seen[i] = true
      if (modToSlot[i] === -1 || assignSlot(modToSlot[i], seen)) {
        modToSlot[i] = j
        return true
      }
    }
    return false
  }
  for (let j = 0; j < slots.length; j++) {
    if (!assignSlot(j, new Array<boolean>(mods.length).fill(false))) return null
  }
  const subset: number[] = []
  for (let i = 0; i < mods.length; i++) if (modToSlot[i] !== -1) subset.push(i)
  return subset
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
 * How near a combo's tier is to the build's, in the order `gridPrice` takes a
 * module's cell: the build's own tier (a tier-specific combo before an
 * any-tier one), else PRICE_2, else the lowest tier priced.
 */
function tierFit(tier: string | null, want: string): number {
  return tier === want ? 0 : tier === null ? 1 : tier === 'PRICE_2' ? 2 : 3
}

/**
 * The combo a build is costed at, or null. Candidates are live combos of the
 * same base model that are EXACTLY the build — every piece fills one of their
 * slots, nothing more, nothing less (2026-10-08, user: 完全一样才算; the ERP
 * took a combo the build merely covered) — and that the portal priced at this
 * seat height, at any fabric tier. The build's own tier wins — a tier-specific
 * combo before an any-tier one — else PRICE_2, else the lowest tier, as a
 * module's price falls back (2026-10-21); then the newest effective row, the
 * newest created, the id — the ERP's own tie-breaks.
 *
 * `asOf` (an ISO date) drops combos not yet in effect. Without it nothing is
 * dropped — the SQL twin and the ERP default to today, and so does the one
 * caller that matters: `member_catalogue` answers only combos in effect today.
 */
export function pickCombo(
  build: { baseModel: string; modules: readonly string[]; height: string; tier: string },
  combos: readonly PricedCombo[],
  asOf?: string,
): ComboHit | null {
  const bm = build.baseModel.trim().toUpperCase()
  const pieces = build.modules.filter(m => m.trim() !== '').length
  const hits: ComboHit[] = []
  for (const combo of combos) {
    if (combo.baseModel.trim().toUpperCase() !== bm) continue
    if (asOf !== undefined && combo.effectiveFrom > asOf) continue
    const matched = matchComboSlots(build.modules, combo.modules)
    if (matched === null || matched.length !== pieces) continue
    const price = priceAt(combo, build.height)
    if (price === null) continue
    hits.push({ combo, price, matched })
  }
  if (hits.length === 0) return null
  const asc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)
  hits.sort(
    (a, b) =>
      tierFit(a.combo.tier, build.tier) - tierFit(b.combo.tier, build.tier) ||
      asc(a.combo.tier ?? '', b.combo.tier ?? '') ||
      desc(a.combo.effectiveFrom, b.combo.effectiveFrom) ||
      desc(a.combo.createdAt ?? '', b.combo.createdAt ?? '') ||
      desc(a.combo.erpId, b.combo.erpId),
  )
  return hits[0]
}

/**
 * Could ONE build match both combos exactly? The same number of pieces, paired
 * so each pair shares a module — "1A(R) (LHF or RHF) + 1NA" and
 * "1A(R)(LHF) + 1NA" collide, "3+2" and "3+2+1" do not. Case is ignored, as
 * the matching ignores it, so "… + CONSOLE" and "… + Console" collide. The SQL
 * twin, `catalogue_combos_collide`, is the same matching run on the slots
 * themselves; Add combo refuses a set that collides with one the model has.
 */
export function combosCollide(a: unknown, b: unknown): boolean {
  const upper = (slot: string[]) => slot.map(code => code.toUpperCase())
  const sa = normaliseComboModules(a).map(upper)
  const sb = normaliseComboModules(b).map(upper)
  if (sa.length === 0 || sa.length !== sb.length) return false
  const codes = sb.map((_slot, j) => `b${j}`)
  const adjacency = sa.map(slot => sb.flatMap((other, j) => (other.some(m => slot.includes(m)) ? [codes[j]] : [])))
  if (adjacency.some(c => c.length === 0)) return false
  return matchComboSlots(codes, adjacency) !== null
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
  const raw = ownCents.map(c => Math.round(c))
  const weights = raw.map(c => Math.max(0, c))
  const sum = weights.reduce((a, b) => a + b, 0)
  const out = sum <= 0 ? weights.map(() => Math.floor(total / n)) : weights.map(w => Math.floor((w * total) / sum))
  // The dearest line by its RAW cost, as the ERP and the SQL twin pick it.
  let target = 0
  for (let i = 1; i < n; i++) if (raw[i] > raw[target]) target = i
  out[target] += total - out.reduce((a, b) => a + b, 0)
  return out
}
