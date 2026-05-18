import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchCashflowStatement, pivotCashflowByPool } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildCashflowXlsx } from './_format/xlsx'
import { CashflowPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const from = url.searchParams.get('from') ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const to = url.searchParams.get('to') ?? dayjs().format('YYYY-MM-DD')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'invalid from/to date' }, { status: 400 })
  }
  const supabase = await createClient()
  const stmt = await fetchCashflowStatement(supabase, { from, to })
  const periodLabel = `${dayjs(from).format('D MMM YYYY')} – ${dayjs(to).format('D MMM YYYY')}`
  const seg = url.searchParams.get('seg') ?? 'summary'
  const isSummary = seg === 'summary'
  const block = isSummary ? null : pivotCashflowByPool(stmt).pools.find((p) => p.pool === seg) ?? null
  if (!isSummary && !block) {
    return Response.json({ error: 'unknown seg' }, { status: 400 })
  }
  const filename = `cash-flow-${isSummary ? 'summary' : seg}-${from}-${to}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildCashflowXlsx(stmt, { block }) })
  }
  return exportPdfResponse({ filename, element: <CashflowPdf stmt={stmt} periodLabel={periodLabel} block={block} /> })
}
