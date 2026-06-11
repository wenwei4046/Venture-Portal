// GL-driven P&L export (xlsx/pdf) — same engine + block structure as the page.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buildPnl, fetchAllJournalLines, fetchCoaAccounts, monthPeriod, prevMonth } from '@/lib/gl-reports'
import { pnlBlocks } from '@/lib/gl-report-blocks'
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
  const pnl = buildPnl(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare),
    segment: segment || undefined,
  })

  return glStatementExportResponse({
    format,
    filename: `pnl-${period}${segment ? `-${segment}` : ''}`,
    title: 'P&L Statement',
    periodLabel: `${dayjs(`${period}-01`).format('MMMM YYYY')}${segment ? ` · ${segment}` : ''}`,
    currentLabel: dayjs(`${period}-01`).format('MMM YYYY'),
    compareLabel: dayjs(`${compare}-01`).format('MMM YYYY'),
    blocks: pnlBlocks(pnl),
    pctBase: pnl.revenue.current,
  })
}
