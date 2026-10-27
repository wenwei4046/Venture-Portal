import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadInbox, loadInfo, loadLabels, loadLeadConfig, loadPersonas, loadQuickReplies, loadThread } from '@/lib/leads/server'
import InboxView from './_components/InboxView'

export const dynamic = 'force-dynamic'

/** Lead View › Inbox (2026-10-16; Inbox v2 2026-10-22). Lead View · View reads it; ?c= opens a conversation, ?q= searches (the top bar). */
export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  await requirePage('/leads')
  const user = await requirePermission('leads')
  const { c, q } = await searchParams
  const [config, inbox, personas, info, quick, labels] = await Promise.all([loadLeadConfig(), loadInbox(), loadPersonas(), loadInfo(), loadQuickReplies(), loadLabels()])
  if (!config.ok || !inbox.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Inbox" />
        <div className="sheet-danger">{!config.ok ? config.reason : !inbox.ok ? inbox.reason : null}</div>
      </HvPage>
    )
  }
  const pick = c && inbox.data.some(x => x.id === c) ? c : inbox.data[0]?.id
  const thread = pick ? await loadThread(pick) : null
  return (
    <InboxView
      config={config.data}
      contacts={inbox.data}
      initialThread={thread?.ok ? thread.data : null}
      initialQuery={q?.slice(0, 80) ?? ''}
      canReply={canDo(user, 'leads', 'create')}
      canEdit={canDo(user, 'leads', 'edit')}
      canManage={canDo(user, 'leads', 'manage')}
      csName={user.name || 'Customer Service'}
      // An API key for the AI Agent (never its value) — without one the composer says so.
      aiConnected={!!process.env.ANTHROPIC_API_KEY}
      // General info for the composer's menu (null before its migration).
      info={info.ok ? info.data : null}
      // The Data Center's quick replies: "/shortcut" in the reply box (none before their migration).
      quick={quick.ok ? quick.data : []}
      // Customer Service's labels (none before mig 20261027190000).
      labels={labels.ok ? labels.data : []}
      // Brands whose AI agent is a copilot: their conversations offer an AI draft (none while its tables are not there).
      aiBrands={personas.ok ? personas.data.filter(p => p.mode === 'copilot').map(p => p.brandId) : []}
    />
  )
}
