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

const dueLabel = (d: DueRow) =>
  `${d.counterparty} — ${d.detail}${d.source ? ` · SC ${d.source}` : ''}`
const outLabel = (o: OutstandingRow) =>
  `${o.counterparty} — ${o.detail}${o.source ? ` · SC ${o.source}` : ''}`

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
    const header = ['Counterparty', 'Due this month', '1 month late', '2 months late', '3+ months late', 'Total unpaid (RM)']
    const sideBlock = (title: string, s: MonitorSide) => {
      const rows: (string | number | null)[][] = []
      const kinds: PdfRowKind[] = []
      rows.push([`${title} (${s.due.length})`, '', '', '', '', ''])
      kinds.push('group')
      for (const d of s.due) {
        rows.push([
          `   ${dueLabel(d)}`,
          m(d.buckets.current), m(d.buckets.m1), m(d.buckets.m2), m(d.buckets.m3),
          formatMoneyBare(d.buckets.total),
        ])
        kinds.push('detail')
      }
      rows.push([
        `${title} — TOTAL`,
        m(s.dueTotal.current), m(s.dueTotal.m1), m(s.dueTotal.m2), m(s.dueTotal.m3),
        formatMoneyBare(s.dueTotal.total),
      ])
      kinds.push('total')
      return { rows, kinds }
    }
    const a = sideBlock('应收 To collect — Fund OUT', data.collect)
    const b = sideBlock('应付 To repay — Fund IN', data.repay)
    const rows = [...a.rows, ...b.rows]
    const kinds = [...a.kinds, ...b.kinds]

    if (format === 'xlsx') {
      return exportXlsxResponse({
        filename,
        buffer: buildXlsxBuffer({
          sheetName: 'Loan Aging',
          headerRow: header,
          rows: rows as (string | number)[][],
          columnWidths: [58, 14, 14, 14, 14, 16],
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
              { label: 'Counterparty', width: 250, align: 'left' as const },
              { label: 'Due this month', width: 66, align: 'right' as const },
              { label: '1 month late', width: 66, align: 'right' as const },
              { label: '2 months late', width: 66, align: 'right' as const },
              { label: '3+ months late', width: 66, align: 'right' as const },
              { label: 'Total unpaid', width: 76, align: 'right' as const },
            ]}
            rows={rows}
            rowKinds={kinds}
          />
        </PdfDocument>
      ),
    })
  }

  // ── view=outstanding ──
  const header = ['Counterparty', 'Repayment starts', 'Outstanding (RM)']
  const sideBlock = (title: string, s: MonitorSide) => {
    const rows: (string | number | null)[][] = []
    const kinds: PdfRowKind[] = []
    rows.push([`${title} — 定好日期 fixed schedule (${s.scheduled.length})`, '', formatMoneyBare(s.scheduledTotal)])
    kinds.push('group')
    for (const o of s.scheduled) {
      rows.push([`   ${outLabel(o)}`, o.startLabel, formatMoneyBare(o.outstanding)])
      kinds.push('detail')
    }
    rows.push([`${title} — 未定 no fixed term (${s.noTerm.length})`, '', formatMoneyBare(s.noTermTotal)])
    kinds.push('group')
    for (const o of s.noTerm) {
      rows.push([`   ${outLabel(o)}`, '未定', formatMoneyBare(o.outstanding)])
      kinds.push('detail')
    }
    rows.push([`${title} — TOTAL OUTSTANDING`, '', formatMoneyBare(s.grandTotal)])
    kinds.push('total')
    return { rows, kinds }
  }
  const a = sideBlock('应收 To collect — Fund OUT', data.collect)
  const b = sideBlock('应付 To repay — Fund IN', data.repay)
  const rows = [...a.rows, ...b.rows]
  const kinds = [...a.kinds, ...b.kinds]

  if (format === 'xlsx') {
    return exportXlsxResponse({
      filename,
      buffer: buildXlsxBuffer({
        sheetName: 'Outstanding',
        headerRow: header,
        rows: rows as (string | number)[][],
        columnWidths: [64, 18, 18],
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
            { label: 'Counterparty', width: 330, align: 'left' as const },
            { label: 'Repayment starts', width: 90, align: 'right' as const },
            { label: 'Outstanding', width: 90, align: 'right' as const },
          ]}
          rows={rows}
          rowKinds={kinds}
        />
      </PdfDocument>
    ),
  })
}
