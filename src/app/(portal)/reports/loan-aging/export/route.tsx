// Loan Aging export (xlsx/pdf) — same data + matrix shape as the page,
// both directions stacked in one sheet.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchLoanAgingData, agingSideRows, AGING_COLUMNS } from '@/lib/loan-aging-data'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const supabase = await createClient()
  const data = await fetchLoanAgingData(supabase)
  const matrix = {
    columns: AGING_COLUMNS,
    rows: [...agingSideRows('To collect', data.collect), ...agingSideRows('To repay', data.repay)],
  }

  const filename = `loan-aging-${data.asOfYM}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Loan Aging"
          subtitle="Flat amortisation · payments allocated FIFO · all amounts RM"
          periodLabel={`As of ${dayjs(`${data.asOfYM}-01`).format('MMMM YYYY')}`}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Loan Aging', matrix) })
}
