'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assignLead, draftLeadReply, leadAgents, leadMediaLinks, markUnread, quickReplyUsed, reactToMessage, readThread, replyToLead, replyToMessage, sendLeadMedia, setDraftOutcome, type DraftForInbox } from '@/lib/leads/actions'
import { FILE_LIMIT, TOO_BIG } from '@/lib/leads/messenger'
import { createClient } from '@/lib/supabase/client'
import { insertQuick, quickMatches, type QuickReply } from '@/lib/leads/quick'
import { outcomeOf } from '@/lib/leads/ai'
import { adLabel, adsManagerLink } from '@/lib/leads/ads'
import { inboxState, type InboxState } from '@/lib/leads/handoff'
import { replyingNow, unreadLabel, mediaKind, isMediaPlaceholder, brandCounts, receiptOf, noteOf, runsOf, inMessengerOrder, mediaFileName, rowStatus, chatSub, bylineOf, type Receipt } from '@/lib/leads/inbox'
import { EMOJI_GROUPS, insertAt, withRecent } from '@/lib/leads/emoji'
import { dayLabel, timeOf, whenFull, whenShort } from '@/lib/leads/time'
import { formatPhone } from '@/lib/leads/phone'
import { editable } from '@/lib/leads/photo-edit'
import { setLeadUnread } from '@/lib/leads/unread-store'
import PhotoEditor from './PhotoEditor'
import ForwardDialog from './ForwardDialog'
import RichText from './RichText'
import type { LeadBrand, LeadConfig, LeadContact, LeadLabel, LeadMessage, LeadThread } from '@/lib/leads/types'
import { infoEntries, type LeadInfo } from '@/lib/leads/info'
import { LeadIcon } from '@/components/layout/lead-icons'
import { CHANNEL_LABEL, initials } from './bits'
import Popover from './ui/Popover'
import { MenuItem } from './ui/ContextMenu'
import CustomerPanel from './CustomerPanel'
import u from './ui/ui.module.css'
import s from './inbox.module.css'

/**
 * Lead View › Inbox (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2` §7.1 — `Lead View App.dc.html` lines
 * 52–195, value for value): the conversations (All brands, the filter, All · Waiting · Answered · Handed), the chat (the
 * assignee, ⋯, the bubbles, the pill composer), the customer, and the 44px rail whose history opens as a slide-over.
 *
 * Kept from before, where the drawn screen is least disturbed (the user, 2026-11-02: keep every earlier feature): the
 * brand numbers in the brand menu; search, Unread and the labels behind the filter icon; a message's Reply, React and
 * Forward on hover, quotes, reactions, media, Messenger's grey notes, the read ticks; the runs (one byline over, one time
 * under); Mark as unread closing the chat; who replies now, the ad's links and the Seen state in ⋯; the photo editor;
 * the emoji picker, the shortcuts ("/"), General info and the AI draft card over the composer.
 */

type Filter = InboxState | 'all'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'answered', label: 'Answered' },
  { id: 'handed', label: 'Handed' },
]
const LIST_REFRESH_MS = 15_000

