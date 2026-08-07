// Loan Monitor export — two separate documents (user 2026-07-24: "aging 是
// aging, outstanding balance 是 outstanding balance"), styled like the Debtor
// Aging export (white body, dark group/total rows) via PdfDocument/PdfTable.
//   ?view=aging       — unpaid installments bucketed by months late
//   ?view=outstanding — balances, scheduled (定好日期) vs undecided (未定)
// Sides are NEVER summed together (receivables vs payables).

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoneyBare } from '@/lib/utils'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildXlsxBuffer } from '@/lib/export/excel'
import { PdfDocument, PdfTable, type PdfRowKind } from '@/lib/export/pdf'
import { fetchLoanMonitorData, type MonitorSide, type DueRow, type OutstandingRow } from '@/lib/loan-monitor'

export const dynamic = 'force-dynamic'

const m = (v: number) => (v ? formatMoneyBare(v) : '—')

// The PDF kit's font has no CJK glyphs and long labels wrap — exports use
// compact labels. lib/loan-monitor is English-only since 2026-08-06, so this
// just shortens.
const compact = (s: string) =>
  s
    .replace(/^RM /, '')
    .replace('.00 @', ' @')
    .replace('%/mo', '%')

const startEn = (s: string) => (s === 'TBD' ? '—' : s.replace(/^starts /, ''))

// SC gets its own column (user 2026-07-24: "SC 可以弄成类似标记") — a PDF
// table can't render the web chip, a dedicated column is the print equivalent.
const dueLabel = (d: DueRow) => `${d.counterparty} — ${compact(d.detail)}`
const outLabel = (o: OutstandingRow) => `${o.counterparty} — ${compact(o.detail)}`
const sc = (s?: string | null) => (s ? `[${s}]` : '')

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const params = new URL(req.url).searchParams
  const format = params.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const view = params.get('view') === 'outstanding' ? 'outstanding' : 'aging'

  const supabase = await createClient()
  const data = await fetchLoanMonitorData(supabase)
  const monthLabel = dayjs(`${data.currentYM}-01`).format('MMMM YYYY')
  const filename = `loan-monitor-${view}-${data.currentYM}`

  if (view === 'aging') {
    const header = ['Counterparty', 'SC', 'Due this month', '1 month late', '2 months late', '3+ months late', 'Total unpaid (RM)']
    const sideBlock = (title: string, s: MonitorSide) => {
      const rows: (string | number | null)[][] = []
      const kinds: PdfRowKind[] = []
      rows.push([`${title} (${s.due.length})`, '', '', '', '', '', ''])
      kinds.push('group')
      for (const d of s.due) {
        rows.push([
          `   ${dueLabel(d)}`,
          sc(d.source),
          m(d.buckets.current), m(d.buckets.m1), m(d.buckets.m2), m(d.buckets.m3),
          formatMoneyBare(d.buckets.total),
        ])
        kinds.push('detail')
      }
      rows.push([
        `${title} — TOTAL`,
        '',
        m(s.dueTotal.current), m(s.dueTotal.m1), m(s.dueTotal.m2), m(s.dueTotal.m3),
        formatMoneyBare(s.dueTotal.total),
      ])
      kinds.push('total')
      return { rows, kinds }
    }
    const a = sideBlock('To collect — Fund OUT', data.collect)
    const b = sideBlock('To repay — Fund IN', data.repay)
    const rows = [...a.rows, ...b.rows]
    const kinds = [...a.kinds, ...b.kinds]

    if (format === 'xlsx') {
      return exportXlsxResponse({
        filename,
        buffer: buildXlsxBuffer({
          sheetName: 'Loan Aging',
          headerRow: header,
          rows: rows as (string | number)[][],
          columnWidths: [52, 10, 14, 14, 14, 14, 16],
        }),
      })
    }
    return exportPdfResponse({
      filename,
      element: (
        <PdfDocument
          title="Loan Monitor — Aging"
          subtitle="Unpaid installments from each agreed start · payments FIFO oldest-first · all amounts RM (principal + interest)"
          periodLabel={`As of ${monthLabel}`}
          orientation="landscape"
        >
          <PdfTable
            columns={[
              { label: 'Counterparty', width: 272, align: 'left' as const },
              { label: 'SC', width: 58, align: 'left' as const },
              { label: 'Due this month', width: 62, align: 'right' as const },
              { label: '1 month late', width: 62, align: 'right' as const },
              { label: '2 months late', width: 62, align: 'right' as const },
              { label: '3+ months late', width: 62, align: 'right' as const },
              { label: 'Total unpaid', width: 72, align: 'right' as const },
            ]}
            rows={rows}
            rowKinds={kinds}
          />
        </PdfDocument>
      ),
    })
  }

  // ── view=outstanding ──
  const header = ['Counterparty', 'SC', 'Repayment starts', 'Outstanding (RM)']
  const sideBlock = (title: string, s: MonitorSide) => {
    const rows: (string | number | null)[][] = []
    const kinds: PdfRowKind[] = []
    rows.push([`${title} — fixed schedule (${s.scheduled.length})`, '', '', formatMoneyBare(s.scheduledTotal)])
    kinds.push('group')
    for (const o of s.scheduled) {
      rows.push([`   ${outLabel(o)}`, sc(o.source), startEn(o.startLabel), formatMoneyBare(o.outstanding)])
      kinds.push('detail')
    }
    rows.push([`${title} — no fixed term (${s.noTerm.length})`, '', '', formatMoneyBare(s.noTermTotal)])
    kinds.push('group')
    for (const o of s.noTerm) {
      rows.push([`   ${outLabel(o)}`, sc(o.source), '—', formatMoneyBare(o.outstanding)])
      kinds.push('detail')
    }
    rows.push([`${title} — TOTAL OUTSTANDING`, '', '', formatMoneyBare(s.grandTotal)])
    kinds.push('total')
    return { rows, kinds }
  }
  const a = sideBlock('To collect — Fund OUT', data.collect)
  const b = sideBlock('To repay — Fund IN', data.repay)
  const rows = [...a.rows, ...b.rows]
  const kinds = [...a.kinds, ...b.kinds]

  if (format === 'xlsx') {
    return exportXlsxResponse({
      filename,
      buffer: buildXlsxBuffer({
        sheetName: 'Outstanding',
        headerRow: header,
        rows: rows as (string | number)[][],
        columnWidths: [58, 12, 18, 18],
      }),
    })
  }
  return exportPdfResponse({
    filename,
    element: (
      <PdfDocument
        title="Loan Monitor — Outstanding"
        subtitle="Principal balances · scheduled vs undecided · all amounts RM"
        periodLabel={`As of ${monthLabel}`}
      >
        <PdfTable
          columns={[
            { label: 'Counterparty', width: 300, align: 'left' as const },
            { label: 'SC', width: 60, align: 'left' as const },
            { label: 'Repayment starts', width: 86, align: 'right' as const },
            { label: 'Outstanding', width: 86, align: 'right' as const },
          ]}
          rows={rows}
          rowKinds={kinds}
        />
      </PdfDocument>
    ),
  })
}
