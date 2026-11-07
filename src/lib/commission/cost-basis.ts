/**
 * The Revenue Team cost basis — what a line's cost is divided by before any
 * margin is judged (Product List › Costing Setting, 2026-09-27).
 *
 * Each sub-department has ONE default ratio (`comm_schemes.revenue_cost_divisor`,
 * Fair 0.7: "cost / 0.7 = revenue fair department team cost", 2026-09-12), and
 * a SKU may carry its own (`comm_cost_ratios`: "部分 SKU 它的除法 rate 不一样，
 * 比如可能是除以 0.6"). RM 1,000 of Product List cost is judged as RM 1,428.57
 * at 0.7 and RM 1,666.67 at 0.6.
 *
 * A RIDER SKU — a bed frame, an accessory: it rides on a bill of any brand and
 * is judged on that brand's ladder — may also carry a ratio of its own for a
 * brand (`comm_cost_ratio_brands`, 2026-11-07; the user: "Trion 我 right click
 * 它，可以设成 0.6 … 不要同一个 item 在不同的 brand 卖不一样的 margin"). On a
 * bill (or a cart) that answers to that brand's ladder, its cost is divided by
 * that; a brand left unset follows the SKU's own ratio, else the default ("if
 * didnt set, then just follow the default rate").
 *
 * Applied per LINE, by the line's product code, everywhere a margin is taken:
 * the run (`marginBase`), the month's bill drill-down, the member calculator,
 * and the SQL twins (`revenue_month_orders`, `member_order_facts`). A ratio
 * that is missing or nonsense falls back to the next one, and a default that is
 * nonsense to 1 — never a cost erased or divided by zero.
 */

export interface CostRatio {
  /** The ERP Item Code the ratio's SKU carries. */
  productCode: string
  ratio: number
}

/** A rider SKU's ratio for one brand of the sub-department (`comm_cost_ratio_brands`). */
export interface CostRatioByBrand {
  productCode: string
  /** The brand whose ladder the bill answers to — `comm_brands.code`. */
  brand: string
  ratio: number
}

export interface CostBasis {
  /** The sub-department's default. */
  divisor: number
  /** Normalised product code → that SKU's own ratio. */
  ratios: ReadonlyMap<string, number>
  /** Normalised product code → normalised brand → that SKU's ratio for the brand. */
  brandRatios: ReadonlyMap<string, ReadonlyMap<string, number>>
}

function usable(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** Codes are compared as the engine compares them: trimmed, upper case. */
function codeKey(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

/** A brand as the SQL twins compare it: trimmed, upper case; none is ''. */
export function brandKey(brand: string | null | undefined): string {
  return (brand ?? '').trim().toUpperCase()
}

export function costBasisOf(
  divisor: number | null | undefined,
  ratios: readonly CostRatio[] = [],
  byBrand: readonly CostRatioByBrand[] = [],
): CostBasis {
  const map = new Map<string, number>()
  for (const r of ratios) {
    const code = codeKey(r.productCode)
    if (code && usable(r.ratio) && !map.has(code)) map.set(code, r.ratio)
  }
  const brandRatios = new Map<string, Map<string, number>>()
  for (const r of byBrand) {
    const code = codeKey(r.productCode)
    const brand = brandKey(r.brand)
    if (!code || !brand || !usable(r.ratio)) continue
    const brands = brandRatios.get(code) ?? new Map<string, number>()
    if (!brands.has(brand)) brands.set(brand, r.ratio)
    brandRatios.set(code, brands)
  }
  return { divisor: usable(divisor) ? divisor : 1, ratios: map, brandRatios }
}

/**
 * What this product code's cost is divided by on a bill (or a cart) that
 * answers to `brand`'s ladder: its ratio for that brand, else its own, else the
 * sub-department's. No brand — a cart of riders alone, a bill nobody can tell
 * the brand of — is never a brand's.
 */
export function costDivisorFor(productCode: string | null | undefined, basis: CostBasis, brand?: string | null): number {
  const code = codeKey(productCode)
  const forBrand = brand ? basis.brandRatios?.get(code)?.get(brandKey(brand)) : undefined
  return forBrand ?? basis.ratios.get(code) ?? basis.divisor
}
