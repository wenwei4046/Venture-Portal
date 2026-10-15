import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { fetchTrialBalance } from '@/lib/cfo-reports'
import { groupTrialBalance } from '@/lib/trial-balance-groups'
import { segmentFilterFor } from '@/app/(portal)/reports/_components/report-segments'
import { askedMonth, askedSegment, reportFiles, searchOf, segmentOptions, type SearchParams } from '@/lib/fin-app/report-page'
import { dayWords } from '@/lib/fin-app/page-model'
import { asAtOf, monthPlace, trialBalanceModel } from '@/lib/fin-app/report-pages'
import PageApp from '@/components/fin-app/PageApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/tb` — Report › Trial Balance in the Finance phone app
 * (2026-10-15, part 5b): the page's own gates (its tabs, Reports), the very
 * trial balance the desktop reads (`fetchTrialBalance`, the accounts arranged by
 * their parents — `groupTrialBalance`), as at a month's last day (the office's
 * today for its own month), consolidated or one segment; the files for whoever
 * may export.
 */
export default async function FinAppTrialBalance({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/trial-balance')
  const user = await requirePermission('reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const asOf = asAtOf(ym, officeToday())
  const segments = segmentOptions()
  const asked = askedSegment(sp)
  const segment = segments.some((o) => o.value === asked) ? asked : ''
  const supabase = await createClient()
  // The accounts' parents only arrange the rows: should that read fail, every account stands on its own.
  const coaRead = (async () => supabase.from('chart_of_accounts').select('code, name, parent_code'))().catch(() => ({ data: null }))
  const [tb, { data: coa }] = await Promise.all([fetchTrialBalance(supabase, { asOf, showZeroBalance: false, segment: segmentFilterFor(segment) }), coaRead])
  const blocks = groupTrialBalance(tb.rows, (coa ?? []) as Array<{ code: string; name: string; parent_code: string | null }>)
  return (
    <PageApp
      key={`${ym}:${segment}`}
      place={monthPlace({ href: '/fin-app/page/tb', title: 'Trial Balance', roman: 'III.', ym, thisMonth, label: `As at ${dayWords(asOf)}`, segment, segments })}
      model={trialBalanceModel(tb, blocks, asOf)}
      search={searchOf(sp)}
      files={canDo(user, 'reports', 'export') ? reportFiles('/reports/trial-balance/export', { as_of: asOf, segment }) : []}
    />
  )
}
