import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import {
  fetchInterBillingCashFlow,
  interBillTransferAccount,
  payrollCustodyAccount,
} from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import type { MatrixRow } from '@/lib/monthly-matrix'
import { segmentFilterFor } from '../../_components/report-segments'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'
import { reportsCompanyWide } from '@/lib/surfaces'

export async function GET(req: Request) {
  // dept_manager may export their own segment (RLS scopes journal_lines).
  const user = await requireAction('dept_reports', 'export', 'dept')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const periodRaw = url.searchParams.get('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : officeMonth()
  const segment = url.searchParams.get('segment') ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const supabase = await createClient()
  // Per-segment only — cancels across segments, so drop it when consolidated
  // (dept managers have no segment param but ARE one segment via RLS); there
  // the bridge is not read at all, and elsewhere it starts beside the journal
  // read with the bank codes still pending (2026-10-08).
  const consolidated = reportsCompanyWide(user) && !segment
  const bankCodesRead = Promise.resolve(
    supabase.rpc('bank_gl_codes' as never), // codes only; dept_managers can't read bank_accounts
  ).then(({ data: banks }) => new Set((banks ?? []) as unknown as string[]))
  const [lines, accounts, bankCodes, ib, inSaved, outSaved] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    bankCodesRead,
    consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const ibLines = ib ? ib.lines : []
  // Same shape as the Cash Flow STATEMENT (the reference view), month columns.
  const data = buildMonthlyCashFlowSides([...lines, ...ibLines], [...accounts, interBillTransferAccount, payrollCustodyAccount], bankCodes, { year, throughMonth, segment: segmentFilterFor(segment) })
  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', 'Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', 'Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
  ]
  const matrix = { columns: data.columns, rows }

  const filename = `monthly-cash-flow-${period}${segment ? `-${segment}` : ''}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Monthly Cash Flow"
          subtitle={`FY ${year} · all amounts RM · direct method`}
          periodLabel={`Up to ${dayjs(`${period}-01`).format('MMMM YYYY')}`}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Monthly Cash Flow', matrix) })
}
