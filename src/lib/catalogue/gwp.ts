/**
 * A gift with purchase (Product List › GWP, 2026-11-08 — the user: "dullop mattress ecobliss, set a gwp 2
 * micorfibre pillow. so the margin calculator and margin leader will not calculate the cost in for those 2
 * pillow. is jsut calculate the mattress cost only"). Since the same day EACH GIFT CARRIES ITS OWN QUANTITY (the
 * user, on the tab's gift list: "我这里换成就是 Quantity，就可以加 1、加 2、加 3 这样子"): buying one of a GWP's SKUs
 * earns, per unit bought, up to `perUnit` units of each of its gifts, whose cost the margin does not count — a
 * mattress protector ×1, pillows ×2.
 *
 * How a bill (or a Quote's cart) is read, here and in its SQL twin `sales_order_gwp_free`:
 *  - a GWP has no dates (the user: "gwp no need got set date funtion"): while it is on the list it counts on
 *    every bill, a month already gone too, and taken off it counts on none;
 *  - a gift's allowance on the bill = its perUnit × every unit of the GWP's BUY SKUs on it;
 *  - that gift's lines take it CHEAPEST FIRST — a unit cost not known yet first of all, then the line's id — so a
 *    margin is read low rather than high (the user's rule: 补钱容易、扣钱难);
 *  - every line of a gift SKU counts, whatever its price: the ERP prices a package on its main line and puts
 *    most others at RM 0, so a price says nothing about a gift;
 *  - a gift code listed twice in one GWP counts once, at its larger quantity; two GWPs on one bill each give their
 *    own; a line is never more than wholly free.
 * Codes compare trimmed and in capitals, as a cost ratio's do.
 */

export interface GwpGift {
  /** The code a line carries for the gift. */
  code: string
  /** Its units per unit bought (1–100). */
  perUnit: number
}

export interface GwpRule {
  id: string
  /** The codes a line carries for the SKUs whose purchase earns it. */
  buy: readonly string[]
  /** Each gift and how many of it a unit bought earns. */
  gifts: readonly GwpGift[]
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

/** A GWP's gifts by code, each at its largest quantity — a code listed twice counts once. */
function giftsByCode(gifts: readonly GwpGift[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const g of gifts) {
    const code = codeKey(g.code)
    if (!code || !(g.perUnit > 0)) continue
    out.set(code, Math.max(out.get(code) ?? 0, g.perUnit))
  }
  return out
}

/** Each line's units given with a purchase, by line id — only the lines with some. */
export function gwpFreeUnits(lines: readonly GwpLine[], rules: readonly GwpRule[]): Map<string, number> {
  const claimed = new Map<string, number>()
  const qtyOf = new Map(lines.map(l => [l.id, l.qty] as const))
  for (const rule of rules) {
    const buy = new Set(rule.buy.map(codeKey))
    const bought = lines.reduce((sum, l) => (buy.has(codeKey(l.productCode)) && l.qty > 0 ? sum + l.qty : sum), 0)
    if (!(bought > 0)) continue
    for (const [code, perUnit] of giftsByCode(rule.gifts)) {
      let left = perUnit * bought
      const eligible = lines
        .filter(l => codeKey(l.productCode) === code && l.qty > 0)
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

/** GWPs as the database hands them: `[{ id, buy: [codes], gifts: [{ code, perUnit }] }]`. */
export function gwpRulesOf(raw: unknown): GwpRule[] {
  if (!Array.isArray(raw)) return []
  const rules: GwpRule[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const buy = Array.isArray(r.buy) ? r.buy.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : []
    const gifts = (Array.isArray(r.gifts) ? r.gifts : []).flatMap((g): GwpGift[] => {
      if (!g || typeof g !== 'object') return []
      const code = (g as Record<string, unknown>).code
      const perUnit = Number((g as Record<string, unknown>).perUnit)
      return typeof code === 'string' && code.trim() !== '' && Number.isFinite(perUnit) && perUnit > 0 ? [{ code, perUnit }] : []
    })
    if (!buy.length || !gifts.length) continue
    rules.push({ id: typeof r.id === 'string' ? r.id : String(rules.length), buy, gifts })
  }
  return rules
}
