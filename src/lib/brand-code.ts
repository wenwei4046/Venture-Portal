/**
 * The portal's brand an ERP brand word stands for (2026-10-31).
 *
 * The ERP writes a branding on every model, SKU, bill and fair booth; the
 * portal sells under its own brands (`comm_brands`), each with its margin
 * ladder and its calculator in the Revenue app. A brand answers to its code,
 * its name, and its SUB-BRANDS — the ERP brandings that are it
 * (`comm_brands.sub_brands`; the user: "happisleep is the subbrand of akemi …
 * we calculate as a same brand … i wnat make them into one"). So DUNLOPILLO is
 * DUNLOP, and HAPPI SLEEP is AKEMI: Akemi's calculator sells EASE COOL, and a
 * bill written under HAPPI SLEEP is measured on Akemi's ladder.
 */

/** A brand as the ERP may name it: its code, its name, its sub-brands. */
export interface BrandWords {
  code: string
  name: string
  /** The ERP brandings that are this brand (Akemi's: HAPPI SLEEP). */
  subBrands?: readonly string[] | null
}

function wordOf(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase()
}

/**
 * The twin of SQL's `erp_sync_brand_code`: the brand whose code or name is
 * the word, case and surrounding spaces aside — else the brand that lists it
 * as a sub-brand. A brand's own code or name comes first, so a sub-brand never
 * takes a word another brand is called by. Null for a word no brand answers
 * to (MYLATEX). `brands` are the active ones, in the order the database reads
 * them — oldest first.
 */
export function brandCodeFor(name: string | null | undefined, brands: readonly BrandWords[]): string | null {
  const wanted = wordOf(name)
  if (!wanted) return null
  const own = brands.find(b => wordOf(b.code) === wanted || wordOf(b.name) === wanted)
  if (own) return own.code
  return brands.find(b => (b.subBrands ?? []).some(s => wordOf(s) === wanted))?.code ?? null
}

/**
 * What Rules › Brands keeps for a brand's sub-brands, from the box's text
 * ("HAPPI SLEEP, happi sleep kids"): each upper-cased, one space between
 * words, blanks and repeats dropped. Refused: a word that is this brand's own
 * code or name (it answers to that already), or another brand's code, name or
 * sub-brand — one word, one brand.
 */
export function parseSubBrands(
  input: string,
  self: { code: string; name: string },
  others: readonly BrandWords[],
): string[] {
  const out: string[] = []
  for (const raw of input.split(',')) {
    const word = raw.trim().replace(/\s+/g, ' ').toUpperCase()
    if (!word || out.includes(word)) continue
    if (word === wordOf(self.code) || word === wordOf(self.name)) {
      throw new Error(`${word} is this brand’s own code or name — no need to list it as a sub-brand`)
    }
    const taken = others.find(b =>
      wordOf(b.code) === word || wordOf(b.name) === word || (b.subBrands ?? []).some(s => wordOf(s) === word))
    if (taken) throw new Error(`${word} already names ${taken.name || taken.code} — one ERP branding, one brand`)
    out.push(word)
  }
  return out
}
