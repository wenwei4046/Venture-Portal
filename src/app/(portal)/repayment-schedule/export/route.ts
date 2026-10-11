import dayjs from 'dayjs'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { buildXlsxBuffer } from '@/lib/export/excel'
import { exportXlsxResponse } from '@/lib/export/response'
import { loadRepaymentSchedule } from '../_lib/schedule-data'
import { DUE_TYPE_LABEL, dueRows, dueTotals, type DueRow } from '../_components/due-rows'

// The Repayment Schedule's Export (2026-10-10, the user's Claude Design
// handoff; user: 做完他): the month's two due tables as one spreadsheet — "Due
// to collect", then "Due to pay" — each row as the page shows it, short in
// brackets ("clear" when nothing is), each side closed by its Total. Gated as
// every treasury export is, Treasury · Export — and Treasury · View, which the
// deals' terms history opens to (treasury_terms_history: view, not export).

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

export async function GET(req: Request): Promise<Response> {
  await requireActionOn('/repayment-schedule', 'treasury', 'view')
  await requireActionOn('/repayment-schedule', 'treasury', 'export')
  const supabase = await createClient()
  const s = await loadRepaymentSchedule(supabase, new URL(req.url).searchParams.get('month'))

  const collect = dueRows({ rows: s.collectRows, min: s.collectMin, compound: s.collectCompound, noTerm: s.collectNoTerm })
  const pay = dueRows({ rows: s.repayRows, min: s.repayMin, compound: s.repayCompound, noTerm: s.repayNoTerm })
  const month = dayjs(`${s.currentYM}-01`)
  const collectPart = [...collect.map(row), total(collect)]

  return exportXlsxResponse({
    filename: `repayment-schedule-${s.currentYM}`,
    buffer: buildXlsxBuffer({
      sheetName: 'Repayment Schedule',
      headerRow: ['Counterparty', 'Terms', 'Type', 'Principal', 'Interest', 'Total due', `Received / paid · ${month.format('MMM')}`, 'Short', 'Note'],
      rows: [...collectPart, ...pay.map(row), total(pay)],
      sectionBreaks: [
        { afterRow: 0, title: `Due to collect · ${month.format('MMMM YYYY')}` },
        { afterRow: collectPart.length, title: `Due to pay · ${month.format('MMMM YYYY')}` },
      ],
      columnWidths: [24, 48, 20, 14, 14, 14, 18, 14, 32],
    }),
  })
}
