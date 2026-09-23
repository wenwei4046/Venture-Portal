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
  /** True when choosing it adds a surcharge. */
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
  if (c === 'BEDFRAME') {
    return [
      { key: 'divan_heights', pool: 'bedframe_divan_heights', label: 'Divan height', priced: true },
      { key: 'total_heights', pool: 'bedframe_total_heights', label: 'Total height', priced: true },
      { key: 'gaps', pool: 'bedframe_gaps', label: 'Gap', priced: false },
      { key: 'leg_heights', pool: 'bedframe_leg_heights', label: 'Leg height', priced: true },
      { key: 'specials', pool: 'bedframe_specials', label: 'Specials', priced: true },
    ]
  }
  return []
}

/** The Maintenance tab's rail, as the ERP draws it (the Products Maintenance pools are not mirrored). */
export const MAINTENANCE_SECTIONS: Array<{ section: 'Bedframe' | 'Sofa'; pools: Array<{ pool: string; label: string; priced: boolean }> }> = [
  {
    section: 'Bedframe',
    pools: [
      { pool: 'bedframe_divan_heights', label: 'Divan Heights', priced: true },
      { pool: 'bedframe_total_heights', label: 'Total Heights', priced: true },
      { pool: 'bedframe_gaps', label: 'Gaps', priced: false },
      { pool: 'bedframe_leg_heights', label: 'Leg Heights', priced: true },
      { pool: 'bedframe_specials', label: 'Specials', priced: true },
    ],
  },
  {
    section: 'Sofa',
    pools: [
      { pool: 'sofa_sizes', label: 'Sizes', priced: false },
      { pool: 'sofa_leg_heights', label: 'Leg Heights', priced: true },
      { pool: 'sofa_specials', label: 'Specials', priced: true },
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
