import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { readBalanceSheet } from '@/app/(portal)/reports/_lib/statement-reads'
import { balanceSheetModel } from '@/lib/fin-app/report-model'
import { askedMonth, askedSegment, reportFiles, searchOf, segmentOptions, type SearchParams } from '@/lib/fin-app/report-page'
import ReportApp from '@/components/fin-app/ReportApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/report/bs` — Report › Balance sheet in the Finance phone app
 * (2026-10-15): the Balance Sheet's own page asked first (its tabs, Reports),
 * read as at the month's end as the desktop's reads it (`readBalanceSheet`),
 * the total assets over each part — a segment's slice said not to balance, as
 * the page's chip says — and the files whoever may export them.
 */
export default async function FinAppBalanceSheet({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/balance-sheet')
  const user = await requirePermission('reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const segment = askedSegment(sp)
  const supabase = await createClient()
  const { bs } = await readBalanceSheet(supabase, user, { period: ym, compare: '', segment })
  return (
    <ReportApp
      key={`${ym}:${segment}`}
      model={balanceSheetModel(bs, ym, segment)}
      search={searchOf(sp)}
      month={{ ym, thisMonth }}
      segment={{ value: segment, options: segmentOptions() }}
      files={canDo(user, 'reports', 'export') ? reportFiles('/reports/balance-sheet/export', { period: ym, segment }) : []}
    />
  )
}
