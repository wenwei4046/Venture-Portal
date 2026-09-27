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
 * Applied per LINE, by the line's product code, everywhere a margin is taken:
 * the run (`marginBase`), the month's bill drill-down, the member calculator,
 * and the SQL twins (`revenue_month_orders`, `member_order_facts`). A ratio
 * that is missing or nonsense falls back to the default, and a default that is
 * nonsense to 1 — never a cost erased or divided by zero.
 */

export interface CostRatio {
  /** The ERP Item Code the ratio's SKU carries. */
  productCode: string
  ratio: number
}

export interface CostBasis {
  /** The sub-department's default. */
  divisor: number
  /** Normalised product code → that SKU's own ratio. */
  ratios: ReadonlyMap<string, number>
}

function usable(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** Codes are compared as the engine compares them: trimmed, upper case. */
function codeKey(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

export function costBasisOf(divisor: number | null | undefined, ratios: readonly CostRatio[] = []): CostBasis {
  const map = new Map<string, number>()
  for (const r of ratios) {
    const code = codeKey(r.productCode)
    if (code && usable(r.ratio) && !map.has(code)) map.set(code, r.ratio)
  }
  return { divisor: usable(divisor) ? divisor : 1, ratios: map }
}

/** What this product code's cost is divided by. */
export function costDivisorFor(productCode: string | null | undefined, basis: CostBasis): number {
  return basis.ratios.get(codeKey(productCode)) ?? basis.divisor
}
