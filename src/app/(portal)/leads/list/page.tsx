import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { isRangeId, rangeDays } from '@/lib/leads/stage'
import { loadLeadConfig, loadLeads } from '@/lib/leads/server'
import LeadsView from '../_components/LeadsView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Leads (2026-10-16; Leads v2 2026-10-22): everybody who wrote, by the last update in a period —
 * ?r=today|yest|week|month|last|all|custom (This month by default), a custom one's ?from= ?to= inclusive.
 * Lead View · View reads it.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  await requirePage('/leads/list')
  const user = await requirePermission('leads')
  const sp = await searchParams
  const range = isRangeId(sp.r) ? sp.r : 'month'
  const today = officeToday()
  const days = rangeDays(range, today, sp.from, sp.to)
  const [config, list] = await Promise.all([loadLeadConfig(), loadLeads(days?.from ?? null, days?.to ?? null, today)])
  if (!config.ok || !list.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Leads" />
        <div className="sheet-danger">{!config.ok ? config.reason : !list.ok ? list.reason : null}</div>
      </HvPage>
    )
  }
  // The custom boxes show the days read (inclusive), whatever was typed.
  const lastDay = days ? new Date(Date.parse(days.to + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10) : ''
  return (
    <LeadsView
      config={config.data}
      contacts={list.data.contacts}
      stagesReady={list.data.stagesReady}
      range={range}
      from={range === 'custom' && days ? days.from : ''}
      to={range === 'custom' ? lastDay : ''}
      today={today}
      now={Date.now()}
      canEdit={canDo(user, 'leads', 'edit')}
    />
  )
}
