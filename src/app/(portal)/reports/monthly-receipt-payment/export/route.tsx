// Monthly Receipt & Payment export (xlsx/pdf) — same engine + rows as the
// page (lib/monthly-rnp), mirroring monthly-cash-flow/export.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import {
  fetchInterBillingCashFlow,
  interBillTransferAccount,
  payrollCustodyAccount,
} from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { monthColumns, type MatrixRow } from '@/lib/monthly-matrix'
import { buildRnpMatrixRows, type RnpInvoiceEvent } from '@/lib/monthly-rnp'
import { segmentFilterFor } from '../../_components/report-segments'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'

export async function GET(req: Request) {
  // dept_manager may export their own segment (RLS scopes journal_lines).
  const user = await requirePermission('dept_reports')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const periodRaw = url.searchParams.get('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : dayjs().format('YYYY-MM')
  const segment = url.searchParams.get('segment') ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const supabase = await createClient()
  const isDeptMgr = user.role === 'dept_manager'
  const consolidated = user.role !== 'dept_manager' && !segment
  // As on the page (2026-10-08): the bridge starts beside the journal read
  // with the bank codes still pending, and is not read where its lines are
  // dropped.
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  const [lines, accounts, bankCodes, ib, inSaved, outSaved, eventsRes, { data: companyRows }] =
    await Promise.all([
      fetchAllJournalLines(supabase),
      fetchCoaAccounts(supabase),
      bankCodesRead,
      consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
      readReportLayout(supabase, 'cash_flow_in'),
      readReportLayout(supabase, 'cash_flow_out'),
      supabase.rpc(
        'rnp_invoice_events' as never,
        (isDeptMgr || !segment ? {} : { p_segment: segment }) as never,
      ),
      supabase.from('companies').select('id, name, short_code'),
    ])
  const ibLines = ib ? ib.lines : []

  const data = buildMonthlyCashFlowSides(
    [...lines, ...ibLines],
    [...accounts, interBillTransferAccount, payrollCustodyAccount],
    bankCodes,
    { year, throughMonth, segment: segmentFilterFor(segment) },
  )

  const { months, accPeriod } = monthColumns(year, throughMonth)
  const events = (
    Array.isArray((eventsRes as { data?: unknown })?.data)
      ? ((eventsRes as { data: unknown }).data as RnpInvoiceEvent[])
      : []
  )
  const companyLabelById = new Map<string, string>(
    ((companyRows ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map(
      (c) => [c.id, c.short_code ?? c.name],
    ),
  )
  const rnpRows = buildRnpMatrixRows({ events, companyLabelById, months, accPeriod })

  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', 'Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', 'Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
    ...rnpRows,
  ]
  const matrix = { columns: data.columns, rows }

  const filename = `monthly-receipt-payment-${period}${segment ? `-${segment}` : ''}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Monthly Receipt & Payment"
          subtitle={`FY ${year} · all amounts RM · cash matrix + receivables`}
          periodLabel={`Up to ${dayjs(`${period}-01`).format('MMMM YYYY')}`}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Monthly Receipt & Payment', matrix) })
}
