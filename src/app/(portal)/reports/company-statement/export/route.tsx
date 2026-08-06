// Company Statement export — xlsx + pdf, bank-statement layout: one section
// per counterparty (title carries the net), position rows beneath, grand
// totals at the end. Data comes from the SAME builder as the page
// (lib/counterparty-statement-data) so screen and file always agree.

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
    item.kind === 'compound' ? '利滚利' : item.kind === 'no_term' ? '无固定期' : `${item.tenureMonths}期`
  const bits = [
    item.side === 'collect' ? '要收' : '要还',
    `${(item.monthlyRate * 100).toFixed(3)}%/mo`,
    kind,
  ]
  if (item.startYM) bits.push(`${item.startYM} 起`)
  if (item.source) bits.push(`SC ${item.source}`)
  return bits.join(' · ')
}

function payoffLabel(item: PositionRow): string {
  if (item.kind === 'no_term') return `未定 · ~RM ${money(item.monthlyInterest)}/月息`
  if (item.kind === 'compound') return '未定 · 利息逐月滚入'
  return `剩 ${item.remainingPeriods} 期${item.finishYM ? ` · ${item.finishYM}` : ''}`
}

export async function GET(request: Request) {
  await requireRole(['finance', 'principal'])
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { rows: cpRows, totals } = await fetchCounterpartyStatement(supabase)

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  // Flatten: section per counterparty, then grand totals.
  const headerRow = ['Position', '原额', '已还本金', '未还本金', '利息', '几时还完']
  const rows: (string | number | null)[][] = []
  const sectionBreaks: XlsxSectionBreak[] = []
  for (const g of cpRows) {
    sectionBreaks.push({
      afterRow: rows.length,
      title: `${g.counterparty} · 净${g.net >= 0 ? '收' : '还'} RM ${money(Math.abs(g.net))}`,
    })
    for (const item of g.items) {
      rows.push([
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
  rows.push(['合计 · 我还要收', null, null, totals.collectPrincipal, totals.collectInterest, null])
  rows.push(['合计 · 我还要还', null, null, totals.repayPrincipal, totals.repayInterest, null])
  rows.push([
    `净额 · ${totals.net >= 0 ? '收' : '还'}`,
    null,
    null,
    Math.abs(totals.net),
    null,
    null,
  ])

  const filename = `company-statement-${dayjs().format('YYYYMMDD')}`

  if (format === 'xlsx') {
    return exportXlsxResponse({
      filename,
      buffer: buildXlsxBuffer({
        sheetName: 'Company Statement',
        headerRow,
        rows,
        sectionBreaks,
        columnWidths: [44, 14, 14, 14, 14, 24],
      }),
    })
  }

  // PDF: interleave uppercase section markers into the flat rows (same
  // pattern as the GL statement export).
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

  const columns: PdfColumn[] = [
    { label: 'Position', width: 175 },
    { label: '原额', width: 70, align: 'right' },
    { label: '已还本金', width: 70, align: 'right' },
    { label: '未还本金', width: 70, align: 'right' },
    { label: '利息', width: 60, align: 'right' },
    { label: '几时还完', width: 75, align: 'right' },
  ]

  return exportPdfResponse({
    filename,
    element: (
      <PdfDocument
        title="Company Statement"
        periodLabel={`As at ${dayjs().format('D MMM YYYY')}`}
      >
        <PdfTable columns={columns} rows={pdfRows} numberFormat="money" />
      </PdfDocument>
    ),
  })
}
