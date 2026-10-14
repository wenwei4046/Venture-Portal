import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { readCashFlowStatement } from '@/app/(portal)/reports/_lib/statement-reads'
import { cashFlowModel } from '@/lib/fin-app/report-model'
import { askedMonth, askedSegment, reportFiles, searchOf, segmentOptions, type SearchParams } from '@/lib/fin-app/report-page'
import ReportApp from '@/components/fin-app/ReportApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/report/cf` — Report › Cash flow in the Finance phone app
 * (2026-10-15): the Cash Flow's own page asked first, the month's statement
 * read as the desktop's reads it (`readCashFlowStatement` — the direct method,
 * the user's sections per side), the net change over Money in, Money out and
 * the bank balances, the files whoever may export them.
 */
export default async function FinAppCashFlow({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/cash-flow')
  const user = await requirePermission('dept_reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const supabase = await createClient()
  const { cf, inflow, outflow, segment, isDeptMgr } = await readCashFlowStatement(supabase, user, { period: ym, compare: '', segment: askedSegment(sp) })
  return (
    <ReportApp
      key={`${ym}:${segment}`}
      model={cashFlowModel(cf, { inflow, outflow }, ym, ym === thisMonth)}
      search={searchOf(sp)}
      month={{ ym, thisMonth }}
      segment={isDeptMgr ? null : { value: segment, options: segmentOptions() }}
      files={canDo(user, 'reports', 'export') ? reportFiles('/reports/cash-flow/export', { period: ym, segment }) : []}
    />
  )
}
