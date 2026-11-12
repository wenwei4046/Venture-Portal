/**
 * A rank's rate for a brand that follows its own scheme (2026-11-11 — 2990s;
 * the user: "整个提成逻辑一样，只是它的 top rank 抽成是 8%（以此类推，每级往下调
 * 1%）": Team Leader 8%, Senior Team Assistant 7%, Team Assistant 6%, Senior
 * Revenue Specialist 5%, Revenue Specialist 4%).
 *
 * Pure, and read by both sides: the run (`engine.ts`, where a rung's
 * `brandRates` is keyed by the brand's CODE) and Rules › Ranks (the catalogue,
 * `comm_rank_defs.brand_rates`, keyed by the brand's ID — a code can be edited
 * on Rules, an id cannot).
 */

/** What the rule reads of a rung, or of a rank of the catalogue. */
export interface BrandRated {
  /** Pay order, from the lowest up. */
  sortOrder: number
  /** The rung's own rate, 0–1. */
  productRate: number
  /** Its rate per brand, 0–1, keyed as `brandRateOf`'s caller keys the brand. */
  brandRates?: Record<string, number>
}

const keyOf = (brand: string) => brand.trim().toUpperCase()

/** The rate a rung itself names for a brand, the key compared trimmed and in any case. */
function namedBrandRate(rank: BrandRated, brand: string): number | undefined {
  if (!rank.brandRates) return undefined
  for (const [key, rate] of Object.entries(rank.brandRates)) {
    if (keyOf(key) === brand && Number.isFinite(rate) && rate >= 0) return rate
  }
  return undefined
}

/**
 * What a rung pays on a bill of a brand that follows its own scheme.
 *
 * The rate the rung names for that brand. A rung that names none pays the
 * NEAREST RUNG BELOW that does — the brand's top rate stays its top rate (the
 * user's list ends at Team Leader, 8%), and a rung never pays less than the
 * one under it. With none below: the rung's own rate, never above the nearest
 * named rate over it. A brand no rung names a rate for pays every rung its own
 * rate.
 */
export function brandRateOf(rank: BrandRated | undefined, brand: string, ladder: readonly BrandRated[]): number {
  if (!rank) return 0
  const key = keyOf(brand)
  const named = namedBrandRate(rank, key)
  if (named !== undefined) return named
  let below: { rate: number; at: number } | null = null
  let above: { rate: number; at: number } | null = null
  for (const rung of ladder) {
    const rate = namedBrandRate(rung, key)
    if (rate === undefined) continue
    if (rung.sortOrder < rank.sortOrder && (!below || rung.sortOrder > below.at)) below = { rate, at: rung.sortOrder }
    if (rung.sortOrder > rank.sortOrder && (!above || rung.sortOrder < above.at)) above = { rate, at: rung.sortOrder }
  }
  if (below) return below.rate
  return above ? Math.min(rank.productRate, above.rate) : rank.productRate
}

/** Whether the rung names its own rate for the brand (else it follows another's — `brandRateOf`). */
export function namesBrandRate(rank: BrandRated, brand: string): boolean {
  return namedBrandRate(rank, keyOf(brand)) !== undefined
}

// ─── A bill of such a brand, on Comm Cal ────────────────────────────────────

/** What a bill of such a brand reads where a margin would be: it stands in none. */
export const OWN_SCHEME_LABEL = 'Own scheme'

/** The codes of the brands on their own scheme, as a bill's brand code is asked of them. */
export function ownSchemeCodes(brands: readonly { code: string; ownScheme?: boolean | null }[]): Set<string> {
  return new Set(brands.filter(b => b.ownScheme).map(b => keyOf(b.code)))
}

/** Whether a bill's brand is one of them. */
export function isOwnSchemeBill(brandCode: string | null | undefined, codes: ReadonlySet<string>): boolean {
  return Boolean(brandCode) && codes.has(keyOf(brandCode as string))
}

// ─── Rules › Ranks ──────────────────────────────────────────────────────────

/** A brand of the scheme that follows its own scheme, as Rules lists it. */
export interface OwnSchemeBrand {
  id: string
  name: string
}

/** The rank form's field for a brand's rate: `brand_rate_<brand id>`, a percentage, blank = none of its own. */
export const BRAND_RATE_FIELD = 'brand_rate_'

/**
 * `comm_rank_defs.brand_rates` as stored: brand id → rate (0–1). Anything else
 * in it — a list, a rate in quotes, one outside 0–1 — is no rate.
 */
export function readBrandRates(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const rates: Record<string, number> = {}
  for (const [id, rate] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1) rates[id.toLowerCase()] = rate
  }
  return rates
}

/** What a saved rank form asks of the brands' rates: only the brands it carries. */
export interface BrandRateEdits {
  /** Brand id → the rate to keep (0–1). */
  set: Record<string, number>
  /** Brand ids whose rate goes — the box was emptied. */
  clear: string[]
}

/**
 * The brand rates a rank form carries (`brand_rate_<id>`, typed 0–100). A
 * brand the form has no box for is not touched — a page opened before the
 * brand existed, or another screen's save, changes none of them (shared logins
 * keep the same rank open on several PCs). Throws on a rate that is no
 * percentage, naming the brand.
 */
export function brandRateEdits(
  form: { has(name: string): boolean; get(name: string): unknown },
  brands: readonly OwnSchemeBrand[],
): BrandRateEdits {
  const edits: BrandRateEdits = { set: {}, clear: [] }
  for (const brand of brands) {
    const field = `${BRAND_RATE_FIELD}${brand.id}`
    if (!form.has(field)) continue
    const typed = String(form.get(field) ?? '').trim()
    if (typed === '') {
      edits.clear.push(brand.id.toLowerCase())
      continue
    }
    const pct = Number(typed)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new Error(`${brand.name} rate must be between 0 and 100%`)
    }
    // 7 → 0.07, never 0.07000000000000001.
    edits.set[brand.id.toLowerCase()] = Math.round(pct * 10000) / 1000000
  }
  return edits
}

/** The stored rates with a form's edits laid over them; every other brand's rate as it was. */
export function withBrandRateEdits(current: unknown, edits: BrandRateEdits): Record<string, number> {
  const rates = readBrandRates(current)
  for (const id of edits.clear) delete rates[id]
  return { ...rates, ...edits.set }
}

/** Whether the edits change what is stored — a save with none writes no rates at all. */
export function brandRatesChanged(current: unknown, edits: BrandRateEdits): boolean {
  const before = readBrandRates(current)
  const after = withBrandRateEdits(current, edits)
  const ids = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...ids].some(id => before[id] !== after[id])
}

/**
 * Brand ids carried from one scheme to its copy: a rank's rates name brands by
 * id, and a copied scheme has new brands. A rate whose brand was not copied is
 * dropped.
 */
export function remapBrandRates(current: unknown, brandIds: ReadonlyMap<string, string>): Record<string, number> {
  const rates: Record<string, number> = {}
  for (const [id, rate] of Object.entries(readBrandRates(current))) {
    const next = brandIds.get(id)
    if (next) rates[next.toLowerCase()] = rate
  }
  return rates
}
