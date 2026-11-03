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
import { officeTime } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { fetchCounterpartyStatement } from '@/lib/counterparty-statement-data'
import { monthShort } from '@/lib/min-pay'
import type { PositionRow } from '@/lib/counterparty-statement'
import { buildXlsxBuffer, type XlsxSectionBreak } from '@/lib/export/excel'
import { PdfDocument, PdfTable, type PdfColumn, type PdfRowKind } from '@/lib/export/pdf'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'

const money = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Compact one-line labels (user 2026-08-06: rows must not wrap — "尽量弄成同
// 一排"): the side word lives on the TO COLLECT / TO REPAY section rows, the
// rate drops trailing zeros, and long lent-to notes are capped.
function positionLabel(item: PositionRow): string {
  const kind =
    item.kind === 'compound'
      ? 'compounding'
      : item.kind === 'no_term'
        ? 'no fixed term'
        : `${item.tenureMonths}mo`
  const bits = [`${parseFloat((item.monthlyRate * 100).toFixed(3))}%/mo`, kind]
  if (item.startYM) bits.push(`starts ${item.startYM}`)
  // 最低还息单 — the agreed monthly-interest floor travels on the export too.
  if (item.minPayInterest) bits.push(`min interest ${money(item.monthlyInterest)}/mo${item.minPayFrom ? ` from ${monthShort(item.minPayFrom.slice(0, 7))}` : ''}`)
  // collect: SC = funding source remark; repay: where the money was lent on.
  if (item.source) {
    const src = item.source.length > 24 ? `${item.source.slice(0, 24)}…` : item.source
    bits.push(item.side === 'collect' ? `SC ${src}` : `lent to ${src}`)
  }
  return bits.join(' · ')
}

function payoffLabel(item: PositionRow): string {
  if (item.kind === 'no_term') return `TBD · ~${money(item.monthlyInterest)}/mo`
  if (item.kind === 'compound') return 'TBD · compounding'
  return `${item.remainingPeriods} left${item.finishYM ? ` · by ${item.finishYM}` : ''}`
}

export async function GET(request: Request) {
  await requireActionOn('/reports/company-statement', 'reports', 'export')
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

  // Flatten: per counterparty a NET header, then a TO COLLECT part and a
  // TO REPAY part (user 2026-08-06: "export 出来也需要分collect part 和repay
  // part"), then grand totals.
  const headerRow = ['From', 'Position', 'Original', 'Paid', 'Outstanding', 'Interest', 'Payoff']
  const rows: (string | number | null)[][] = []
  // Local breaks carry a PDF row kind (counterparty band vs green TO COLLECT
  // vs amber TO REPAY); xlsx consumes just {afterRow, title}.
  const sectionBreaks: Array<XlsxSectionBreak & { kind: PdfRowKind }> = []
  const positionRow = (g: (typeof cpRows)[number], item: PositionRow): (string | number | null)[] => [
    g.counterparty,
    positionLabel(item),
    item.principal,
    item.principalPaid,
    item.principalOutstanding,
    item.kind === 'no_term' ? null : item.interestOutstanding,
    payoffLabel(item),
  ]
  for (const g of cpRows) {
    sectionBreaks.push({
      afterRow: rows.length,
      title: `${g.counterparty} · NET ${g.net >= 0 ? 'COLLECT' : 'REPAY'} RM ${money(Math.abs(g.net))}`,
      kind: 'section',
    })
    const collect = g.items.filter(i => i.side === 'collect')
    const repay = g.items.filter(i => i.side === 'repay')
    if (collect.length > 0) {
      sectionBreaks.push({
        afterRow: rows.length,
        title: `TO COLLECT (${collect.length})`,
        kind: 'sectionPositive',
      })
      for (const item of collect) rows.push(positionRow(g, item))
    }
    if (repay.length > 0) {
      sectionBreaks.push({
        afterRow: rows.length,
        title: `TO REPAY (${repay.length})`,
        kind: 'sectionWarning',
      })
      for (const item of repay) rows.push(positionRow(g, item))
    }
  }
  sectionBreaks.push({ afterRow: rows.length, title: 'TOTAL', kind: 'section' })
  const totalRows: (string | number | null)[][] = [
    ['', 'TOTAL · TO COLLECT', null, null, totals.collectPrincipal, totals.collectInterest, null],
    ['', 'TOTAL · TO REPAY', null, null, totals.repayPrincipal, totals.repayInterest, null],
    ['', `NET · ${totals.net >= 0 ? 'TO COLLECT' : 'TO REPAY'}`, null, null, Math.abs(totals.net), null, null],
  ]
  rows.push(...totalRows)

  const single = wanted && wanted.size === 1 ? [...wanted][0].replace(/[^\w-]+/g, '_') : null
  const filename = `company-statement-${single ? `${single}-` : ''}${officeTime().format('YYYYMMDD')}`

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

  // PDF: section titles become shaded 'group' rows, positions are plain
  // white 'detail' rows (no zebra — user 2026-08-06: "detail background 不要
  // 灰白灰白"), totals get the heavy 'total' band.
  const blank = Array<null>(headerRow.length - 1).fill(null)
  const pdfRows: (string | number | null)[][] = []
  const rowKinds: PdfRowKind[] = []
  let nextBreak = 0
  for (let i = 0; i <= rows.length; i++) {
    while (nextBreak < sectionBreaks.length && sectionBreaks[nextBreak].afterRow === i) {
      pdfRows.push([sectionBreaks[nextBreak].title, ...blank])
      rowKinds.push(sectionBreaks[nextBreak].kind)
      nextBreak += 1
    }
    if (i < rows.length) {
      pdfRows.push(rows[i])
      rowKinds.push(i >= rows.length - totalRows.length ? 'total' : 'detail')
    }
  }

  // A4 landscape usable ≈ 760pt.
  const columns: PdfColumn[] = [
    { label: 'From', width: 70 },
    { label: 'Position', width: 250 },
    { label: 'Original', width: 80, align: 'right' },
    { label: 'Paid', width: 75, align: 'right' },
    { label: 'Outstanding', width: 85, align: 'right' },
    { label: 'Interest', width: 75, align: 'right' },
    { label: 'Payoff', width: 115, align: 'right' },
  ]

  return exportPdfResponse({
    filename,
    element: (
      <PdfDocument
        title="Company Statement"
        periodLabel={`As at ${officeTime().format('D MMM YYYY')}`}
        orientation="landscape"
      >
        <PdfTable columns={columns} rows={pdfRows} numberFormat="money" rowKinds={rowKinds} repeatHeader />
      </PdfDocument>
    ),
  })
}