export default function InboxView({
  config,
  contacts,
  initialThread,
  initialQuery = '',
  canReply,
  canEdit,
  canManage = false,
  csName,
  aiBrands,
  aiConnected,
  info,
  quick = [],
  labels = [],
  marked = [],
}: {
  config: LeadConfig
  contacts: LeadContact[]
  initialThread: LeadThread | null
  /** The header's search, handed in on the address (`?q=`). */
  initialQuery?: string
  canReply: boolean
  canEdit: boolean
  /** Lead View · Manage: may give a conversation to a CS (mig 20261027150000). */
  canManage?: boolean
  /** Who is signed in — the hand-over's text and the assignee name them. */
  csName: string
  /** Brands whose AI agent is a copilot. */
  aiBrands: string[]
  /** Is there an API key for the AI Agent at all? */
  aiConnected: boolean
  /** General info (null before its migration): the composer's book. */
  info: LeadInfo | null
  /** The Data Center's shortcuts: typing "/" in the reply box offers them. */
  quick?: QuickReply[]
  /** Customer Service's labels (mig 20261027190000; empty before it). */
  labels?: LeadLabel[]
  /** The chats this person marked unread to answer later (mig 20261028110000). */
  marked?: string[]
}) {
  const [brand, setBrand] = useState<string>('all')
  const [brandOpen, setBrandOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>(initialQuery ? 'all' : 'waiting')
  const [query, setQuery] = useState(initialQuery)
  const [label, setLabel] = useState<string>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [selected, setSelected] = useState<string | null>(initialThread?.contact.id ?? contacts[0]?.id ?? null)
  const [threads, setThreads] = useState<Record<string, LeadThread>>(initialThread ? { [initialThread.contact.id]: initialThread } : {})
  const [loading, startLoading] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  useEffect(() => { setQuery(initialQuery); if (initialQuery) setFilter('all') }, [initialQuery])

  // Read here since its last message (readThread marks it seen): its badge goes at once, before the list is read again.
  const [readAt, setReadAt] = useState<Record<string, string>>({})
  // Marked unread to answer later (mig 20261028110000): the server's list, with this screen's marks and opens over it.
  const [marks, setMarks] = useState<Set<string>>(() => new Set(marked))
  const markedKey = marked.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- markedKey stands for marked
  useEffect(() => { setMarks(new Set(marked)) }, [markedKey])
  const brands = useMemo(() => new Map(config.brands.map(b => [b.id, b])), [config.brands])
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/[\s-]/g, '')
  const labelsOf = (c: LeadContact) => threads[c.id]?.contact.labels ?? c.labels ?? []
  const found = contacts.filter(c => {
    if (label && !labelsOf(c).some(l => l.id === label)) return false
    if (unreadOnly && !(c.unread ?? 0) && !marks.has(c.id)) return false
    if (!q) return true
    const hay = `${c.name} ${c.phone ?? ''} ${c.phone ? formatPhone(c.phone) : ''} ${c.lastText} ${adLabel(c)}`.toLowerCase()
    return hay.includes(q) || (qDigits.length >= 3 && /^\d+$/.test(qDigits) && (c.phone ?? '').includes(qDigits))
  })
  const unreadOf = (c: LeadContact) => (marks.has(c.id) ? Math.max(1, c.unread ?? 0) : readAt[c.id] === c.lastAt ? 0 : c.unread)
  const stateOf = (c: LeadContact) => inboxState({ ...c, unread: unreadOf(c) })
  const perBrand = brandCounts(found.filter(c => filter === 'all' || stateOf(c) === filter))
  const searched = found.filter(c => brand === 'all' || c.brandId === brand)
  const counts = useMemo(() => {
    const n: Record<Filter, number> = { waiting: 0, answered: 0, handed: 0, all: searched.length }
    for (const c of searched) n[stateOf(c)]++
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stateOf reads readAt, listed
  }, [searched, readAt, marks])
  const shown = searched.filter(c => filter === 'all' || stateOf(c) === filter || c.id === selected)
  // The rail's Inbox dot: anything unread, kept for the shell (lib/leads/unread-store).
  const anyUnread = contacts.some(c => c.id !== selected && (unreadOf(c) ?? 0) > 0)
  useEffect(() => { setLeadUnread(anyUnread) }, [anyUnread])

  const load = useCallback((id: string) => {
    startLoading(async () => {
      const r = await readThread(id)
      if (!r.ok) setError(r.reason)
      else if (r.data) {
        setThreads(t => ({ ...t, [id]: r.data! }))
        setReadAt(m => ({ ...m, [id]: r.data!.contact.lastAt }))
        setMarks(m => { if (!m.has(id)) return m; const n = new Set(m); n.delete(id); return n })
      }
    })
  }, [])
  const pick = (id: string) => {
    setSelected(id)
    setError(null)
    window.history.replaceState(null, '', `/leads?c=${id}`)
    load(id)
  }
  // The list stays live: read again every 15 s while this tab is in view, and at once when it comes back.
  const router = useRouter()
  useEffect(() => {
    const fresh = () => { if (document.visibilityState === 'visible') router.refresh() }
    const timer = window.setInterval(fresh, LIST_REFRESH_MS)
    document.addEventListener('visibilitychange', fresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', fresh) }
  }, [router])
  const lastAt = contacts.find(c => c.id === selected)?.lastAt
  const seen = useRef(lastAt)
  useEffect(() => {
    if (selected && lastAt && seen.current !== lastAt) load(selected)
    seen.current = lastAt
  }, [lastAt, selected, load])

  const thread = selected ? threads[selected] ?? null : null
  // Mark as unread, to answer later: the chat closes (an open chat would read as seen again) and waits with a badge.
  const markLater = (id: string) => {
    startLoading(async () => {
      const r = await markUnread(id)
      if (!r.ok) { setError(r.reason); return }
      setMarks(m => new Set(m).add(id))
      setReadAt(m => { const n = { ...m }; delete n[id]; return n })
      setSelected(null)
      window.history.replaceState(null, '', '/leads')
    })
  }
  const contact = thread?.contact ?? contacts.find(c => c.id === selected) ?? null
  const brandOf = contact ? brands.get(contact.brandId) : undefined
  const brandLabel = brand === 'all' ? 'All brands' : brands.get(brand)?.name ?? 'All brands'
  const filtering = !!q || unreadOnly || !!label

  return (
    <div className={s.grid}>
      {/* ── Conversations ── */}
      <section className={s.card} aria-label="Conversations">
        <div className={s.listHead}>
          <div className={s.listTools}>
            <div className={s.brandWrap}>
              <button type="button" className={s.brandBtn} onClick={() => setBrandOpen(o => !o)} aria-haspopup="menu" aria-expanded={brandOpen}>
                <LeadIcon name="store" size={15} className={s.muteIcon} /><span>{brandLabel}</span><LeadIcon name="chevron-down" size={15} className={s.muteIcon} />
              </button>
              <Popover open={brandOpen} onClose={() => setBrandOpen(false)} style={{ top: 36, left: 0, right: 0 }} label="Brand">
                <MenuItem selected={brand === 'all'} count={perBrand.all ?? 0} onSelect={() => { setBrand('all'); setBrandOpen(false) }}>All brands</MenuItem>
                {config.brands.map(b => (
                  <MenuItem key={b.id} selected={brand === b.id} count={perBrand[b.id] ?? 0} onSelect={() => { setBrand(b.id); setBrandOpen(false) }}>{b.name}</MenuItem>
                ))}
              </Popover>
            </div>
            <div className={s.filterWrap}>
              <button type="button" className={s.filterBtn} data-on={filtering || undefined} title="Filters" aria-label="Filters" aria-expanded={filterOpen} onClick={() => setFilterOpen(o => !o)}>
                <LeadIcon name="sliders-horizontal" size={15} />
              </button>
              <Popover open={filterOpen} onClose={() => setFilterOpen(false)} style={{ top: 36, right: 0 }} className={s.filterPop} label="Filters">
                <label className={s.filterSearch}>
                  <LeadIcon name="search" size={14} />
                  <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone, message or ad" aria-label="Search conversations" autoFocus />
                </label>
                <div className={s.filterChips} role="group" aria-label="Quick filters">
                  <button type="button" className={s.filterChip} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(v => !v)}>Unread</button>
                  {labels.map(l => (
                    <button key={l.id} type="button" className={s.filterChip} aria-pressed={label === l.id} onClick={() => setLabel(cur => (cur === l.id ? '' : l.id))}>{l.name}</button>
                  ))}
                </div>
              </Popover>
            </div>
          </div>
          <div className={s.tabs} role="group" aria-label="Where they stand">
            {FILTERS.map(f => (
              <button key={f.id} type="button" className={s.tab} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}<span className={s.tabCount} data-waiting={f.id === 'waiting' || undefined}>{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={s.rows}>
          {shown.length === 0 ? (
            <div className={s.empty}>{contacts.length === 0 ? 'No conversations yet' : 'Nothing here'}</div>
          ) : shown.map(c => {
            const st = stateOf(c)
            const unread = c.id === selected ? 0 : unreadOf(c)
            const status = rowStatus(c, st)
            const tags = [...labelsOf(c).map(l => l.name), ...(c.isTest ? ['Test'] : [])]
            return (
              <button key={c.id} type="button" className={s.row} aria-current={c.id === selected} onClick={() => pick(c.id)}>
                <span className={s.avatar} aria-hidden="true">{initials(c.name)}</span>
                <span className={s.rowBody}>
                  <span className={s.rowTop}>
                    <span className={s.rowName} data-waiting={st === 'waiting' || undefined}>{c.name || '—'}</span>
                    <span className={s.rowTime} data-unread={unread ? '' : undefined}>{whenShort(c.lastAt, config.today)}</span>
                  </span>
                  <span className={s.rowMid}>
                    <span className={s.rowLast}>{c.lastText}</span>
                    {unread ? <span className={s.badge} aria-label={`${unread} unread`}>{unreadLabel(unread)}</span> : null}
                  </span>
                  <span className={s.rowFoot}>
                    <span className={s.rowStatus} data-tone={status.tone}>{status.text}</span>
                    {tags.length ? <span className={s.rowLabels}>· {tags.join(' · ')}</span> : null}
                    <span className={s.fill} />
                    <span className={s.rowBrand}>{brands.get(c.brandId)?.name ?? '—'}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── The chat ── */}
      <section className={s.card} aria-label="Chat">
        {contact ? (
          <Chat key={contact.id} contact={contact} thread={thread} brand={brandOf} csName={csName}
            canReply={canReply} canManage={canManage} aiOn={aiBrands.includes(contact.brandId)} aiConnected={aiConnected} info={info} quick={quick} today={config.today}
            loading={loading && !thread} onSent={() => load(contact.id)}
            others={contacts.filter(c => c.id !== contact.id)} brands={brands} onMarkUnread={() => markLater(contact.id)} />
        ) : (
          <div className={s.empty}>Pick a conversation</div>
        )}
        {error ? <div className={s.error} role="alert" style={{ margin: 12 }}>{error}</div> : null}
      </section>

      {/* ── The customer ── */}
      <section className={s.card} aria-label="Customer">
        {contact ? (
          <CustomerPanel key={contact.id} contact={thread?.contact ?? contact} brand={brandOf} labels={labels} canManage={canManage}
            canEdit={canEdit} csName={csName} onSaved={() => load(contact.id)} />
        ) : null}
      </section>

      {/* ── The rail: the history, as a slide-over ── */}
      <div className={s.rail}>
        <button type="button" className={s.railBtn} title="Audit log" aria-label="Audit log" aria-expanded={logOpen} onClick={() => setLogOpen(o => !o)}>
          <LeadIcon name="history" size={16} />
        </button>
      </div>
      {logOpen ? (
        <aside className={s.log} aria-label="Audit log">
          <div className={s.logHead}>
            <LeadIcon name="history" size={16} className={s.muteIcon} /><span className={s.logTitle}>Audit log</span>
            <button type="button" className={s.logClose} title="Collapse" aria-label="Collapse" onClick={() => setLogOpen(false)}><LeadIcon name="chevrons-right" size={16} /></button>
          </div>
          <div className={s.logBody}>
            {!contact ? <span className={s.eventAt}>Pick a chat</span>
              : !(thread?.events ?? []).length ? <span className={s.eventAt}>Nothing here</span>
              : (thread?.events ?? []).map((e, i) => (
                <div key={i} className={s.event}>
                  <div className={s.eventRail}><span className={s.eventDot} /><span className={s.eventLine} /></div>
                  <div className={s.eventText}>
                    <span>{e.what}{e.by ? ` · ${e.by}` : ''}</span>
                    <span className={s.eventAt}>{whenFull(e.at)}</span>
                  </div>
                </div>
              ))}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

function Chat({ contact, thread, brand, csName, canReply, canManage, aiOn, aiConnected, info, quick, today, loading, onSent, others, brands, onMarkUnread }: {
  contact: LeadContact
  thread: LeadThread | null
  brand: LeadBrand | undefined
  csName: string
  canReply: boolean
  canManage: boolean
  aiOn: boolean
  aiConnected: boolean
  info: LeadInfo | null
  quick: QuickReply[]
  today: string
  loading: boolean
  onSent: () => void
  others: LeadContact[]
  brands: Map<string, LeadBrand>
  onMarkUnread: () => void
}) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<File | null>(null)
  const [forwarding, setForwarding] = useState<LeadMessage | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const replyBox = useRef<HTMLTextAreaElement>(null)
  const putEmoji = (emoji: string) => {
    const box = replyBox.current
    const r = insertAt(text, box?.selectionStart ?? text.length, box?.selectionEnd ?? text.length, emoji)
    setText(r.text.slice(0, 2000))
    requestAnimationFrame(() => { box?.focus(); box?.setSelectionRange(r.caret, r.caret) })
  }
  // "/word" at the end of the reply box: the Data Center's shortcuts it may mean.
  const qm = useMemo(() => quickMatches(text, quick, contact.brandId), [text, quick, contact.brandId])
  const putQuick = (r: QuickReply) => {
    if (!qm) return
    setText(t => insertQuick(t, qm.typed, r.body))
    void quickReplyUsed(r.id)
  }
  const [sending, startSending] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftForInbox | null>(null)
  const [used, setUsed] = useState<DraftForInbox | null>(null)
  const [drafting, startDrafting] = useTransition()
  const [replyingTo, setReplyingTo] = useState<LeadMessage | null>(null)
  const [reacting, setReacting] = useState<number | null>(null)
  const byMid = useMemo(() => new Map((thread?.messages ?? []).filter(m => m.mid).map(m => [m.mid!, m])), [thread])
  const react = (m: LeadMessage, emoji: string | null) => {
    setReacting(null)
    setError(null)
    startSending(async () => {
      const r = await reactToMessage(m.id, emoji)
      if (!r.ok) { setError(r.reason); return }
      onSent()
    })
  }
  const scroller = useRef<HTMLDivElement>(null)
  const ordered = useMemo(() => inMessengerOrder(thread?.messages ?? []), [thread])
  const runs = useMemo(() => runsOf(ordered, iso => dayLabel(iso)), [ordered])
  const count = thread?.messages.length ?? 0
  const photoPick = useRef<HTMLInputElement>(null)
  const filePick = useRef<HTMLInputElement>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const paths = useMemo(() => (thread?.messages ?? []).map(m => m.mediaPath).filter((x): x is string => !!x), [thread])
  useEffect(() => {
    const missing = paths.filter(x => !links[x])
    if (!missing.length) return
    void leadMediaLinks(missing).then(r => { if (r.ok) setLinks(l => ({ ...l, ...r.data })) })
  }, [paths, links])
  // Auto-scroll to the newest message whenever the messages change (README §4.5).
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight }, [count])
  // The reply box grows with its words, as the pill does.
  useEffect(() => {
    const box = replyBox.current
    if (!box) return
    box.style.height = '0px'
    box.style.height = `${box.scrollHeight}px`
  }, [text])

  const now = replyingNow(contact, csName)
  const botOn = now.kind !== 'cs'
  const state = inboxState({ ...contact, unread: 0 })
  const ad = adLabel(contact)
  const manager = adsManagerLink(contact.adAccount ?? '', contact.adId ?? '')
  const first = (contact.name || '').trim().split(/\s+/)[0] || 'the customer'

  const send = () => {
    const body = text.trim()
    if (!body || sending || botOn) return
    setError(null)
    startSending(async () => {
      const r = replyingTo ? await replyToMessage(contact.id, body, replyingTo.id) : await replyToLead(contact.id, body)
      if (!r.ok) { setError(r.reason); return }
      if (used) void setDraftOutcome(used.id, outcomeOf(used.reply, body), body)
      setUsed(null)
      setReplyingTo(null)
      setText('')
      onSent()
      if (r.data.notSent) setError('Saved but not sent: ' + r.data.notSent)
    })
  }
  // A still photo opens the editor first; anything else goes as picked.
  const pickFile = (file: File | undefined) => {
    if (!file || sending || botOn) return
    setError(null)
    if (editable(file)) setEditing(file)
    else sendFile(file)
  }
  const sendFile = (file: File | undefined) => {
    if (!file || sending || botOn) return
    setError(null)
    if (file.size > FILE_LIMIT) { setError(TOO_BIG); return }
    const caption = text.trim()
    startSending(async () => {
      const name = file.name.replace(/[\\/]/g, '_').slice(-120) || 'file'
      const path = `chat/${contact.id}/${crypto.randomUUID()}-${name}`
      const up = await createClient().storage.from('lead-media').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (up.error) { setError('The file could not be uploaded — 25 MB at most.'); return }
      const r = await sendLeadMedia(contact.id, path, file.type || 'application/octet-stream', caption)
      if (!r.ok) { setError(r.reason); return }
      setText('')
      setEditing(null)
      onSent()
      if (r.data.notSent) setError('Saved but not sent: ' + r.data.notSent)
    })
  }
  const askDraft = () => {
    setError(null)
    startDrafting(async () => {
      const r = await draftLeadReply(contact.id)
      if (!r.ok) setError(r.reason)
      else setDraft(r.data)
    })
  }
  const useDraft = () => {
    if (!draft) return
    setText(draft.reply)
    setUsed(draft)
    setDraft(null)
  }
  const dismissDraft = () => {
    if (!draft) return
    void setDraftOutcome(draft.id, 'dismissed')
    setDraft(null)
  }
  const aiTitle = !aiConnected ? 'AI not connected (no API key)' : !aiOn ? 'Set up this brand’s AI Agent first (AI Agent › Save)' : 'The AI writes a draft; you edit and send it'

  return (
    <>
      <div className={s.chatHead}>
        <span className={s.chatAvatar} aria-hidden="true">{initials(contact.name)}</span>
        <div className={s.who}>
          <span className={s.whoName}>{contact.name || '—'}</span>
          <span className={s.whoSub}>{chatSub(brand?.name ?? '', CHANNEL_LABEL[contact.channel], ad, dayLabel(contact.createdAt))}</span>
        </div>
        <Assignee contact={thread?.contact ?? contact} canManage={canManage} onChanged={onSent} />
        <div className={s.anchor}>
          <button type="button" className={s.more} title="More" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <LeadIcon name="ellipsis" size={18} />
          </button>
          {menuOpen ? (
            <>
              <div className={s.catcher} onClick={() => setMenuOpen(false)} onContextMenu={e => { e.preventDefault(); setMenuOpen(false) }} aria-hidden="true" />
              <div className={s.moreMenu} role="menu">
                <button type="button" role="menuitem" className={s.moreItem} onClick={() => { setMenuOpen(false); onMarkUnread() }}>
                  <LeadIcon name="mail" size={16} className={s.moreIcon} />Mark as unread
                </button>
                {contact.adLink || manager ? <div className={s.moreSep} /> : null}
                {contact.adLink ? (
                  <a role="menuitem" className={s.moreItem} href={contact.adLink} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                    <LeadIcon name="external-link" size={16} className={s.moreIcon} />View the ad
                  </a>
                ) : null}
                {manager ? (
                  <a role="menuitem" className={s.moreItem} href={manager} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                    <LeadIcon name="external-link" size={16} className={s.moreIcon} />Open in Ads Manager
                  </a>
                ) : null}
                <div className={s.moreSep} />
                <div className={s.moreHead}>NOW</div>
                <button type="button" role="menuitem" className={s.moreItem} disabled>
                  <LeadIcon name={botOn ? 'workflow' : 'headset'} size={16} className={s.moreIcon} />{now.label}
                </button>
                <button type="button" role="menuitem" className={s.moreItem} disabled>
                  <LeadIcon name="circle-dot" size={16} className={s.moreIcon} />{state === 'answered' && contact.lastDir === 'in' ? 'Seen' : state === 'waiting' ? 'Waiting' : state === 'handed' ? 'Handed' : 'Answered'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className={s.messages} ref={scroller} data-runs="">
        <div style={{ flex: 1 }} />
        {loading ? <div className={s.empty}>Loading…</div> : null}
        {ordered.map((m, i, all) => {
          const day = dayLabel(m.at)
          const newDay = i === 0 || dayLabel(all[i - 1].at) !== day
          const note = noteOf(m)
          const run = runs[i]
          const gap = i === 0 ? 0 : run.first || note || newDay ? 12 : 4
          const dayRule = newDay ? (
            <div className={s.dayRule}><span className={s.dayLine} /><span className={s.dayText}>{day}</span><span className={s.dayLine} /></div>
          ) : null
          if (note) {
            return (
              <div key={m.id} className={s.msgBlock} style={{ marginTop: gap }}>
                {dayRule}
                <div className={s.note}>{note} · {timeOf(m.at)}</div>
              </div>
            )
          }
          const out = m.direction === 'out'
          const media = m.mediaPath || m.mediaUrl
          return (
            <div key={m.id} className={s.msgBlock} style={{ marginTop: gap }}>
              {dayRule}
              <div className={s.msg} data-out={out || undefined}>
                {out && run.first ? <span className={s.byline}>{bylineOf(m)}</span> : null}
                {m.replyToMid ? <Quote m={byMid.get(m.replyToMid) ?? null} /> : null}
                {media ? <MessageMedia m={m} link={m.mediaPath ? links[m.mediaPath] : m.mediaUrl ?? undefined} /> : null}
                <div className={s.bubbleRow}>
                  {media && isMediaPlaceholder(m.body) ? null : <div className={s.bubble}><RichText text={m.body} /></div>}
                  {canReply && m.mid && !contact.isTest ? (
                    <span className={s.msgActions}>
                      {!out ? (
                        <span className={s.reactWrap}>
                          <button type="button" className={s.msgAction} title="React" aria-label="React" onClick={() => setReacting(r => (r === m.id ? null : m.id))} disabled={sending}><LeadIcon name="smile" size={15} /></button>
                          {reacting === m.id ? (
                            <>
                              <div className={s.catcher} onClick={() => setReacting(null)} aria-hidden="true" />
                              <div className={s.reactMenu} role="menu" aria-label="React">
                                {QUICK_REACTIONS.map(e => (
                                  <button key={e} type="button" className={s.emojiBtn} aria-pressed={m.reaction === e} onClick={() => react(m, m.reaction === e ? null : e)}>{e}</button>
                                ))}
                                {m.reaction ? <button type="button" className={s.textBtn} onClick={() => react(m, null)}>Remove</button> : null}
                              </div>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                      <button type="button" className={s.msgAction} title="Reply" aria-label="Reply" onClick={() => { setReplyingTo(m); replyBox.current?.focus() }}><LeadIcon name="reply" size={15} /></button>
                      <button type="button" className={s.msgAction} title="Forward" aria-label="Forward" onClick={() => setForwarding(m)}><LeadIcon name="forward" size={15} /></button>
                    </span>
                  ) : null}
                </div>
                {m.reaction ? <span className={s.reaction} title="The Page's reaction">{m.reaction}</span> : null}
                {m.buttons?.length ? <div className={s.buttons}>{m.buttons.map(b => <span key={b} style={{ whiteSpace: 'nowrap' }}>↳ {b}</span>)}</div> : null}
                {m.phoneFound ? <span className={s.found}>Phone found · {formatPhone(m.phoneFound)}</span> : null}
                {run.last || (out && m.delivery !== 'sent') ? (
                  <span className={s.time}>
                    {timeOf(m.at)}
                    {out && m.delivery !== 'sent' ? <span className={s.timeWarn}>· {m.delivery === 'recorded' ? 'recorded' : 'not sent'}</span> : null}
                    <Ticks r={receiptOf(m, thread?.contact ?? contact)} />
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {editing ? <PhotoEditor file={editing} busy={sending} onCancel={() => setEditing(null)} onSend={f => sendFile(f)} /> : null}
      {forwarding ? (
        <ForwardDialog message={forwarding} others={others} brands={brands} onClose={() => setForwarding(null)}
          onDone={note => { setForwarding(null); setNotice(note) }} />
      ) : null}

      {canReply ? (
        <div className={s.composeArea}>
          {notice ? <div className={s.replyBar} role="status" onClick={() => setNotice(null)}>{notice}</div> : null}
          {error ? <div className={s.error} role="alert">{error}</div> : null}
          {replyingTo ? (
            <div className={s.replyBar}>
              <span className={s.replyBarText}>
                <span className={s.replyBarWho}>Replying to {replyingTo.direction === 'in' ? (contact.name || 'the customer') : 'the Page'}</span>
                <span className={s.ellipsis}>{replyingTo.body}</span>
              </span>
              <button type="button" className={s.x} onClick={() => setReplyingTo(null)} aria-label="Cancel the reply"><LeadIcon name="x" size={14} /></button>
            </div>
          ) : null}
          {draft ? (
            <div className={s.draft}>
              <div className={s.draftHead}>
                <LeadIcon name="sparkles" size={14} />AI draft · not sent
                <span className={s.draftUsed}>Used: {draft.used.length ? draft.used.map(x => x.title).join(', ') : 'none'}</span>
              </div>
              {draft.handoff || draft.note ? <div className={s.draftFlag}>{draft.handoff ? 'A person should take over' : ''}{draft.handoff && draft.note ? ' · ' : ''}{draft.note}</div> : null}
              <div className={s.draftText}>{draft.reply}</div>
              <div className={s.draftRow}>
                <button type="button" className={`${u.positive} ${u.small}`} onClick={useDraft}>Use</button>
                <button type="button" className={`${u.ghost} ${u.small}`} onClick={askDraft} disabled={drafting}>{drafting ? 'Drafting…' : 'Another'}</button>
                <button type="button" className={`${u.ghost} ${u.small}`} onClick={dismissDraft}>Dismiss</button>
              </div>
            </div>
          ) : null}
          {used ? <span className={s.composeNote}>From an AI draft — check it before sending.</span> : null}
          <div className={s.composer}>
            <Popover open={!!(qm && qm.matches.length && !botOn)} onClose={() => setText(t => t + ' ')} className={`${s.popUp} ${s.quickMenu}`} label="Shortcuts">
              {(qm?.matches ?? []).slice(0, 6).map(r => (
                <button key={r.id} type="button" role="option" aria-selected={false} className={`${u.menuItem} ${s.quickItem}`} onMouseDown={e => e.preventDefault()} onClick={() => putQuick(r)}>
                  <span className={s.quickKey}>{r.shortcut}</span><span className={s.quickText}>{r.body}</span>
                </button>
              ))}
            </Popover>
            <div className={s.composerTools}>
              <button type="button" className={s.tool} title="File" aria-label="File" disabled={botOn || sending} onClick={() => filePick.current?.click()}><LeadIcon name="paperclip" size={18} /></button>
              <button type="button" className={s.tool} title="Photo or video" aria-label="Photo or video" disabled={botOn || sending} onClick={() => photoPick.current?.click()}><LeadIcon name="image" size={18} /></button>
              <button type="button" className={s.tool} title="Emoji" aria-label="Emoji" disabled={botOn || sending} aria-expanded={emojiOpen} onClick={() => setEmojiOpen(o => !o)}><LeadIcon name="smile" size={18} /></button>
              <input ref={photoPick} type="file" accept="image/*,video/*" hidden onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
              <input ref={filePick} type="file" hidden onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <EmojiMenu open={emojiOpen} onClose={() => setEmojiOpen(false)} onPick={putEmoji} />
            <textarea ref={replyBox} className={s.reply} rows={1} value={text} onChange={e => setText(e.target.value)} maxLength={2000} disabled={botOn}
              aria-label="Reply" placeholder={botOn ? `${now.label} is replying` : `Type your reply to ${first}, or / for shortcuts`}
              onKeyDown={e => {
                // Tab takes the first shortcut offered; Enter sends, Shift+Enter starts a new line.
                if (e.key === 'Tab' && qm?.matches.length && !botOn) { e.preventDefault(); putQuick(qm.matches[0]); return }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
              }} />
            <button type="button" className={s.infoBtn} title="General info" aria-label="General info" disabled={botOn || !info} aria-expanded={infoOpen} onClick={() => setInfoOpen(o => !o)}><LeadIcon name="book-open" size={18} /></button>
            <InfoMenu open={infoOpen} info={info} brandId={contact.brandId} today={today} onClose={() => setInfoOpen(false)}
              onInsert={(v, whole) => setText(t => (whole ? (t ? t.replace(/\s*$/, '') + '\n\n' : '') + v : t + (t && !/\s$/.test(t) ? ' ' : '') + v))} />
            {!draft ? (
              <button type="button" className={s.aiPill} onClick={askDraft} disabled={drafting || botOn || !aiOn || !aiConnected} title={aiTitle}>
                <LeadIcon name="sparkles" size={14} />{drafting ? 'Drafting…' : 'AI draft'}
              </button>
            ) : null}
            <button type="button" className={s.send} title="Send" aria-label="Send" onClick={send} disabled={sending || botOn || !text.trim()}><LeadIcon name="arrow-up" size={18} /></button>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** The assignee (the reference's "Mei Ling" chip): the CS who handles the chat; Lead View · Manage may give it to another. */
function Assignee({ contact, canManage, onChanged }: { contact: LeadContact; canManage: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }> | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const label = contact.assignedTo ? (contact.assignedName || 'A colleague') : 'No CS yet'
  const body = <><LeadIcon name="headset" size={15} className={s.assigneeIcon} />{label}<LeadIcon name="chevron-down" size={14} className={s.assigneeChev} /></>
  if (!canManage) return <span className={s.assignee} title="Who handles this chat">{body}</span>
  const toggle = () => {
    setOpen(o => !o)
    if (!agents) void leadAgents().then(r => { if (r.ok) setAgents(r.data); else setError(r.reason) })
  }
  const give = (id: string | null) => start(async () => {
    setError(null)
    const r = await assignLead(contact.id, id)
    if (!r.ok) { setError(r.reason); return }
    setOpen(false)
    onChanged()
  })
  return (
    <span className={s.anchor}>
      <button type="button" className={s.assignee} onClick={toggle} aria-haspopup="menu" aria-expanded={open} disabled={busy} title="Give this chat to a CS">{body}</button>
      <Popover open={open} onClose={() => setOpen(false)} style={{ top: 38, right: 0 }} label="Give this chat to">
        {agents === null && !error ? <div className={s.moreHead}>Loading…</div> : null}
        {(agents ?? []).map(a => (
          <MenuItem key={a.id} selected={contact.assignedTo === a.id} disabled={busy} onSelect={() => give(a.id)}>{a.name}</MenuItem>
        ))}
        <MenuItem selected={!contact.assignedTo} disabled={busy} onSelect={() => give(null)}>Nobody</MenuItem>
        {error ? <div className={s.moreHead} role="alert">{error}</div> : null}
      </Popover>
    </span>
  )
}

/** A message's photo, video or file: shown in place; a file opens in a tab. */
function MessageMedia({ m, link }: { m: LeadMessage; link: string | undefined }) {
  const kind = mediaKind(m.mediaMime, m.body)
  const [gone, setGone] = useState(false)
  const what = kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : kind === 'audio' ? 'Voice message' : 'File'
  if (!link) return <div className={s.mediaWait}>{what} · loading…</div>
  if (gone) return <div className={s.mediaWait}>{what} · no longer available</div>
  // A short-lived signed link (or Meta's): nothing for next/image to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  if (kind === 'image') return <a href={link} target="_blank" rel="noopener noreferrer"><img className={s.media} src={link} alt={m.body} onError={() => setGone(true)} /></a>
  if (kind === 'video') return <video className={s.media} src={link} controls preload="metadata" onError={() => setGone(true)} />
  if (kind === 'audio') return <audio className={s.mediaAudio} src={link} controls preload="metadata" onError={() => setGone(true)} />
  return <a className={s.mediaFile} href={link} target="_blank" rel="noopener noreferrer"><LeadIcon name="paperclip" size={14} />{mediaFileName(m)}</a>
}

/** Quick reactions, as Messenger's row; the Page's emoji on a customer's message (mig 20261027220000). */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

/** The message a reply answers, quoted above it. */
function Quote({ m }: { m: LeadMessage | null }) {
  return (
    <div className={s.quote}>
      <span>↩ {m ? (m.direction === 'in' ? 'Customer' : 'Page') : 'Replied to a message'}</span>
      {m ? <span className={s.quoteText}>{m.body}</span> : null}
    </div>
  )
}

/** ✓ sent, ✓✓ delivered, blue ✓✓ read — from Meta's receipts. */
function Ticks({ r }: { r: Receipt | null }) {
  if (r !== 'sent' && r !== 'delivered' && r !== 'read') return null
  const title = r === 'read' ? 'Read' : r === 'delivered' ? 'Delivered' : 'Sent'
  return <span className={s.ticks} data-r={r} title={title} aria-label={title}>{r === 'sent' ? '✓' : '✓✓'}</span>
}

const RECENT_KEY = 'lead-emoji-recent'

/** The composer's emoji: the viewer's recent ones, then the groups. Stays open for several. */
function EmojiMenu({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (emoji: string) => void }) {
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); setRecent(Array.isArray(r) ? r.filter((e): e is string => typeof e === 'string').slice(0, 8) : []) } catch { setRecent([]) }
  }, [open])
  const pick = (emoji: string) => {
    onPick(emoji)
    const next = withRecent(recent, emoji)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* a private window: no recent row */ }
  }
  const groups = recent.length ? [{ name: 'Recent', emoji: recent }, ...EMOJI_GROUPS] : EMOJI_GROUPS
  return (
    <Popover open={open} onClose={onClose} className={`${s.popUp} ${s.emojiMenu}`} label="Emoji">
      {groups.map(g => (
        <div key={g.name}>
          <div className={u.menuHead}>{g.name}</div>
          <div className={s.emojiGrid}>
            {g.emoji.map(e => (
              <button key={e} type="button" className={s.emojiBtn} onMouseDown={ev => ev.preventDefault()} onClick={() => pick(e)} aria-label={e}>{e}</button>
            ))}
          </div>
        </div>
      ))}
    </Popover>
  )
}

/** The composer's General info (the book): a card's head inserts it whole, a line inserts its value. */
function InfoMenu({ open, info, brandId, today, onClose, onInsert }: {
  open: boolean
  info: LeadInfo | null
  brandId: string
  today: string
  onClose: () => void
  onInsert: (value: string, whole: boolean) => void
}) {
  const entries = info ? infoEntries(info, brandId, today) : []
  return (
    <Popover open={open && !!info} onClose={onClose} className={`${s.popUp} ${s.infoPanel}`} style={{ left: 'auto', right: 0 }} label="General info">
      <div className={s.infoHead}>
        <span className={s.infoTitle}>General info</span>
        <span className={s.infoHint}>Insert a card, or one line</span>
        <a className={s.link} href="/leads/info">Edit in General info ↗</a>
      </div>
      <div className={s.infoGrid}>
        {entries.length === 0 ? <div className={s.empty}>Nothing in use</div> : entries.map(e => (
          <div key={e.card.id} className={s.infoCard}>
            <button type="button" className={s.infoCardHead} title="Insert the whole card"
              onClick={() => { onInsert(e.card.name + '\n' + e.fields.map(f => `${f.label}: ${f.value}`).join('\n'), true); onClose() }}>
              <span>{e.card.name || e.card.code}</span>
              <span className={s.infoInsert}><LeadIcon name="plus" size={12} />Insert</span>
            </button>
            {e.fields.map(f => (
              <button key={f.token} type="button" className={s.infoLine} title="Insert this line" onClick={() => { onInsert(f.value, false); onClose() }}>
                <span className={s.infoLabel}>{f.label}</span>
                <span className={s.infoValue}>{f.value}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Popover>
  )
}
