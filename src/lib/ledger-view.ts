import dayjs from 'dayjs'

// The General Ledger's shared rules (2026-10-09, the user's Claude Design
// handoff): how its period reads, which accounts count as having activity
// (the page and its Excel / PDF list the same ones), and the export link for
// whatever is picked.

/** "01 – 31 October 2026", "15 Sep – 09 Oct 2026", "01 Dec 2025 – 31 Jan 2026". */
export function ledgerPeriodLabel(from: string, to: string): string {
  const a = dayjs(from)
  const b = dayjs(to)
  if (a.year() === b.year() && a.month() === b.month()) return `${a.format('DD')} – ${b.format('DD MMMM YYYY')}`
  if (a.year() === b.year()) return `${a.format('DD MMM')} – ${b.format('DD MMM YYYY')}`
  return `${a.format('DD MMM YYYY')} – ${b.format('DD MMM YYYY')}`
}

/** A line beyond the balance brought forward (every ledger carries one), or a balance at either end. */
export function hasLedgerActivity(l: { lines: readonly unknown[]; openingBalance: number; closingBalance: number }): boolean {
  return l.lines.length > 1 || Math.abs(l.openingBalance) >= 0.005 || Math.abs(l.closingBalance) >= 0.005
}

/** The Dept column's names for the departments added since the five core ones
 *  (2026-10-10): the registry's extras (IT, Revenue Department) — they read as
 *  their segment keys ("it", "revenue_department") before. */
export function ledgerDeptNames(extras: ReadonlyArray<{ value: string; label: string }>): Record<string, string> {
  return Object.fromEntries(extras.map((s) => [s.value, s.label]))
}

export function ledgerExportHref(format: 'xlsx' | 'pdf', p: { codes: readonly string[]; from: string; to: string; showZero: boolean }): string {
  const qs = new URLSearchParams()
  qs.set('format', format)
  if (p.codes.length > 0) qs.set('codes', p.codes.join(','))
  qs.set('from', p.from)
  qs.set('to', p.to)
  if (p.showZero) qs.set('showZero', '1')
  return `/reports/ledger/export?${qs.toString()}`
}
