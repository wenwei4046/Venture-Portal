import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { loadRepaymentSchedule } from '@/app/(portal)/repayment-schedule/_lib/schedule-data'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import { askedScheduleMonth, repaymentFiles, repaymentModel, repaymentPlace } from '@/lib/fin-app/repayment-model'
import PageApp from '@/components/fin-app/PageApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/repayment` — Fund › Repayment Schedule in the Finance phone
 * app (2026-10-15, part 5c): the page's own gates (its tabs, the treasury), the
 * very month the desktop page and its Export read (`loadRepaymentSchedule` —
 * the office's month unless `?m=` names another, back or ahead), the Export for
 * whoever may export.
 */
export default async function FinAppRepayment({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/repayment-schedule')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedScheduleMonth(sp.m, thisMonth)
  const supabase = await createClient()
  const schedule = await loadRepaymentSchedule(supabase, ym)
  return (
    <PageApp
      key={ym}
      place={repaymentPlace(ym, thisMonth)}
      model={repaymentModel(schedule)}
      search={searchOf(sp)}
      files={canDo(user, 'treasury', 'export') ? repaymentFiles(ym) : []}
    />
  )
}
