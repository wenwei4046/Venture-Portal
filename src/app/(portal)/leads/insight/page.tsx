import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { insightRange } from '@/lib/leads/insight'
import { overviewRange, spendStale } from '@/lib/leads/overview'
import { keepAdSpend } from '@/lib/leads/ad-spend-keep'
import { NOT_SET_UP, loadFlows, loadInsightMore, loadLeadConfig, loadLeadList, loadOutlets, loadOverview } from '@/lib/leads/server'
import InsightView from '../_components/InsightView'
import OverviewView from '../_components/OverviewView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Insight (2026-10-16; v2 2026-10-23; the v2 handoff 2026-11-02): the conversations started today, in the last
 * 7 / 30 days or a custom range (?r= today | 7 | 30 | custom&from=&to= | q, this quarter), by brand on the page. Who replied first and where customers drop off need
 * mig 20261023400000. Lead View · View reads it.
 *
 * ?v=overview (2026-11-17, mig 20261117200000): the outlets' Performance Overview — ?r= month (default) | last | 7 | 30 |
 * custom&from=&to=. Opened by somebody with Lead View · Manage, the period's ad spend is read from Meta first when what is
 * kept is stale (`spendStale`).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ v?: string; r?: string; from?: string; to?: string }> }) {
  await requirePage('/leads/insight')
  const user = await requirePermission('leads')
  const config = await loadLeadConfig()
  if (!config.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Insight" />
        <div className="sheet-danger">{config.reason}</div>
      </HvPage>
    )
  }
  const sp = await searchParams
  const brands = config.data.brands.map(b => ({ id: b.id, name: b.name }))

  if (sp.v === 'overview') {
    const today = config.data.today
    const range = overviewRange(sp.r, today, sp.from, sp.to)
    const canManage = canDo(user, 'leads', 'manage')
    const [first, outlets] = await Promise.all([loadOverview(range.from, range.to), loadOutlets()])
    let data = first
    let spendNote: string | null = null
    if (data.ok && canManage && spendStale(data.data.accounts, range.from, range.to, today, Date.now())) {
      const kept = await keepAdSpend(range.from, range.to)
      if (!kept.ok) spendNote = `Ad spend not read from Meta: ${kept.reason}`
      else {
        if (kept.data.refused.length) spendNote = `Meta refused: ${kept.data.refused.join('; ')}`
        data = await loadOverview(range.from, range.to)
      }
    }
    if (!data.ok) {
      return (
        <HvPage>
          <PageHead eyebrow="Lead View" title="Insight" />
          <div className="sheet-danger">{data.reason === NOT_SET_UP ? 'Overview is waiting for its database update.' : data.reason}</div>
        </HvPage>
      )
    }
    return <OverviewView data={data.data} outlets={outlets.ok ? outlets.data : []} brands={brands} range={range} today={today} canManage={canManage} spendNote={spendNote} />
  }

  const range = insightRange(sp.r, config.data.today, sp.from, sp.to)
  const [list, more, flows] = await Promise.all([loadLeadList(range.from, range.listTo), loadInsightMore(range.from, range.to), loadFlows()])
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
    <InsightView contacts={onlyTests ? list.data : list.data.filter(c => !c.isTest)} onlyTests={onlyTests} range={range} today={config.data.today}
      brands={brands}
      more={more.ok ? more.data : null} flows={flows.ok ? flows.data.map(f => ({ id: f.id, name: f.name, steps: f.steps })) : []} />
  )
}
