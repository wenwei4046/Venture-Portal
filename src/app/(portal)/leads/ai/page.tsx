import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import type { AgentMore } from '@/lib/leads/agent'
import { NOT_SET_UP, loadAiMore, loadChangesOf, loadDataFiles, loadDataFolders, loadInfo, loadLeadConfig, loadOutlets, loadPersonas } from '@/lib/leads/server'
import AgentView from '../_components/AgentView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › AI Agent (2026-10-16; v2 2026-10-23; the v2 handoff 2026-11-02 — mig 20261102140000): each brand's agent
 * — How it replies, Knowledge (Data Center folders, files and links, General info, History), Fixed answers, Sales
 * playbook, Memory — and the Test chat. ?b=<brand>&tab=answers opens a brand's tab (AI corrections' View). Lead View ·
 * View reads it; Manage edits. Before a migration the page shows what it can and cannot save.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ b?: string; tab?: string }> }) {
  await requirePage('/leads/ai')
  const user = await requirePermission('leads')
  const sp = await searchParams
  const [config, personas, files, folders, info, history, outlets] = await Promise.all([
    loadLeadConfig(), loadPersonas(), loadDataFiles(), loadDataFolders(), loadInfo(), loadChangesOf(['lead_ai_knowledge'], 300), loadOutlets(),
  ])
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
    <AgentView personas={personas.data} more={byBrand} files={files.ok ? files.data : []} folders={folders.ok ? folders.data : []} foldersReady={folders.ok}
      info={info.ok ? info.data : null} history={history.ok ? history.data : []} today={config.data.today}
      connected={Boolean(process.env.ANTHROPIC_API_KEY)} ready={ready} canManage={canDo(user, 'leads', 'manage')} initialBrand={sp.b} initialTab={sp.tab}
      outlets={outlets.ok ? outlets.data : []} />
  )
}
