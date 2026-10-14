import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { readPnlStatement } from '@/app/(portal)/reports/_lib/statement-reads'
import { pnlModel } from '@/lib/fin-app/report-model'
import { askedMonth, askedSegment, reportFiles, searchOf, segmentOptions, type SearchParams } from '@/lib/fin-app/report-page'
import ReportApp from '@/components/fin-app/ReportApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/report/pnl` — Report › P&L in the Finance phone app (2026-10-15,
 * M15): the P&L's own page asked first (its tabs, Department reports), the
 * month's statement read as the desktop's P&L reads it (`readPnlStatement` —
 * consolidated, or the segment asked), the net profit over its four parts,
 * the files whoever may export them.
 */
export default async function FinAppPnl({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/income-statement')
  const user = await requirePermission('dept_reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const supabase = await createClient()
  const { pnl, segment, isDeptMgr } = await readPnlStatement(supabase, user, { period: ym, compare: '', segment: askedSegment(sp) })
  return (
    <ReportApp
      key={`${ym}:${segment}`}
      model={pnlModel(pnl, ym)}
      search={searchOf(sp)}
      month={{ ym, thisMonth }}
      segment={isDeptMgr ? null : { value: segment, options: segmentOptions() }}
      files={canDo(user, 'reports', 'export') ? reportFiles('/reports/income-statement/export', { period: ym, segment }) : []}
    />
  )
}
