import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { canDo } from '@/lib/permission-actions'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { opensLeadAppOnPhone } from '@/lib/one-app'
import { loadInbox, loadLabels, loadLeadConfig, loadOutlets, loadThread, loadUnreadMarks } from '@/lib/leads/server'
import { withMetaUnread } from '@/lib/leads/inbox'
import { metaUnread } from '@/lib/leads/meta-sync'
import LeadApp from '@/components/lead-app/LeadApp'
import type { Tab } from '@/components/lead-app/vm'

export const dynamic = 'force-dynamic'

/**
 * Lead View on a phone (2026-11-28). Whoever holds Lead View opens it; each tab opens as its desktop page would
 * (Inbox = /leads, Leads = /leads/list), and what the chat writes follows the Inbox's own boxes — the writes are the
 * desktop's Server Actions, gated on /leads. `?c=` opens a chat, `?t=leads|profile` a tab.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string; t?: string }> }) {
  const user = await getUser()
  if (!user) redirect('/login?next=/lead-app')
  // Without Lead View (a Revenue member never holds it) the start sends them to their own face — it never sends here.
  if (!can(user, 'leads')) redirect('/')
  const { c, t } = await searchParams
  const open = { inbox: opensPage(user.tabs, '/leads'), leads: opensPage(user.tabs, '/leads/list') }
  // The Inbox's writes as its own boxes leave them (requirePage's narrowing, for this one page).
  const onInbox = { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed ?? [], '/leads') }
  const [config, inbox, labels, marks, outlets] = await Promise.all([loadLeadConfig(), loadInbox(), loadLabels(), loadUnreadMarks(), loadOutlets()])
  const contacts = inbox.ok ? inbox.data : []
  // Messenger's own unread counts, as the desktop Inbox reads them; Meta not answering keeps Lead View's.
  const pages = contacts.filter(x => x.channel === 'messenger' && !x.isTest && x.pageId).map(x => x.pageId as string)
  const pick = open.inbox && c && contacts.some(x => x.id === c) ? c : null
  const [counts, thread] = await Promise.all([metaUnread(pages, process.env.META_SYSTEM_USER_TOKEN?.trim()), pick ? loadThread(pick) : null])
  const tab: Tab = t === 'leads' || t === 'profile' ? t : 'inbox'
  return (
    <LeadApp
      config={config.ok ? config.data : { today: '', brands: [], waiting: 0, unhanded: 0 }}
      contacts={withMetaUnread(contacts, counts)}
      initialThread={thread?.ok ? thread.data : null}
      initialTab={tab}
      marked={marks.ok ? marks.data : []}
      labels={labels.ok ? labels.data : []}
      outlets={outlets.ok ? outlets.data : []}
      canReply={open.inbox && canDo(onInbox, 'leads', 'create')}
      canEdit={open.inbox && canDo(onInbox, 'leads', 'edit')}
      open={open}
      csName={user.name || 'Customer Service'}
      me={{ name: user.viewingAs?.name ?? user.name ?? '', sub: `${user.email} · Lead View` }}
      home={!opensLeadAppOnPhone(user)}
      canSwitch={!!user.canSwitchView && !user.viewingAs}
      viewingAs={user.viewingAs?.name ?? null}
      now={new Date().toISOString()}
      problem={!config.ok ? config.reason : !inbox.ok ? inbox.reason : null}
    />
  )
}
