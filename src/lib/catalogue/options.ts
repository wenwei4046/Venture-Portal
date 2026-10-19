/**
 * How the ERP's Modular tab maps onto the portal's own ticks.
 *
 * A model's `allowed_options` (ERP scm.product_models) has one shape per
 * category:
 *
 *   SOFA      compartments · sizes (SEAT heights) · leg_heights · specials
 *   BEDFRAME  sizes · divan_heights · total_heights · gaps · leg_heights · specials
 *   MATTRESS  sizes (· mattress_thickness_cm)
 *
 * Some of those keys ARE the model's SKUs — a sofa's compartments are its
 * module SKUs (`8030-1A(LHF)`), a bed frame's or mattress's sizes are its size
 * SKUs (`1025-(K)`) — and the portal ticks those per SKU
 * (`catalogue_skus.offered`), because a SKU is what a quote line is. The rest
 * are option POOLS the calculator offers as dropdowns, ticked per model
 * (`catalogue_models.enabled`), keyed exactly as the ERP keys them so the two
 * read side by side.
 */

/** The ERP key that lists a category's SKUs, when it has one. */
export function skuKeyOf(category: string | null): 'compartments' | 'sizes' | null {
  const c = (category ?? '').toUpperCase()
  if (c === 'SOFA') return 'compartments'
  if (c === 'BEDFRAME' || c === 'MATTRESS') return 'sizes'
  return null
}

export interface OptionKey {
  /** The key in the ERP's allowed_options and in catalogue_models.enabled. */
  key: string
  /** The Maintenance pool its values come from and are priced in. */
  pool: string
  label: string
  /** True when Maintenance may price it: the customer is then charged for it (2026-10-06). */
  priced: boolean
}

/** The option pools (NOT the SKU keys) a category's calculator offers, in the ERP's own order. */
export function optionKeysOf(category: string | null): OptionKey[] {
  const c = (category ?? '').toUpperCase()
  if (c === 'SOFA') {
    return [
      { key: 'sizes', pool: 'sofa_sizes', label: 'Seat height', priced: false },
      { key: 'leg_heights', pool: 'sofa_leg_heights', label: 'Leg height', priced: true },
      { key: 'specials', pool: 'sofa_specials', label: 'Specials', priced: true },
    ]
  }
  // Every option is offered on the Quote only when turned ON here (user
  // 2026-10-05) — and charged to the customer when Maintenance prices it
  // (`MemberCatalogueModel.charges`; a bed frame per frame, a sofa once per
  // sofa, 20261006050000). A height nobody priced is FOC; a special, free.
  if (c === 'BEDFRAME') {
    return [
      { key: 'divan_heights', pool: 'bedframe_divan_heights', label: 'Divan height', priced: true },
      { key: 'total_heights', pool: 'bedframe_total_heights', label: 'Total height', priced: true },
      { key: 'gaps', pool: 'bedframe_gaps', label: 'Gap', priced: true },
      { key: 'leg_heights', pool: 'bedframe_leg_heights', label: 'Leg height', priced: true },
      { key: 'specials', pool: 'bedframe_specials', label: 'Specials', priced: true },
    ]
  }
  return []
}

// The prototype's words (design_handoff_product_list). The bed frame's specials and
// the sofa's leg heights and specials are charges since 2026-10-06 (the prototype
// still calls them surcharges), so theirs follow the same voice.
const FRAME_CHARGE = 'What the customer pays (RM) when a member picks this option for a bed frame on the Quote. Out of the margin on both sides, paid ordinary commission like the rest of the bill, never KPI. Blank or 0 is FOC.'
const CHARGE_TAIL = 'Out of the margin on both sides, paid ordinary commission like the rest of the bill, never KPI.'

/**
 * The Maintenance tab's rail, as the ERP draws it (the Products Maintenance
 * pools are not mirrored). `charge`: the price is the customer's, out of the
 * margin — every priced pool since 2026-10-06 (`poolPriceOf`). `note`: what a
 * price there does, under the table's toolbar.
 */
