import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { fetchTrialBalance, isCalendarDay } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildTrialBalanceXlsx } from './_format/xlsx'
import { TrialBalancePdf } from './_format/pdf'
import { officeToday } from '@/lib/office-time'

export async function GET(req: Request) {
  await requireAction('reports', 'export')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const asOf = url.searchParams.get('as_of') ?? officeToday() // the office's today, not UTC's
  const showZero = url.searchParams.get('show_zero') === '1'

  if (!isCalendarDay(asOf)) {
    return Response.json({ error: 'invalid as_of date' }, { status: 400 })
  }

  const supabase = await createClient()
  const tb = await fetchTrialBalance(supabase, { asOf, showZeroBalance: showZero })

  const filename = `trial-balance-${asOf.replace(/-/g, '')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildTrialBalanceXlsx(tb) })
  }
  return exportPdfResponse({ filename, element: <TrialBalancePdf tb={tb} /> })
}
