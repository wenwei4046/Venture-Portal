import dayjs from 'dayjs'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { buildXlsxBuffer } from '@/lib/export/excel'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { PdfDocument, PdfTable, type PdfColumn, type PdfRowKind } from '@/lib/export/pdf'
import { loadRepaymentSchedule } from '../_lib/schedule-data'
import { DUE_TYPE_LABEL, dueRows, dueTotals, type DueRow } from '../_components/due-rows'

// The Repayment Schedule's Export (2026-10-10, the user's Claude Design
// handoff; user: 做完他): the month's two due tables as one spreadsheet — "Due
// to collect", then "Due to pay" — each row as the page shows it, short in
// brackets ("clear" when nothing is), each side closed by its Total. Gated as
// every treasury export is, Treasury · Export — and Treasury · View, which the
// deals' terms history opens to (treasury_terms_history: view, not export).
// 2026-11-02 (the user: "没有办法export pdf？" → "一个export 就行"): `?format=pdf`
// is the same two tables as a PDF to print — each side under its band, closed
// by its Total, on an A4 landscape page; anything else is the spreadsheet.

export const dynamic = 'force-dynamic'

type Cell = string | number | null

function row(r: DueRow): Cell[] {
  const note = [r.pending ? 'Repayment PV awaiting approval' : null, r.source ? `Source of capital: ${r.source}` : null].filter(Boolean).join(' · ')
  return [
    r.counterparty,
    r.detail,
    DUE_TYPE_LABEL[r.type],
    r.principal,
    r.interest,
    r.total,
    r.received,
    r.short == null ? null : r.short >= 0.005 ? -r.short : 'clear',
    note || null,
  ]
}

function total(rows: DueRow[]): Cell[] {
  const t = dueTotals(rows)
  return ['Total', `${rows.length} ${rows.length === 1 ? 'item' : 'items'}`, null, t.principal, t.interest, t.total, t.received, t.short >= 0.005 ? -t.short : 0, null]
}

// The PDF's columns, the spreadsheet's, across an A4 landscape page (770pt between its margins).
const pdfColumns = (receivedLabel: string): PdfColumn[] => [
  { label: 'Counterparty', width: 88 },
  { label: 'Terms', width: 202 },
  { label: 'Type', width: 80 },
  { label: 'Principal', width: 60, align: 'right' },
  { label: 'Interest', width: 60, align: 'right' },
  { label: 'Total due', width: 64, align: 'right' },
  { label: receivedLabel, width: 66, align: 'right' },
  { label: 'Short', width: 62, align: 'right' },
  { label: 'Note', width: 86 },
]

export async function GET(req: Request): Promise<Response> {
  await requireActionOn('/repayment-schedule', 'treasury', 'view')
  await requireActionOn('/repayment-schedule', 'treasury', 'export')
  const supabase = await createClient()
  const params = new URL(req.url).searchParams
  const s = await loadRepaymentSchedule(supabase, params.get('month'))

  const collect = dueRows({ rows: s.collectRows, min: s.collectMin, compound: s.collectCompound, noTerm: s.collectNoTerm })
  const pay = dueRows({ rows: s.repayRows, min: s.repayMin, compound: s.repayCompound, noTerm: s.repayNoTerm })
  const month = dayjs(`${s.currentYM}-01`)
  const collectPart = [...collect.map(row), total(collect)]
  const filename = `repayment-schedule-${s.currentYM}`
  const received = `Received / paid · ${month.format('MMM')}`

  if (params.get('format') === 'pdf') {
    const side = (title: string, band: PdfRowKind, rows: DueRow[]) => ({
      cells: [[title], ...rows.map(row), total(rows)] as Cell[][],
      kinds: [band, ...rows.map((): PdfRowKind => 'detail'), 'total'] as PdfRowKind[],
    })
    const a = side(`Due to collect · ${month.format('MMMM YYYY')}`, 'sectionPositive', collect)
    const b = side(`Due to pay · ${month.format('MMMM YYYY')}`, 'sectionWarning', pay)
    return exportPdfResponse({
      filename,
      element: (
        <PdfDocument title="Repayment Schedule" subtitle="Due to collect (Fund OUT) and due to pay (Fund IN) · RM" periodLabel={month.format('MMMM YYYY')} orientation="landscape">
          <PdfTable columns={pdfColumns(received)} rows={[...a.cells, ...b.cells]} rowKinds={[...a.kinds, ...b.kinds]} numberFormat="money" repeatHeader />
        </PdfDocument>
      ),
    })
  }

  return exportXlsxResponse({
    filename,
    buffer: buildXlsxBuffer({
      sheetName: 'Repayment Schedule',
      headerRow: ['Counterparty', 'Terms', 'Type', 'Principal', 'Interest', 'Total due', received, 'Short', 'Note'],
      rows: [...collectPart, ...pay.map(row), total(pay)],
      sectionBreaks: [
        { afterRow: 0, title: `Due to collect · ${month.format('MMMM YYYY')}` },
        { afterRow: collectPart.length, title: `Due to pay · ${month.format('MMMM YYYY')}` },
      ],
      columnWidths: [24, 48, 20, 14, 14, 14, 18, 14, 32],
    }),
  })
}
