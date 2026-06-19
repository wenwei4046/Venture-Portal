// Shared xlsx/pdf export for the GL-driven statements (P&L / Balance Sheet /
// Cash Flow). Consumes the SAME ReportBlock structure the pages render, via
// flattenGlReport — screen and file can't drift apart.

import React from 'react'
import { buildXlsxBuffer } from './excel'
import { PdfDocument, PdfTable, type PdfColumn } from './pdf'
import { exportXlsxResponse, exportPdfResponse } from './response'
import { flattenGlReport, type ReportBlock } from '../gl-report-blocks'

export interface GlStatementExportArgs {
  format: 'xlsx' | 'pdf'
  /** Without extension. */
  filename: string
  title: string
  periodLabel: string
  currentLabel: string
  /** '' = single-month export (no compare / Δ% columns). */
  compareLabel: string
  blocks: ReportBlock[]
  /** Revenue base — adds the % Rev column (P&L only). */
  pctBase?: number
}

export function glStatementExportResponse(args: GlStatementExportArgs): Response | Promise<Response> {
  const withPct = args.pctBase !== undefined
  const withCompare = args.compareLabel !== ''
  const flat = flattenGlReport(args.blocks, { pctBase: args.pctBase, withCompare })
  const headerRow = [
    'Account',
    args.currentLabel,
    ...(withCompare ? [args.compareLabel, 'Δ%'] : []),
    ...(withPct ? ['% Rev'] : []),
  ]

  if (args.format === 'xlsx') {
    return exportXlsxResponse({
      filename: args.filename,
      buffer: buildXlsxBuffer({
        sheetName: args.title.slice(0, 31),
        headerRow,
        rows: flat.rows,
        sectionBreaks: flat.sectionBreaks,
        columnWidths: [52, 16, ...(withCompare ? [16, 9] : []), ...(withPct ? [9] : [])],
      }),
    })
  }

  // PDF: interleave the section titles into the flat rows (uppercase marker
  // rows — PdfTable has no per-row emphasis).
  const blank = Array<null>(headerRow.length - 1).fill(null)
  const rows: (string | number | null)[][] = []
  let nextBreak = 0
  const breaks = flat.sectionBreaks
  for (let i = 0; i <= flat.rows.length; i++) {
    while (nextBreak < breaks.length && breaks[nextBreak].afterRow === i) {
      rows.push([breaks[nextBreak].title.toUpperCase(), ...blank])
      nextBreak += 1
    }
    if (i < flat.rows.length) rows.push(flat.rows[i])
  }

  // A4 portrait usable width ≈ 520pt — distribute what the column set needs.
  const numCols = headerRow.length - 1
  const numWidth = numCols === 1 ? 120 : numCols === 2 ? 100 : numCols === 3 ? 85 : 70
  const columns: PdfColumn[] = [
    { label: 'Account', width: 520 - numCols * numWidth },
    ...headerRow.slice(1).map((label) => ({ label, width: numWidth, align: 'right' as const })),
  ]

  return exportPdfResponse({
    filename: args.filename,
    element: (
      <PdfDocument title={args.title} periodLabel={args.periodLabel}>
        <PdfTable columns={columns} rows={rows} numberFormat="money" />
      </PdfDocument>
    ),
  })
}
