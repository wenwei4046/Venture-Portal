import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { fetchLedger } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildLedgerXlsx } from './_format/xlsx'
import { LedgerPdf } from './_format/pdf'
import { officeTime, officeToday } from '@/lib/office-time'

export async function GET(req: Request) {
  await requireAction('reports', 'export')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const code = url.searchParams.get('code')
  const from = url.searchParams.get('from') ?? officeTime().startOf('month').format('YYYY-MM-DD')
  const to = url.searchParams.get('to') ?? officeToday()

  if (!code) return Response.json({ error: 'code is required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'invalid from/to date' }, { status: 400 })
  }

  const supabase = await createClient()
  let led
  try {
    led = await fetchLedger(supabase, { code, from, to })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return Response.json({ error: msg }, { status: 400 })
  }

  const filename = `ledger-${code}-${from}-${to}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildLedgerXlsx(led) })
  }
  return await exportPdfResponse({ filename, element: <LedgerPdf led={led} /> })
}
