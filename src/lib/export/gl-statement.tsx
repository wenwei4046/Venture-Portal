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
  compareLabel: string
  blocks: ReportBlock[]
  /** Revenue base — adds the % Rev column (P&L only). */
  pctBase?: number
}

export function glStatementExportResponse(args: GlStatementExportArgs): Response | Promise<Response> {
  const withPct = args.pctBase !== undefined
  const flat = flattenGlReport(args.blocks, { pctBase: args.pctBase })
  const headerRow = [
    'Account',
    args.currentLabel,
    args.compareLabel,
    'Δ%',
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
        columnWidths: [52, 16, 16, 9, ...(withPct ? [9] : [])],
      }),
    })
  }

  // PDF: interleave the section titles into the flat rows (uppercase marker
  // rows — PdfTable has no per-row emphasis).
  const rows: (string | number | null)[][] = []
  let nextBreak = 0
  const breaks = flat.sectionBreaks
  for (let i = 0; i <= flat.rows.length; i++) {
    while (nextBreak < breaks.length && breaks[nextBreak].afterRow === i) {
      rows.push([breaks[nextBreak].title.toUpperCase(), null, null, null, ...(withPct ? [null] : [])])
      nextBreak += 1
    }
    if (i < flat.rows.length) rows.push(flat.rows[i])
  }

  const columns: PdfColumn[] = withPct
    ? [
        { label: 'Account', width: 240 },
        { label: args.currentLabel, width: 85, align: 'right' },
        { label: args.compareLabel, width: 85, align: 'right' },
        { label: 'Δ%', width: 55, align: 'right' },
        { label: '% Rev', width: 55, align: 'right' },
      ]
    : [
        { label: 'Account', width: 260, },
        { label: args.currentLabel, width: 95, align: 'right' },
        { label: args.compareLabel, width: 95, align: 'right' },
        { label: 'Δ%', width: 70, align: 'right' },
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
