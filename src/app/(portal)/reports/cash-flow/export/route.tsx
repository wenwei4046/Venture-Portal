// GL-driven Cash Flow export (xlsx/pdf) — same engine + blocks as the page.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buildCashFlow, fetchAllJournalLines, fetchCoaAccounts, monthPeriod } from '@/lib/gl-reports'
import { cashFlowBlocks } from '@/lib/gl-report-blocks'
import { glStatementExportResponse } from '@/lib/export/gl-statement'
import { segmentFilterFor } from '../../_components/report-segments'

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
    supabase.rpc('bank_gl_codes' as never), // codes only; dept_managers can't read bank_accounts
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])

  const cf = buildCashFlow(
    lines,
    accounts,
    {
      current: monthPeriod(period),
      previous: monthPeriod(compare || period),
      segment: segmentFilterFor(segment),
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
