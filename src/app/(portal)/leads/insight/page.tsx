import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { leadInsight } from '@/lib/leads/insight'
import { leadPeriod, recentMonths } from '@/lib/leads/period'
import { loadLeadConfig, loadLeadList } from '@/lib/leads/server'
import InsightView from '../_components/InsightView'

export const dynamic = 'force-dynamic'

/** Lead View › Insight (2026-10-16): the month's phone rate and its breakdowns, ?m=YYYY-MM. Lead View · View reads it. */
export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requirePage('/leads/insight')
  await requirePermission('leads')
  const period = leadPeriod((await searchParams).m)
  const [config, list] = await Promise.all([loadLeadConfig(), loadLeadList(period.from, period.to)])
  if (!config.ok || !list.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Insight" />
        <div className="sheet-danger">{!config.ok ? config.reason : !list.ok ? list.reason : null}</div>
      </HvPage>
    )
  }
  // Only test conversations so far (before Meta is connected): count them, and say so.
  const onlyTests = list.data.length > 0 && list.data.every(c => c.isTest)
  return <InsightView insight={leadInsight(list.data, config.data.brands, { withTests: onlyTests })} onlyTests={onlyTests} period={period} months={recentMonths()} />
}
