/**
 * Where a sales line's cost came from, in words — for the bill drill-down, so
 * a margin can be argued with rather than believed (contract §7.2).
 *
 * Since 2026-09-24 every line is priced from the Product List
 * (`catalogue_line_cost`, migration 20260924030000): `cost_source` says which
 * rule answered and `cost_detail` how — the price used, the seat height and
 * tier, the options' surcharges, the combo that spread onto it — or why
 * nothing could price it. Lines that landed before carry the old chain's
 * provenance until a recost re-prices them.
 */

import { TIERS } from './pricing'

/** PRICE_2 → Tier 2, the way the calculator says it. */
function tierLabelOf(tier: string): string {
  const i = (TIERS as readonly string[]).indexOf(tier)
  return i >= 0 ? `Tier ${i + 1}` : tier
}

export interface Provenance {
  /** The one line under the cost. */
  label: string
  /** A line with no cost the bill's margin cannot be judged without. */
  missing: boolean
}

type Detail = Record<string, unknown>

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const money = (v: unknown): string | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? `RM ${n.toFixed(2)}` : null
}

const WHY: Record<string, string> = {
  not_in_sku_master: 'not in the ERP’s SKU master',
  unpriced: 'no price on the Product List',
  no_height: 'no seat height the price grid knows',
  error: 'pricing failed — recost the month',
}

export function costProvenance(
  source: string | null | undefined,
  rawDetail: unknown,
  hasCost: boolean,
): Provenance {
  const detail: Detail = rawDetail && typeof rawDetail === 'object' && !Array.isArray(rawDetail) ? (rawDetail as Detail) : {}
  const how = (() => {
    const parts: string[] = []
    const height = text(detail.height)
    const tier = text(detail.tier)
    if (text(detail.how) === 'grid' && height) parts.push(`seat ${height}${tier ? ` · ${tierLabelOf(tier)}` : ''}`)
    const surcharge = money(detail.surcharge)
    if (surcharge) parts.push(`+ ${surcharge} options`)
    return parts
  })()

  switch (source) {
    case 'catalogue':
      return { label: ['Product List', ...how].join(' · '), missing: false }
    case 'catalogue_combo': {
      const combo = detail.combo && typeof detail.combo === 'object' ? (detail.combo as Detail) : {}
      const name = text(combo.label) ?? 'a combo'
      const price = money(combo.price)
      return { label: `Combo ${name}${price ? ` · ${price} a set` : ''}, spread`, missing: false }
    }
    case 'manual':
      return { label: 'Keyed by hand', missing: false }
    case 'erp_line':
    case 'sku_master':
    case 'product_list':
      return { label: 'Old cost chain — recost to re-price', missing: false }
    default: {
      // A cost with no source landed before provenance was recorded.
      if (hasCost) return { label: 'Old cost chain — recost to re-price', missing: false }
      const reason = text(detail.reason)
      return { label: reason ? (WHY[reason] ?? reason) : 'No cost', missing: true }
    }
  }
}

const CHARGE_WORD: Record<string, string> = {
  bedframe_divan_heights: 'divan',
  bedframe_leg_heights: 'leg',
  bedframe_gaps: 'gap',
  bedframe_total_heights: 'total height',
}

/**
 * `for divan 12" · leg 6"` — what a line's bed frame options were charged for
 * (`cost_detail.charges`, 20261005010000): the customer's price for each,
 * out of the margin and in the commission.
 */
export function chargeText(detail: unknown): string {
  const charges = detail && typeof detail === 'object' && !Array.isArray(detail) ? (detail as Detail).charges : null
  const words = (Array.isArray(charges) ? charges : []).flatMap(c => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return []
    const pool = text((c as Detail).pool)
    const value = text((c as Detail).value)
    const word = pool ? CHARGE_WORD[pool] : undefined
    return word && value ? [`${word} ${value}`] : []
  })
  return words.length ? `for ${words.join(' · ')}` : 'for bed frame options'
}
