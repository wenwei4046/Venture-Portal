import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import {
  buildCashFlowAccounts,
  buildCustomCashFlowRows,
  defaultCashFlowLayout,
  type CashFlowLayout,
} from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { readReportLayout } from '@/lib/report-layouts'
import { segmentFilterFor } from '../../_components/report-segments'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'

export async function GET(req: Request) {
  // dept_manager may export their own segment (RLS scopes journal_lines).
  await requireRole(['principal', 'finance', 'dept_manager'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const periodRaw = url.searchParams.get('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : dayjs().format('YYYY-MM')
  const segment = url.searchParams.get('segment') ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const supabase = await createClient()
  const [lines, accounts, { data: banks }, savedRaw] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    supabase.rpc('bank_gl_codes' as never), // codes only; dept_managers can't read bank_accounts
    readReportLayout(supabase, 'cash_flow'),
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])
  const ib = await fetchInterBillingCashFlow(supabase, bankCodes)
  const data = buildCashFlowAccounts([...lines, ...ib.lines], [...accounts, ib.account], bankCodes, { year, throughMonth, segment: segmentFilterFor(segment) })
  const saved = (savedRaw ?? null) as CashFlowLayout | null
  const layout = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultCashFlowLayout(data.accounts)
  const matrix = { columns: data.columns, rows: buildCustomCashFlowRows(data, layout) }

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
