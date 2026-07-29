// Loan Monitor export (xlsx/pdf) — same data as the page: this-month dues
// (both directions) then the outstanding overview, one sheet.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchLoanMonitorData, type MonitorSide } from '@/lib/loan-monitor'
import type { MatrixColumn, MatrixRow } from '@/lib/monthly-matrix'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'

const COLUMNS: MatrixColumn[] = [
  { key: 'due', label: 'Due this month' },
  { key: 'paid', label: 'Paid this month' },
  { key: 'short', label: 'Shortfall' },
  { key: 'outstanding', label: 'Outstanding' },
]

function sideRows(label: string, s: MonitorSide): MatrixRow[] {
  const rows: MatrixRow[] = []
  for (const d of s.due) {
    rows.push({
      key: `${label}:due:${d.key}`,
      label: `${d.counterparty} — ${d.detail}${d.source ? ` · SC ${d.source}` : ''}`,
      depth: 1,
      kind: 'account',
      values: [d.dueAmount, d.paidThisMonth, d.shortfall, 0],
    })
  }
  rows.push({
    key: `${label}:due-total`,
    label: `${label} — due this month total`,
    depth: 0,
    kind: 'subtotal',
    tone: 'auto',
    values: [s.dueTotal.dueAmount, s.dueTotal.paidThisMonth, s.dueTotal.shortfall, 0],
  })
  for (const o of s.scheduled) {
    rows.push({
      key: `${label}:sched:${o.key}`,
      label: `${o.counterparty} — ${o.detail}${o.source ? ` · SC ${o.source}` : ''} · ${o.startLabel}`,
      depth: 1,
      kind: 'account',
      values: [0, 0, 0, o.outstanding],
    })
  }
  for (const o of s.noTerm) {
    rows.push({
      key: `${label}:noterm:${o.key}`,
      label: `${o.counterparty} — ${o.detail}${o.source ? ` · SC ${o.source}` : ''} · 未定`,
      depth: 1,
      kind: 'account',
      values: [0, 0, 0, o.outstanding],
    })
  }
  rows.push({
    key: `${label}:outstanding-total`,
    label: `${label} — outstanding total`,
    depth: 0,
    kind: 'subtotal',
    tone: 'ledger',
    values: [0, 0, 0, s.grandTotal],
  })
  return rows
}

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const supabase = await createClient()
  const data = await fetchLoanMonitorData(supabase)
  const matrix = {
    columns: COLUMNS,
    rows: [...sideRows('To collect', data.collect), ...sideRows('To repay', data.repay)],
  }

  const filename = `loan-monitor-${data.currentYM}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Loan Monitor"
          subtitle="This-month dues (unsettled) + outstanding overview · all amounts RM"
          periodLabel={dayjs(`${data.currentYM}-01`).format('MMMM YYYY')}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Loan Monitor', matrix) })
}
