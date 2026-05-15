import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchBalanceSheet } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildBalanceSheetXlsx } from './_format/xlsx'
import { BalanceSheetPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const asOf = url.searchParams.get('as_of') ?? dayjs().format('YYYY-MM-DD')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return Response.json({ error: 'invalid as_of date' }, { status: 400 })
  }

  const supabase = await createClient()
  const bs = await fetchBalanceSheet(supabase, { asOf })

  const filename = `balance-sheet-${asOf.replace(/-/g, '')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildBalanceSheetXlsx(bs) })
  }
  return exportPdfResponse({ filename, element: <BalanceSheetPdf bs={bs} /> })
}
