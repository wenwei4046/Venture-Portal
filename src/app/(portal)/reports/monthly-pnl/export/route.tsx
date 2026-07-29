import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { buildPnlAccounts, buildCustomPnlRows, defaultPnlLayout } from '@/lib/pnl-custom'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { segmentFilterFor } from '../../_components/report-segments'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'

export async function GET(req: Request) {
  // dept_manager may export their own segment (RLS scopes journal_lines).
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const periodRaw = url.searchParams.get('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : dayjs().format('YYYY-MM')
  const segment = url.searchParams.get('segment') ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const supabase = await createClient()
  // Mirror the page: consolidated only for finance/principal with no segment.
  const consolidated = user.role !== 'dept_manager' && !segment
  const [rawLines, accounts, savedRaw, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    readReportLayout(supabase, 'pnl'),
    consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
  ])
  const lines = elim ? eliminateInterBilling(rawLines, elim) : rawLines
  const data = buildPnlAccounts(lines, accounts, { year, throughMonth, segment: segmentFilterFor(segment) })
  const saved = (savedRaw ?? null) as ReportLayout | null
  const layout = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultPnlLayout(data.accounts)
  const matrix = { columns: data.columns, rows: buildCustomPnlRows(data, layout) }

  const filename = `monthly-pnl-${period}${segment ? `-${segment}` : ''}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Monthly P&L"
          subtitle={`FY ${year} · all amounts RM`}
          periodLabel={`Up to ${dayjs(`${period}-01`).format('MMMM YYYY')}`}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Monthly P&L', matrix, data.salesByColumn) })
}
