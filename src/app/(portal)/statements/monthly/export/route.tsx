import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildStatementsXlsx } from './_format/xlsx'
import { StatementsPdf } from './_format/pdf'
import dayjs from 'dayjs'

interface StatementRow {
  period: string
  companyName: string
  totalInvoice: number
  totalContra: number
  netAmount: number
  status: string
  issuedAt: string
}

export async function GET(req: Request) {
  await requirePermission('treasury')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const period = url.searchParams.get('period')

  if (period && !/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: 'invalid period format (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()

  // Replicate the page's fetch (statements + companies)
  let query = supabase
    .from('monthly_statements')
    .select('*')
    .order('period_month', { ascending: false })
    .order('created_at', { ascending: false })

  if (period) {
    const periodStart = `${period}-01`
    query = query.eq('period_month', periodStart)
  }

  const [{ data: statements }, { data: companies }] = await Promise.all([
    query,
    supabase.from('companies').select('id, name, short_code'),
  ])

  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name as string, code: c.short_code as string }])
  )

  // Transform statements to row format
  const rows: StatementRow[] = (statements ?? []).map((s) => {
    const company = companyMap.get(s.company_id)
    const periodLabel = dayjs(s.period_month).format('MMM YYYY')
    const issuedAtStr = s.issued_at ? dayjs(s.issued_at).format('DD/MM/YYYY') : '—'
    return {
      period: periodLabel,
      companyName: company?.name ?? '—',
      totalInvoice: Number(s.total_invoice),
      totalContra: Number(s.total_contra),
      netAmount: Number(s.net_amount),
      status: s.status ?? 'draft',
      issuedAt: issuedAtStr,
    }
  })

  const filename = period
    ? `statements-${period.replace('-', '')}`
    : `statements-${dayjs().format('YYYYMM')}`
  const periodLabel = period ? dayjs(`${period}-01`).format('MMMM YYYY') : dayjs().format('MMMM YYYY')

  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildStatementsXlsx(rows) })
  }
  return exportPdfResponse({ filename, element: <StatementsPdf rows={rows} periodLabel={periodLabel} /> })
}
