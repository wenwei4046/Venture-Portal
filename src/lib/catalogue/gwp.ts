/**
 * A gift with purchase (Product List › GWP, 2026-11-08 — the user: "dullop mattress ecobliss, set a gwp 2
 * micorfibre pillow. so the margin calculator and margin leader will not calculate the cost in for those 2
 * pillow. is jsut calculate the mattress cost only"): buying one of a GWP's SKUs earns, per unit bought, up to
 * `perUnit` units of its gift SKUs — any of them, together — whose cost the margin does not count.
 *
 * How a bill (or a Quote's cart) is read, here and in its SQL twin `sales_order_gwp_free`:
 *  - a GWP has no dates (the user: "gwp no need got set date funtion"): while it is on the list it counts on
 *    every bill, a month already gone too, and taken off it counts on none;
 *  - its allowance on the bill = perUnit × every unit of its BUY SKUs on it;
 *  - its gift SKUs' lines take it CHEAPEST FIRST — a unit cost not known yet first of all, then the line's id —
 *    so a margin is read low rather than high (the user's rule: 补钱容易、扣钱难);
 *  - every line of a gift SKU counts, whatever its price: the ERP prices a package on its main line and puts
 *    most others at RM 0, so a price says nothing about a gift;
 *  - two GWPs on one bill each take their own allowance; a line is never more than wholly free.
 * Codes compare trimmed and in capitals, as a cost ratio's do.
 */

export interface GwpRule {
  id: string
  /** The codes a line carries for the SKUs whose purchase earns it. */
  buy: readonly string[]
  /** The codes of the SKUs it may be — any of them, together at most perUnit × the units bought. */
  gift: readonly string[]
  /** Gift units per unit bought (1–100). */
  perUnit: number
}

export interface GwpLine {
  id: string
  productCode: string
  qty: number
  /** The line's cost (all its units); null or absent while it has none. */
  costAmount?: number | null
}

function codeKey(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

/** Each line's units given with a purchase, by line id — only the lines with some. */
export function gwpFreeUnits(lines: readonly GwpLine[], rules: readonly GwpRule[]): Map<string, number> {
  const claimed = new Map<string, number>()
  const qtyOf = new Map(lines.map(l => [l.id, l.qty] as const))
  for (const rule of rules) {
    if (!(rule.perUnit > 0)) continue
    const buy = new Set(rule.buy.map(codeKey))
    const gift = new Set(rule.gift.map(codeKey))
    const bought = lines.reduce((sum, l) => (buy.has(codeKey(l.productCode)) && l.qty > 0 ? sum + l.qty : sum), 0)
    let left = rule.perUnit * bought
    if (!(left > 0)) continue
    const eligible = lines
      .filter(l => gift.has(codeKey(l.productCode)) && l.qty > 0)
      .map(l => ({ line: l, unit: l.costAmount === null || l.costAmount === undefined ? null : l.costAmount / l.qty }))
      .sort((a, b) => {
        if (a.unit === null || b.unit === null) {
          if (a.unit !== b.unit) return a.unit === null ? -1 : 1
        } else if (a.unit !== b.unit) {
          return a.unit - b.unit
        }
        return a.line.id < b.line.id ? -1 : a.line.id > b.line.id ? 1 : 0
      })
    for (const { line } of eligible) {
      if (left <= 0) break
      const take = Math.min(left, line.qty)
      claimed.set(line.id, (claimed.get(line.id) ?? 0) + take)
      left -= take
    }
  }
  const free = new Map<string, number>()
  for (const [id, units] of claimed) {
    const capped = Math.min(units, qtyOf.get(id) ?? 0)
    if (capped > 0) free.set(id, capped)
  }
  return free
}

/** The part of each line given with a purchase, 0 < part ≤ 1, by line id. */
export function gwpFreeParts(lines: readonly GwpLine[], rules: readonly GwpRule[]): Map<string, number> {
  const parts = new Map<string, number>()
  const byId = new Map(lines.map(l => [l.id, l] as const))
  for (const [id, units] of gwpFreeUnits(lines, rules)) {
    const qty = byId.get(id)?.qty ?? 0
    if (qty > 0) parts.set(id, Math.min(1, units / qty))
  }
  return parts
}

/** GWPs as the database hands them: `[{ id, buy: [codes], gift: [codes], perUnit }]`. */
export function gwpRulesOf(raw: unknown): GwpRule[] {
  if (!Array.isArray(raw)) return []
  const codes = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : []
  const rules: GwpRule[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const perUnit = Number(r.perUnit)
    const buy = codes(r.buy)
    const gift = codes(r.gift)
    if (!Number.isFinite(perUnit) || perUnit <= 0 || !buy.length || !gift.length) continue
    rules.push({ id: typeof r.id === 'string' ? r.id : String(rules.length), buy, gift, perUnit })
  }
  return rules
}
