import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { buildPnlAccounts, buildCustomPnlRows, defaultPnlLayout } from '@/lib/pnl-custom'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { segmentFilterFor } from '../../_components/report-segments'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { sliceMatrixMonths } from '@/lib/monthly-matrix'
import { rangeLabel, reportRange } from '@/lib/report-range'
import { MatrixPdf } from '@/lib/export/matrix-pdf'
import { reportsCompanyWide } from '@/lib/surfaces'

export async function GET(req: Request) {
  const user = await requireActionOn('/reports/monthly-pnl', 'dept_reports', 'export')
  // As the page: for whoever reads the reports company-wide (the Dept Manager's
  // own-segment export went with the kind, 2026-10-17).
  if (!reportsCompanyWide(user)) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const periodRaw = url.searchParams.get('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : officeMonth()
  // From – To (2026-10-09, the Finance revamp): the months cut as the page cuts them.
  const range = reportRange({ from: url.searchParams.get('from') ?? undefined, period }, officeMonth())
  const segment = url.searchParams.get('segment') ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const supabase = await createClient()
  // Mirror the page: consolidated when no segment is picked.
  const consolidated = !segment
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
  const cut = sliceMatrixMonths(data.columns, buildCustomPnlRows(data, layout), range.from, { base: data.salesByColumn })
  const matrix = { columns: cut.columns, rows: cut.rows }

  const filename = `monthly-pnl-${range.wholeYear ? period : `${range.from}-${period}`}${segment ? `-${segment}` : ''}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Monthly P&L"
          subtitle={`FY ${year} · all amounts RM`}
          periodLabel={range.wholeYear ? `Up to ${dayjs(`${period}-01`).format('MMMM YYYY')}` : rangeLabel(range.from, range.to)}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Monthly P&L', matrix, cut.base ?? data.salesByColumn) })
}