export const MAINTENANCE_SECTIONS: Array<{ section: 'Bedframe' | 'Sofa'; pools: Array<{ pool: string; label: string; priced: boolean; charge: boolean; note: string }> }> = [
  {
    section: 'Bedframe',
    pools: [
      { pool: 'bedframe_divan_heights', label: 'Divan Heights', priced: true, charge: true, note: FRAME_CHARGE },
      { pool: 'bedframe_total_heights', label: 'Total Heights', priced: true, charge: true, note: FRAME_CHARGE },
      { pool: 'bedframe_gaps', label: 'Gaps', priced: true, charge: true, note: FRAME_CHARGE },
      { pool: 'bedframe_leg_heights', label: 'Leg Heights', priced: true, charge: true, note: FRAME_CHARGE },
      { pool: 'bedframe_specials', label: 'Specials', priced: true, charge: true, note: `What the customer pays (RM) when a member ticks this special for a bed frame on the Quote. ${CHARGE_TAIL} Blank or 0 is not offered.` },
    ],
  },
  {
    section: 'Sofa',
    pools: [
      { pool: 'sofa_sizes', label: 'Sizes', priced: false, charge: false, note: 'ERP choices only. This pool has no surcharge; model availability is set on Modular.' },
      { pool: 'sofa_leg_heights', label: 'Leg Heights', priced: true, charge: true, note: `What the customer pays (RM) for this leg height on the Quote, once per sofa. ${CHARGE_TAIL} Blank or 0 is FOC.` },
      { pool: 'sofa_specials', label: 'Specials', priced: true, charge: true, note: `What the customer pays (RM) for this special on the Quote, once per sofa. ${CHARGE_TAIL} Blank or 0 is not offered.` },
    ],
  },
]

