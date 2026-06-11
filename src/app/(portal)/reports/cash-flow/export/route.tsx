// GL-driven Cash Flow export (xlsx/pdf) — same engine + blocks as the page.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buildCashFlow, fetchAllJournalLines, fetchCoaAccounts, monthPeriod } from '@/lib/gl-reports'
import { cashFlowBlocks } from '@/lib/gl-report-blocks'
import { glStatementExportResponse } from '@/lib/export/gl-statement'

const YM = /^\d{4}-\d{2}$/

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? ('pdf' as const) : ('xlsx' as const)
  const period = url.searchParams.get('period') ?? dayjs().format('YYYY-MM')
  const compare = url.searchParams.get('compare') ?? '' // '' = single-month export
  const segment = url.searchParams.get('segment') ?? ''
  if (!YM.test(period) || (compare && !YM.test(compare))) {
    return Response.json({ error: 'invalid period/compare (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()
  const [lines, accounts, { data: banks }] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    supabase.from('bank_accounts').select('gl_account_code'),
  ])
  const bankCodes = new Set(
    (banks ?? []).map((b) => b.gl_account_code as string | null).filter((c): c is string => !!c),
  )

  const cf = buildCashFlow(
    lines,
    accounts,
    {
      current: monthPeriod(period),
      previous: monthPeriod(compare || period),
      segment: segment || undefined,
    },
    bankCodes,
  )

  return glStatementExportResponse({
    format,
    filename: `cash-flow-${period}${segment ? `-${segment}` : ''}`,
    title: 'Cash Flow Statement',
    periodLabel: `${dayjs(`${period}-01`).format('MMMM YYYY')}${segment ? ` · ${segment}` : ''}`,
    currentLabel: dayjs(`${period}-01`).format('MMM YYYY'),
    compareLabel: compare ? dayjs(`${compare}-01`).format('MMM YYYY') : '',
    blocks: cashFlowBlocks(cf),
  })
}
