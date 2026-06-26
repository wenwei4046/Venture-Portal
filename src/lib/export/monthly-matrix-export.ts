// Shared CSV / Excel exporters for the month-matrix reports. Flattens the
// rows × columns matrix into a single header row + data rows, with optional
// per-column % sub-columns (P&L). Excel reuses buildXlsxBuffer.

import { buildXlsxBuffer } from './excel'
import type { MonthlyMatrixData } from '../monthly-matrix'

function flatten(
  data: MonthlyMatrixData,
  pctBaseByColumn?: number[],
): { headerRow: string[]; rows: (string | number | null)[][] } {
  const showPct = Array.isArray(pctBaseByColumn)

  const headerRow: string[] = ['Item']
  for (const c of data.columns) {
    headerRow.push(c.label)
    if (showPct) headerRow.push(`${c.label} %`)
  }

  const rows = data.rows.map((r) => {
    const cells: (string | number | null)[] = [`${'  '.repeat(r.depth)}${r.label}`]
    data.columns.forEach((_, i) => {
      const v = r.values[i] ?? 0
      cells.push(v)
      if (showPct) {
        const base = pctBaseByColumn![i] ?? 0
        cells.push(Math.abs(base) < 0.005 ? null : Number(((v / base) * 100).toFixed(1)))
      }
    })
    return cells
  })

  return { headerRow, rows }
}

export function buildMatrixXlsx(
  sheetName: string,
  data: MonthlyMatrixData,
  pctBaseByColumn?: number[],
): Buffer {
  const { headerRow, rows } = flatten(data, pctBaseByColumn)
  const widths = headerRow.map((_, i) => (i === 0 ? 34 : 14))
  return buildXlsxBuffer({ sheetName, headerRow, rows, columnWidths: widths })
}

export function buildMatrixCsv(data: MonthlyMatrixData, pctBaseByColumn?: number[]): string {
  const { headerRow, rows } = flatten(data, pctBaseByColumn)
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headerRow, ...rows].map((r) => r.map(esc).join(',')).join('\n')
}
