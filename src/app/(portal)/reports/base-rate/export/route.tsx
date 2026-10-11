import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildBaseRateXlsx } from './_format/xlsx'
import { BaseRatePdf } from './_format/pdf'
import { officeTime } from '@/lib/office-time'

export async function GET(req: Request) {
  await requireActionOn('/reports/base-rate', 'reports', 'export')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const supabase = await createClient()

  // Replicate the data fetch from base-rate/page.tsx
  const { data: history } = await supabase
    .from('base_rate_history')
    .select('*')
    .order('approved_at', { ascending: false })
    .limit(20)

  const rows = history ?? []
  const filename = `base-rate-history-${officeTime().format('YYYYMMDD')}`

  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildBaseRateXlsx(rows) })
  }
  return exportPdfResponse({ filename, element: <BaseRatePdf rows={rows} /> })
}
