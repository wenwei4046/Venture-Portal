import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { inDate } from '@/lib/leads/ai'
import { loadKnowledge, loadLeadConfig, loadPersonas } from '@/lib/leads/server'
import AgentView from '../_components/AgentView'

export const dynamic = 'force-dynamic'

/** Lead View › AI Agent (2026-10-16): each brand's soul and mode, and a try-it chat. Lead View · View reads it; Manage edits. */
export default async function Page() {
  await requirePage('/leads/ai')
  const user = await requirePermission('leads')
  const [config, personas, knowledge] = await Promise.all([loadLeadConfig(), loadPersonas(), loadKnowledge()])
  if (!config.ok || !personas.ok || !knowledge.ok) {
    const reason = !config.ok ? config.reason : !personas.ok ? personas.reason : !knowledge.ok ? knowledge.reason : null
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="AI Agent" />
        <div className="sheet-danger">{reason}</div>
      </HvPage>
    )
  }
  const today = config.data.today
  const live = knowledge.data.filter(k => inDate(k, today))
  const cardCounts = Object.fromEntries(personas.data.map(p => [p.brandId, live.filter(k => k.brandId === null || k.brandId === p.brandId).length]))
  return (
    <AgentView personas={personas.data} cardCounts={cardCounts} connected={Boolean(process.env.ANTHROPIC_API_KEY)}
      canManage={canDo(user, 'leads', 'manage')} />
  )
}