/** Allowed-option values as the ERP stores them: strings, or {value} objects. */
export function allowedValues(allowed: unknown, key: string): string[] {
  if (!allowed || typeof allowed !== 'object' || Array.isArray(allowed)) return []
  const raw = (allowed as Record<string, unknown>)[key]
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const s =
      typeof v === 'string'
        ? v
        : v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'string'
          ? ((v as { value: string }).value)
          : ''
    const t = s.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Whether the ERP restricts one of a model's option keys at all: a non-empty list does, nothing else. */
export function isRestricted(allowed: unknown, key: string): boolean {
  if (!allowed || typeof allowed !== 'object' || Array.isArray(allowed)) return false
  const raw = (allowed as Record<string, unknown>)[key]
  return Array.isArray(raw) && raw.length > 0
}

/**
 * What the ERP lets a model take for one option key: its own list — or, when
 * that list is empty or missing, everything in the Maintenance pool. The
 * ERP's own rule (allowed-options-check.ts `hasRestriction`): only a
 * non-empty allowed_options.<key> restricts; an empty one is a model nobody
 * restricted, not a model that may take nothing. The twin of
 * `catalogue_model_options`' allowed test (migration 20260924040000).
 */
export function erpAllows(allowed: unknown, key: string, pool: readonly string[]): string[] {
  return isRestricted(allowed, key) ? allowedValues(allowed, key) : [...pool]
}

/** The brand override that marks a model a rider on Modular. */
export const RIDER = 'RIDER'

/** Only a mattress or a sofa sells under a brand (user 2026-09-12); everything else rides along. */
export function sellsUnderBrand(category: string | null): boolean {
  const c = (category ?? '').trim().toUpperCase()
  return c === 'MATTRESS' || c === 'SOFA'
}

/**
 * Whether Modular asks a person for the margin ladder and the calculator
 * section (2026-10-06, user: 它是跟着 brand，而不是跟着我这里去选 … for those
 * system can't detect the brand). Only a mattress or a sofa whose ERP branding
 * names no brand the portal knows (MYLATEX, or none) — `derivedBrand` null.
 * A branded one follows its brand, and a bed frame or an accessory is a rider
 * whose margin follows the cart's brand: neither is asked, and a pick stored
 * for one is not read. The twin of member_catalogue's (migration
 * 20261006170000).
 */
export function needsBrandPick(category: string | null, derivedBrand: string | null): boolean {
  return sellsUnderBrand(category) && !derivedBrand
}

/**
 * Whether a model's SKUs join any cart, the way `member_catalogue` reads it
 * (migration 20261006170000): a bed frame, an accessory or anything else that
 * is not a mattress or a sofa, always — or a brandless mattress or sofa marked
 * Rider on Modular. `brandPick` is the pick that counts: null wherever
 * `needsBrandPick` is false.
 */
export function isRiderModel(category: string | null, brandPick: string | null): boolean {
  if (!sellsUnderBrand(category)) return true
  return brandPick === RIDER
}

/**
 * Whether Modular offers a model a name of the portal's own (2026-10-19, user:
 * "sofa category same as mattress have the model name … then it can be add and
 * edit"): a sofa only. A mattress's model IS its name (APEX); a sofa's is a
 * number (5066), and the ERP names a dozen of them. Kept in
 * `catalogue_models.model_name`, shown before the ERP's own name.
 */
export function takesModelName(category: string | null): boolean {
  return (category ?? '').trim().toUpperCase() === 'SOFA'
}

/** A model as a list names it: `5066 · ROMA`, or the code alone when it has no other name. */
export function modelLabelOf(code: string, name: string | null): string {
  return name && name !== code ? `${code} · ${name}` : code
}

/** The calculator's section for a model — `catalogue_calc_category` in TypeScript. */
export function calcCategoryOf(category: string | null, name: string | null): string {
  const c = (category ?? '').trim().toUpperCase()
  const n = name ?? ''
  if (c === 'MATTRESS') return 'Mattress'
  if (c === 'BEDFRAME') return 'Bed frame'
  if (c === 'SOFA') return 'Sofa'
  if (c === 'ACCESSORY') {
    if (/PROTECTOR/i.test(n)) return 'Protector'
    if (/PILLOW/i.test(n)) return 'Pillow'
    return 'Accessory'
  }
  if (c === 'FABRIC_ACCESSORY') return 'Accessory'
  return 'Other'
}

export const CALC_CATEGORIES = ['Mattress', 'Bed frame', 'Sofa', 'Pillow', 'Protector', 'Accessory', 'Other'] as const

/** Accessories were gift-eligible on the old Product List without exception; nothing else was. */
export function defaultGift(calcCategory: string): boolean {
  return calcCategory === 'Pillow' || calcCategory === 'Protector' || calcCategory === 'Accessory'
}

/**
 * The calculator's size words. The ERP's size codes are K / Q / S / SS / SK /
 * SP; the calculator (and the gift-size match) speaks King / Queen / Single /
 * Super Single, which is what the old Product List stored.
 */
const SIZE_WORDS: Record<string, string> = {
  K: 'King',
  Q: 'Queen',
  S: 'Single',
  SS: 'Super Single',
  SK: 'Super King',
  SP: 'Special size',
}

/** The TypeScript twin of `catalogue_size_word` (migration 20260924040000): a blank label falls back to the code. */
export function sizeWordOf(sizeCode: string | null, sizeLabel: string | null): string {
  const code = (sizeCode ?? '').trim().toUpperCase()
  if (code && SIZE_WORDS[code]) return SIZE_WORDS[code]
  return (sizeLabel ?? '').trim() || (sizeCode ?? '').trim()
}

/** The one label a SKU carries under its model: its module, its size, or its code. */
export function skuOptionLabel(sku: {
  category: string | null
  module_code: string | null
  size_code: string | null
  size_label: string | null
  item_code: string
}): string {
  const c = (sku.category ?? '').toUpperCase()
  if (c === 'SOFA' && sku.module_code) return sku.module_code
  if ((c === 'BEDFRAME' || c === 'MATTRESS') && (sku.size_code || sku.size_label)) {
    return sizeWordOf(sku.size_code, sku.size_label)
  }
  return sku.item_code
}
