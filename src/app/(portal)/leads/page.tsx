import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadInbox, loadLeadConfig, loadThread } from '@/lib/leads/server'
import InboxView from './_components/InboxView'

export const dynamic = 'force-dynamic'

/** Lead View › Inbox (2026-10-16, the design canvas "Lead View"). Lead View · View reads it; ?c= opens a conversation. */
export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requirePage('/leads')
  const user = await requirePermission('leads')
  const { c } = await searchParams
  const [config, inbox] = await Promise.all([loadLeadConfig(), loadInbox()])
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
      canReply={canDo(user, 'leads', 'create')}
      canEdit={canDo(user, 'leads', 'edit')}
      csName={user.name || 'Customer Service'}
    />
  )
}
