// Company Statement export — xlsx + pdf, bank-statement layout: one section
// per counterparty (title carries the net), position rows beneath, grand
// totals at the end. Data comes from the SAME builder as the page
// (lib/counterparty-statement-data) so screen and file always agree.
//
// File labels are ENGLISH ONLY — the react-pdf base font has no CJK glyphs,
// so Chinese labels rendered as mojibake (user 2026-08-06: "导出的pdf 会乱").
// Every row also carries a From column so positions stay identifiable across
// page breaks (user: "这里没有显示from").
//
// ?cp=HC,2990 exports only those counterparties (user: "自己选择要导出的") —
// names must match the statement's labels exactly.

import React from 'react'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchCounterpartyStatement } from '@/lib/counterparty-statement-data'
import type { PositionRow } from '@/lib/counterparty-statement'
import { buildXlsxBuffer, type XlsxSectionBreak } from '@/lib/export/excel'
import { PdfDocument, PdfTable, type PdfColumn } from '@/lib/export/pdf'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'

const money = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function positionLabel(item: PositionRow): string {
  const kind =
    item.kind === 'compound'
      ? 'compounding'
      : item.kind === 'no_term'
        ? 'no fixed term'
        : `${item.tenureMonths}mo`
  const bits = [
    item.side === 'collect' ? 'Collect' : 'Repay',
    `${(item.monthlyRate * 100).toFixed(3)}%/mo`,
    kind,
  ]
  if (item.startYM) bits.push(`starts ${item.startYM}`)
  // collect: SC = funding source remark; repay: where the money was lent on.
  if (item.source) bits.push(item.side === 'collect' ? `SC ${item.source}` : `lent to ${item.source}`)
  return bits.join(' · ')
}

function payoffLabel(item: PositionRow): string {
  if (item.kind === 'no_term') return `TBD · ~RM ${money(item.monthlyInterest)}/mo interest`
  if (item.kind === 'compound') return 'TBD · compounds monthly'
  return `${item.remainingPeriods} left${item.finishYM ? ` · by ${item.finishYM}` : ''}`
}

export async function GET(request: Request) {
  await requireRole(['finance', 'principal'])
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { rows: allRows } = await fetchCounterpartyStatement(supabase)

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const cpParam = (url.searchParams.get('cp') ?? '').trim()
  const wanted = cpParam
    ? new Set(cpParam.split(',').map(s => s.trim()).filter(Boolean))
    : null
  const cpRows = wanted ? allRows.filter(g => wanted.has(g.counterparty)) : allRows

  // Totals over what's actually in the file (matters when ?cp filters).
  const totals = cpRows.reduce(
    (acc, g) => ({
      collectPrincipal: acc.collectPrincipal + g.collectPrincipal,
      collectInterest: acc.collectInterest + g.collectInterest,
      repayPrincipal: acc.repayPrincipal + g.repayPrincipal,
      repayInterest: acc.repayInterest + g.repayInterest,
      net: acc.net + g.net,
    }),
    { collectPrincipal: 0, collectInterest: 0, repayPrincipal: 0, repayInterest: 0, net: 0 },
  )

  // Flatten: section per counterparty, then grand totals.
  const headerRow = ['From', 'Position', 'Original', 'Paid', 'Outstanding', 'Interest', 'Payoff']
  const rows: (string | number | null)[][] = []
  const sectionBreaks: XlsxSectionBreak[] = []
  for (const g of cpRows) {
    sectionBreaks.push({
      afterRow: rows.length,
      title: `${g.counterparty} · NET ${g.net >= 0 ? 'COLLECT' : 'REPAY'} RM ${money(Math.abs(g.net))}`,
    })
    for (const item of g.items) {
      rows.push([
        g.counterparty,
        positionLabel(item),
        item.principal,
        item.principalPaid,
        item.principalOutstanding,
        item.kind === 'no_term' ? null : item.interestOutstanding,
        payoffLabel(item),
      ])
    }
  }
  sectionBreaks.push({ afterRow: rows.length, title: 'TOTAL' })
  rows.push(['', 'TOTAL · TO COLLECT', null, null, totals.collectPrincipal, totals.collectInterest, null])
  rows.push(['', 'TOTAL · TO REPAY', null, null, totals.repayPrincipal, totals.repayInterest, null])
  rows.push([
    '',
    `NET · ${totals.net >= 0 ? 'TO COLLECT' : 'TO REPAY'}`,
    null,
    null,
    Math.abs(totals.net),
    null,
    null,
  ])

  const single = wanted && wanted.size === 1 ? [...wanted][0].replace(/[^\w-]+/g, '_') : null
  const filename = `company-statement-${single ? `${single}-` : ''}${dayjs().format('YYYYMMDD')}`

  if (format === 'xlsx') {
    return exportXlsxResponse({
      filename,
      buffer: buildXlsxBuffer({
        sheetName: 'Company Statement',
        headerRow,
        rows,
        sectionBreaks,
        columnWidths: [14, 42, 14, 14, 14, 12, 24],
      }),
    })
  }

  // PDF: interleave uppercase section markers into the flat rows (same
  // pattern as the GL statement export). Landscape — seven columns.
  const blank = Array<null>(headerRow.length - 1).fill(null)
  const pdfRows: (string | number | null)[][] = []
  let nextBreak = 0
  for (let i = 0; i <= rows.length; i++) {
    while (nextBreak < sectionBreaks.length && sectionBreaks[nextBreak].afterRow === i) {
      pdfRows.push([sectionBreaks[nextBreak].title, ...blank])
      nextBreak += 1
    }
    if (i < rows.length) pdfRows.push(rows[i])
  }

  // A4 landscape usable ≈ 760pt.
  const columns: PdfColumn[] = [
    { label: 'From', width: 75 },
    { label: 'Position', width: 220 },
    { label: 'Original', width: 85, align: 'right' },
    { label: 'Paid', width: 85, align: 'right' },
    { label: 'Outstanding', width: 85, align: 'right' },
    { label: 'Interest', width: 75, align: 'right' },
    { label: 'Payoff', width: 130, align: 'right' },
  ]

  return exportPdfResponse({
    filename,
    element: (
      <PdfDocument
        title="Company Statement"
        periodLabel={`As at ${dayjs().format('D MMM YYYY')}`}
        orientation="landscape"
      >
        <PdfTable columns={columns} rows={pdfRows} numberFormat="money" />
      </PdfDocument>
    ),
  })
}
