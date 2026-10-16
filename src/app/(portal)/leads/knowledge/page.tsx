import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadKnowledge, loadLeadConfig } from '@/lib/leads/server'
import KnowledgeView from '../_components/KnowledgeView'

export const dynamic = 'force-dynamic'

/** Lead View › Data Center (2026-10-16): what the AI agent may tell customers. Lead View · View reads it; Manage edits. */
export default async function Page() {
  await requirePage('/leads/knowledge')
  const user = await requirePermission('leads')
  const [config, knowledge] = await Promise.all([loadLeadConfig(), loadKnowledge()])
  if (!config.ok || !knowledge.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Data Center" />
        <div className="sheet-danger">{!config.ok ? config.reason : !knowledge.ok ? knowledge.reason : null}</div>
      </HvPage>
    )
  }
  return <KnowledgeView cards={knowledge.data} brands={config.data.brands} today={config.data.today} canManage={canDo(user, 'leads', 'manage')} />
}
