// GL-driven Balance Sheet export (xlsx/pdf) — same engine + blocks as the page.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buildBalanceSheet, fetchAllJournalLines, fetchCoaAccounts, monthPeriod, prevMonth } from '@/lib/gl-reports'
import { balanceSheetBlocks } from '@/lib/gl-report-blocks'
import { glStatementExportResponse } from '@/lib/export/gl-statement'

const YM = /^\d{4}-\d{2}$/

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? ('pdf' as const) : ('xlsx' as const)
  const period = url.searchParams.get('period') ?? dayjs().format('YYYY-MM')
  const compare = url.searchParams.get('compare') ?? prevMonth(period)
  const segment = url.searchParams.get('segment') ?? ''
  if (!YM.test(period) || !YM.test(compare)) {
    return Response.json({ error: 'invalid period/compare (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()
  const [lines, accounts] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
  ])
  const bs = buildBalanceSheet(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare),
    segment: segment || undefined,
  })

  const asAt = (ym: string) => dayjs(monthPeriod(ym).to).format('D MMM YYYY')

  return glStatementExportResponse({
    format,
    filename: `balance-sheet-${period}${segment ? `-${segment}` : ''}`,
    title: 'Balance Sheet',
    periodLabel: `As at ${asAt(period)}${segment ? ` · ${segment}` : ''}`,
    currentLabel: asAt(period),
    compareLabel: asAt(compare),
    blocks: balanceSheetBlocks(bs, segment || undefined),
  })
}
