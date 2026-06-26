import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildMonthlyPnl } from '@/lib/monthly-pnl'
import { segmentFilterFor } from '../../_components/report-segments'
import { exportPdfResponse } from '@/lib/export/response'
import { buildMatrixCsv } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'pdf'
  const periodRaw = url.searchParams.get('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : dayjs().format('YYYY-MM')
  const segment = url.searchParams.get('segment') ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const supabase = await createClient()
  const [lines, accounts] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
  ])
  const matrix = buildMonthlyPnl(lines, accounts, { year, throughMonth, segment: segmentFilterFor(segment) })

  const filename = `monthly-pnl-${period}${segment ? `-${segment}` : ''}`
  if (format === 'csv') {
    return new Response(buildMatrixCsv(matrix, matrix.salesByColumn), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  }
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
