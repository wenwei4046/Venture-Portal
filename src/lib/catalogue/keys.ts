/**
 * The keys two spellings of one value share — the TypeScript twins of
 * `catalogue_height_key`, `catalogue_value_key` and `catalogue_code_key`
 * (migrations 20260924020000 / 030000). The calculator and the run must fold
 * the same spellings together or a quote and a payslip disagree about a seat
 * height, so each of these is pinned by a test against the SQL's own examples.
 */

/**
 * A seat height is written `30`, `25"`, `75cm`, `75CM`: the inch mark (straight
 * or curly), quotes, case and spaces are dropped. `DEFAULT` and `STD` stay two
 * different words — nothing says they are the same size.
 */
export function heightKey(h: string | null | undefined): string | null {
  const k = (h ?? '').replace(/["”“'\s]/g, '').toLowerCase()
  return k === '' ? null : k
}

/**
 * An option value as the ERP's summary prints it (`LEG DEFAULT`, `NO LEG`,
 * `DIVAN 10”`) against the Maintenance pool's own spelling (`Default`,
 * `No Leg`, `10"`): curly inch marks straightened, runs of space folded, case
 * ignored.
 */
export function valueKey(v: string | null | undefined): string | null {
  const k = (v ?? '').trim().replace(/[”“]/g, '"').replace(/\s+/g, ' ').toLowerCase()
  return k === '' ? null : k
}

/** A product code: case, surrounding space and runs of space folded. Nothing else. */
export function codeKey(c: string | null | undefined): string {
  return (c ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Seat heights sort numerically (22, 24 … 35, then 60cm, 75cm), words last. */
export function compareHeights(a: string, b: string): number {
  const x = parseFloat(a)
  const y = parseFloat(b)
  const xf = Number.isFinite(x)
  const yf = Number.isFinite(y)
  if (xf && yf && x !== y) return x - y
  if (xf !== yf) return xf ? -1 : 1
  return a.localeCompare(b)
}
