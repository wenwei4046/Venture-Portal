import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadAiMore, loadCorrections, loadDismissed, loadLeadConfig } from '@/lib/leads/server'
import type { AgentMore } from '@/lib/leads/agent'
import CorrectionsView, { type BrandCorrection } from '../_components/CorrectionsView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › AI corrections (2026-10-23, mig 20261023200000; v2 2026-11-02, mig 20261102130000): every brand's drafts
 * CS changed before sending. ?d= 7 | 30 | 90 | all days (all by default, as drawn). Lead View · View reads it; Manage
 * makes fixed answers and dismisses.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requirePage('/leads/corrections')
  const user = await requirePermission('leads')
  const sp = await searchParams
  const config = await loadLeadConfig()
  if (!config.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="AI corrections" />
        <div className="sheet-danger">{config.reason}</div>
      </HvPage>
    )
  }
  const brands = config.data.brands.map(b => ({ id: b.id, name: b.name }))
  const days = [7, 30, 90].includes(Number(sp.d)) ? Number(sp.d) : null
  const [lists, mores, dismissed] = await Promise.all([
    Promise.all(brands.map(b => loadCorrections(b.id, days))),
    Promise.all(brands.map(b => loadAiMore(b.id))),
    loadDismissed(),
  ])
  const failed = lists.find(l => !l.ok && l.reason !== NOT_SET_UP)
  if (failed && !failed.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="AI corrections" />
        <div className="sheet-danger">{failed.reason}</div>
      </HvPage>
    )
  }
  const corrections: BrandCorrection[] = brands.flatMap((b, i) => { const l = lists[i]; return l.ok ? l.data.map(c => ({ ...c, brandId: b.id })) : [] })
    .sort((a, b) => b.at.localeCompare(a.at))
  const more: Record<string, AgentMore | null> = Object.fromEntries(brands.map((b, i) => { const m = mores[i]; return [b.id, m.ok ? m.data : null] }))
  return (
    <CorrectionsView corrections={corrections} more={more} brands={brands} dismissed={dismissed.ok ? dismissed.data : []} days={days}
      ready={lists.every(l => l.ok) && dismissed.ok} canManage={canDo(user, 'leads', 'manage')} />
  )
}
