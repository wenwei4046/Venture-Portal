// Bank Reconciliation Report export — xlsx + pdf from the SAME builder as the
// report page (lib/recon-report-data), so screen and file always agree.
//
// File labels are ENGLISH ONLY — the react-pdf base font has no CJK glyphs
// (established 2026-08-06 on the Company Statement exports).

import React from 'react'
import dayjs from 'dayjs'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchReconReport } from '@/lib/recon-report-data'
import type { ReconReportItem } from '@/lib/recon-report'
import { buildXlsxBuffer, type XlsxSectionBreak } from '@/lib/export/excel'
import { PdfDocument, PdfTable, type PdfColumn, type PdfRowKind } from '@/lib/export/pdf'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'

const money = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  await requirePermission('reconciliation')
  const { sessionId } = await params
  const supabase = (await createClient()) as unknown as SupabaseClient

  const report = await fetchReconReport(supabase, sessionId)
  if (!report) return new Response('Not found', { status: 404 })
  const m = report.model

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const monthEndLabel = dayjs(m.monthEnd).format('DD MMM YYYY')
  const walk: Array<{ label: string; amount: number | null; strong?: boolean }> = [
    { label: `Balance per bank statement (${monthEndLabel})`, amount: m.statementClosing },
    { label: `Add: outstanding receipts not yet banked (${m.outstandingReceipts.length})`, amount: m.sums.bookReceipts },
    { label: `Less: outstanding payments not yet presented (${m.outstandingPayments.length})`, amount: m.sums.bookPayments },
    { label: `Less: receipts in bank not in books (${m.stmtReceiptsNotInBooks.length})`, amount: -m.sums.stmtReceipts },
    { label: `Add: payments in bank not in books (${m.stmtPaymentsNotInBooks.length})`, amount: -m.sums.stmtPayments },
    { label: 'Adjusted balance', amount: m.adjustedBank, strong: true },
    { label: `Balance per GL ${report.glCode} (${monthEndLabel})`, amount: m.glClosing, strong: true },
  ]
  const tieLabel = m.tie
    ? 'RECONCILED - STATEMENT TIES TO GL'
    : m.diff == null
      ? 'NO STATEMENT CLOSING BALANCE ON THIS SESSION'
      : `NOT RECONCILED - OFF BY RM ${money(m.diff)}`

  const itemGroups: Array<{ title: string; items: ReconReportItem[] }> = [
    { title: 'OUTSTANDING PAYMENTS - IN BOOKS, NOT YET PRESENTED', items: m.outstandingPayments },
    { title: 'OUTSTANDING RECEIPTS - IN BOOKS, NOT YET BANKED', items: m.outstandingReceipts },
    { title: 'BANK PAYMENTS NOT IN BOOKS', items: m.stmtPaymentsNotInBooks },
    { title: 'BANK RECEIPTS NOT IN BOOKS', items: m.stmtReceiptsNotInBooks },
  ].filter(g => g.items.length > 0)

  const itemRow = (i: ReconReportItem): (string | number | null)[] => [
    null,
    dayjs(i.date).format('DD/MM/YYYY'),
    i.ref || '-',
    `${i.description || '-'}${i.ignored ? ' (ignored)' : ''}`,
    i.amount,
  ]

  const monthSlug = dayjs(report.periodMonth).format('YYYY-MM')
  const bankSlug = report.bankName.replace(/[^\w-]+/g, '_')
  const filename = `recon-${bankSlug}-${monthSlug}`

  if (format === 'xlsx') {
    const rows: (string | number | null)[][] = []
    const sectionBreaks: XlsxSectionBreak[] = []
    sectionBreaks.push({ afterRow: 0, title: 'RECONCILIATION STATEMENT' })
    for (const w of walk) rows.push([w.label, null, null, null, w.amount])
    rows.push([tieLabel, null, null, null, m.diff == null ? null : m.diff])
    for (const g of itemGroups) {
      sectionBreaks.push({ afterRow: rows.length, title: `${g.title} (${g.items.length})` })
      for (const i of g.items) rows.push(itemRow(i))
    }
    return exportXlsxResponse({
      filename,
      buffer: buildXlsxBuffer({
        sheetName: `Recon ${monthSlug}`,
        headerRow: ['', 'Date', 'Entry', 'Description', 'Amount (RM)'],
        rows,
        sectionBreaks,
        columnWidths: [48, 12, 18, 46, 14],
      }),
    })
  }

  // PDF — portrait A4 (usable ≈ 515pt): the statement walk as a two-column
  // table, then one items table with section bands.
  const walkColumns: PdfColumn[] = [
    { label: 'Reconciliation statement', width: 395 },
    { label: 'Amount (RM)', width: 120, align: 'right' },
  ]
  const walkRows: (string | number | null)[][] = walk.map(w => [w.label, w.amount])
  walkRows.push([tieLabel, m.diff == null ? null : m.diff])
  const walkKinds: PdfRowKind[] = walk.map(w => (w.strong ? 'total' : 'detail'))
  walkKinds.push(m.tie ? 'sectionPositive' : 'sectionWarning')

  const itemColumns: PdfColumn[] = [
    { label: '', width: 8 },
    { label: 'Date', width: 62 },
    { label: 'Entry', width: 95 },
    { label: 'Description', width: 240 },
    { label: 'Amount (RM)', width: 110, align: 'right' },
  ]
  const itemRows: (string | number | null)[][] = []
  const itemKinds: PdfRowKind[] = []
  for (const g of itemGroups) {
    itemRows.push([`${g.title} (${g.items.length})`, null, null, null, null])
    itemKinds.push('section')
    for (const i of g.items) {
      itemRows.push(itemRow(i))
      itemKinds.push('detail')
    }
  }

  return exportPdfResponse({
    filename,
    element: (
      <PdfDocument
        title="Bank Reconciliation Report"
        subtitle={`${report.bankName}${report.accountNumber ? ` · ${report.accountNumber}` : ''} · GL ${report.glCode} · status ${report.status}`}
        periodLabel={dayjs(report.periodMonth).format('MMMM YYYY')}
      >
        <PdfTable columns={walkColumns} rows={walkRows} numberFormat="money" rowKinds={walkKinds} />
        {itemRows.length > 0 ? (
          <PdfTable columns={itemColumns} rows={itemRows} numberFormat="money" rowKinds={itemKinds} repeatHeader />
        ) : null}
      </PdfDocument>
    ),
  })
}
