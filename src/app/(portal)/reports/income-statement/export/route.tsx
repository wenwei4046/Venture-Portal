// GL-driven P&L export (xlsx/pdf) — same engine + block structure as the page.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { buildPnl, fetchAllJournalLines, fetchCoaAccounts, monthPeriod } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { pnlBlocks } from '@/lib/gl-report-blocks'
import { glStatementExportResponse } from '@/lib/export/gl-statement'
import { segmentFilterFor } from '../../_components/report-segments'

const YM = /^\d{4}-\d{2}$/

export async function GET(req: Request) {
  await requirePermission('reports')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? ('pdf' as const) : ('xlsx' as const)
  const period = url.searchParams.get('period') ?? dayjs().format('YYYY-MM')
  const compare = url.searchParams.get('compare') ?? '' // '' = single-month export
  const segment = url.searchParams.get('segment') ?? ''
  if (!YM.test(period) || (compare && !YM.test(compare))) {
    return Response.json({ error: 'invalid period/compare (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()
  // Mirror the page: the no-segment view is consolidated → eliminate
  // inter-segment billing pairs (this route is finance/principal only).
  const consolidated = !segment
  const [rawLines, accounts, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
  ])
  const lines = elim ? eliminateInterBilling(rawLines, elim) : rawLines
  const pnl = buildPnl(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare || period),
    segment: segmentFilterFor(segment),
  })

  return glStatementExportResponse({
    format,
    filename: `pnl-${period}${segment ? `-${segment}` : ''}`,
    title: 'P&L Statement',
    periodLabel: `${dayjs(`${period}-01`).format('MMMM YYYY')}${segment ? ` · ${segment}` : ''}`,
    currentLabel: dayjs(`${period}-01`).format('MMM YYYY'),
    compareLabel: compare ? dayjs(`${compare}-01`).format('MMM YYYY') : '',
    blocks: pnlBlocks(pnl),
    pctBase: pnl.revenue.current,
  })
}
