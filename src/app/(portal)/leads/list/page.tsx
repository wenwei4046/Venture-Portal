import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { leadPeriod, recentMonths } from '@/lib/leads/period'
import { loadLeadConfig, loadLeadList } from '@/lib/leads/server'
import LeadsView from '../_components/LeadsView'

export const dynamic = 'force-dynamic'

/** Lead View › Leads (2026-10-16): the month's customers with a phone, ?m=YYYY-MM. Lead View · View reads it. */
export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requirePage('/leads/list')
  const user = await requirePermission('leads')
  const period = leadPeriod((await searchParams).m)
  const [config, list] = await Promise.all([loadLeadConfig(), loadLeadList(period.from, period.to)])
  if (!config.ok || !list.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Leads" />
        <div className="sheet-danger">{!config.ok ? config.reason : !list.ok ? list.reason : null}</div>
      </HvPage>
    )
  }
  return <LeadsView config={config.data} contacts={list.data} period={period} months={recentMonths()} canEdit={canDo(user, 'leads', 'edit')} />
}
