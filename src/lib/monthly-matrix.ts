// Shared building blocks for the month-matrix reports (Monthly P&L / Cash Flow):
// the row/column types the view renders, plus helpers to lay out the columns
// (Accumulated + each month, latest-first) and flatten a report section's tree.

import dayjs from 'dayjs'
import type { ReportSection, AccountNode } from './gl-reports'

export interface MatrixColumn {
  key: string // 'acc' | 'YYYY-MM'
  label: string // 'Accumulated' | 'Jan 2026'
}

export interface MatrixRow {
  key: string // account code, or subtotal id
  label: string
  depth: number // indent level (0 = top)
  kind: 'account' | 'subtotal'
  /** true when this account rolls up child accounts under it. */
  isParent?: boolean
  tone?: 'ledger' | 'danger' | 'auto'
  /** display values aligned to columns. */
  values: number[]
}

export interface MonthlyMatrixData {
  columns: MatrixColumn[]
  rows: MatrixRow[]
}

export function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// An empty range so the report engines' unused `previous` bucket is always 0.
export const EMPTY_PERIOD = { from: '2099-12-31', to: '2099-01-01' }

/** Columns = Accumulated + each month of the year up to `throughMonth`,
 *  latest month first (next to Accumulated). */
export function monthColumns(
  year: number,
  throughMonth: number,
): { months: string[]; columns: MatrixColumn[]; accPeriod: { from: string; to: string } } {
  const tm = Math.min(12, Math.max(1, throughMonth))
  const months: string[] = []
  for (let m = tm; m >= 1; m--) months.push(`${year}-${String(m).padStart(2, '0')}`)
  const accPeriod = {
    from: `${year}-01-01`,
    to: dayjs(`${year}-${String(tm).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD'),
  }
  const columns: MatrixColumn[] = [
    { key: 'acc', label: 'Accumulated' },
    ...months.map((ym) => ({ key: ym, label: dayjs(`${ym}-01`).format('MMM YYYY') })),
  ]
  return { months, columns, accPeriod }
}

/** account_code → its `current` value, walking the whole node tree. */
export function collectNodeValues(section: ReportSection, out: Map<string, number>): void {
  const walk = (n: AccountNode) => {
    out.set(n.code, n.current)
    n.children.forEach(walk)
  }
  section.nodes.forEach(walk)
}
