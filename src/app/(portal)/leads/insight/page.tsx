import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { insightRange } from '@/lib/leads/insight'
import { NOT_SET_UP, loadFlows, loadInsightMore, loadLeadConfig, loadLeadList } from '@/lib/leads/server'
import InsightView from '../_components/InsightView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Insight (2026-10-16; v2 2026-10-23, the redesign handoff — step 6): the conversations started in the
 * last 7 / 30 days or this quarter (?r=), by brand on the page. Who replied first and where customers drop off need
 * mig 20261023400000. Lead View · View reads it.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requirePage('/leads/insight')
  await requirePermission('leads')
  const config = await loadLeadConfig()
  if (!config.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Insight" />
        <div className="sheet-danger">{config.reason}</div>
      </HvPage>
    )
  }
  const range = insightRange((await searchParams).r, config.data.today)
  const [list, more, flows] = await Promise.all([loadLeadList(range.from, range.to), loadInsightMore(range.from, range.to), loadFlows()])
  if (!list.ok || (!more.ok && more.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Insight" />
        <div className="sheet-danger">{!list.ok ? list.reason : !more.ok ? more.reason : null}</div>
      </HvPage>
    )
  }
  // Only test conversations so far (before Meta is connected): count them, and say so.
  const onlyTests = list.data.length > 0 && list.data.every(c => c.isTest)
  return (
    <InsightView contacts={onlyTests ? list.data : list.data.filter(c => !c.isTest)} onlyTests={onlyTests} range={range}
      brands={config.data.brands.map(b => ({ id: b.id, name: b.name }))}
      more={more.ok ? more.data : null} flows={flows.ok ? flows.data.map(f => ({ id: f.id, name: f.name, steps: f.steps })) : []} />
  )
}
