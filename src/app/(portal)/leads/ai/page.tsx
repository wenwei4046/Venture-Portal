import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import type { AgentMore } from '@/lib/leads/agent'
import { NOT_SET_UP, loadAiMore, loadDataFiles, loadLeadConfig, loadPersonas } from '@/lib/leads/server'
import AgentView from '../_components/AgentView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › AI Agent (2026-10-16; v2 2026-10-23, redesign v2 step 5 — mig 20261023200000): each brand's agent —
 * settings, sources, fixed answers, playbook — and a test chat. Lead View · View reads it; Manage edits. Before the
 * migration is applied the page shows the defaults and cannot save.
 */
export default async function Page() {
  await requirePage('/leads/ai')
  const user = await requirePermission('leads')
  const [config, personas, files] = await Promise.all([loadLeadConfig(), loadPersonas(), loadDataFiles()])
  if (!config.ok || !personas.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="AI Agent" />
        <div className="sheet-danger">{!config.ok ? config.reason : !personas.ok ? personas.reason : null}</div>
      </HvPage>
    )
  }
  const more = await Promise.all(personas.data.map(p => loadAiMore(p.brandId)))
  const ready = more.every(m => m.ok) && files.ok
  const byBrand: Record<string, AgentMore> = Object.fromEntries(more.flatMap((m, i) => (m.ok ? [[personas.data[i].brandId, m.data]] : [])))
  if (!ready && more.some(m => !m.ok && m.reason !== NOT_SET_UP)) {
    const bad = more.find(m => !m.ok)
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="AI Agent" />
        <div className="sheet-danger">{bad && !bad.ok ? bad.reason : null}</div>
      </HvPage>
    )
  }
  return (
    <AgentView personas={personas.data} more={byBrand} files={files.ok ? files.data : []} today={config.data.today}
      connected={Boolean(process.env.ANTHROPIC_API_KEY)} ready={ready} canManage={canDo(user, 'leads', 'manage')} />
  )
}
