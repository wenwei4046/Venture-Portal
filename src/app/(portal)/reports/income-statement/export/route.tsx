import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchIncomeStatement } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildIncomeStatementXlsx } from './_format/xlsx'
import { IncomeStatementPdf } from './_format/pdf'
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
  const stmt = await fetchIncomeStatement(supabase, { from, to })
  const periodLabel = `${dayjs(from).format('D MMM YYYY')} – ${dayjs(to).format('D MMM YYYY')}`

  const seg = url.searchParams.get('seg') ?? 'summary'
  const isSummary = seg === 'summary'
  const pool = isSummary ? null : stmt.pools.find((p) => p.pool === seg) ?? null
  if (!isSummary && !pool) {
    return Response.json({ error: 'unknown seg' }, { status: 400 })
  }
  const segLabel = isSummary ? 'summary' : seg
  const filename = `income-statement-${segLabel}-${from}-${to}`

  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildIncomeStatementXlsx(stmt, { pool }) })
  }
  return exportPdfResponse({ filename, element: <IncomeStatementPdf stmt={stmt} periodLabel={periodLabel} pool={pool} /> })
}
