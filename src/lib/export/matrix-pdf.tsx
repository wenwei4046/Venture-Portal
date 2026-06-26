import { PdfDocument, PdfTable, type PdfColumn } from './pdf'
import type { MonthlyMatrixData } from '../monthly-matrix'

// Landscape PDF of a month-matrix report. RM values only (the % columns are
// dropped so the many month columns fit the page width); account rows are
// indented by depth, subtotals sit flush-left.
export function MatrixPdf({
  title,
  subtitle,
  periodLabel,
  data,
}: {
  title: string
  subtitle: string
  periodLabel: string
  data: MonthlyMatrixData
}) {
  // A4 landscape usable width ≈ 760pt. Item column fixed, value columns share
  // the rest (clamped so they stay readable for few months and fit for many).
  const itemW = 150
  const colW = Math.max(46, Math.min(92, Math.floor((760 - itemW) / Math.max(1, data.columns.length))))

  const columns: PdfColumn[] = [
    { label: 'Item', width: itemW, align: 'left' },
    ...data.columns.map((c) => ({ label: c.label, width: colW, align: 'right' as const })),
  ]
  const rows = data.rows.map((r) => [`${'  '.repeat(r.depth)}${r.label}`, ...r.values])

  return (
    <PdfDocument title={title} subtitle={subtitle} periodLabel={periodLabel} orientation="landscape">
      <PdfTable columns={columns} rows={rows} numberFormat="money" />
    </PdfDocument>
  )
}
