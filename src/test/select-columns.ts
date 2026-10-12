// What a select gives back (2026-10-12). PostgREST answers only the columns a
// select names, so a fake that hands back whole rows cannot see a column left
// out of one; `projected` cuts the fake's rows to the select's columns.

/** The columns a select names; null for '*' or an embed, which the fake answers whole. */
export function selectedColumns(columns?: string): string[] | null {
  if (!columns || /[*(:]/.test(columns)) return null
  return columns.split(',').map((c) => c.trim()).filter(Boolean)
}

export function projected<T extends Record<string, unknown>>(rows: readonly T[], columns: string[] | null): T[] {
  if (!columns) return [...rows]
  return rows.map((r) => Object.fromEntries(columns.filter((c) => c in r).map((c) => [c, r[c]])) as T)
}
