import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeTime } from '@/lib/office-time'
import { reportFiles, searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import { baseRateModel, type BaseRateRow } from '@/lib/fin-app/report-pages'
import PageApp from '@/components/fin-app/PageApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/base-rate` — Report › Base Rate History in the Finance phone
 * app (2026-10-15, part 5b): the page's own gates, the last twenty quarters the
 * desktop reads, the current rate as the headline, the files for whoever may
 * export.
 */
export default async function FinAppBaseRate({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/base-rate')
  const user = await requirePermission('reports')
  const sp = await searchParams
  const supabase = await createClient()
  const { data: history } = await supabase.from('base_rate_history').select('quarter, base_rate, weighted_cost, op_margin, approved_at').order('approved_at', { ascending: false }).limit(20)
  return (
    <PageApp
      place={{ href: '/fin-app/page/base-rate', title: 'Base Rate History', roman: 'III.', keep: '' }}
      model={baseRateModel((history ?? []) as BaseRateRow[], (iso) => officeTime(iso).format('D MMM YYYY'))}
      search={searchOf(sp)}
      files={canDo(user, 'reports', 'export') ? reportFiles('/reports/base-rate/export', {}) : []}
    />
  )
}
