'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assignLead, draftLeadReply, leadAgents, leadMediaLinks, quickReplyUsed, reactToMessage, readThread, replyToLead, replyToMessage, sendLeadMedia, setDraftOutcome, type DraftForInbox } from '@/lib/leads/actions'
import { FILE_LIMIT, TOO_BIG } from '@/lib/leads/messenger'
import { createClient } from '@/lib/supabase/client'
import { insertQuick, quickMatches, type QuickReply } from '@/lib/leads/quick'
import { outcomeOf } from '@/lib/leads/ai'
import { adLabel, adsManagerLink } from '@/lib/leads/ads'
import { inboxState, type InboxState } from '@/lib/leads/handoff'
import { LAYOUT_KEY, LIST_W, LOG_W, PANELS_KEY, RIGHT_W, clampWidth, readLayout, readPanels, replyingNow, unreadLabel, mediaKind, isMediaPlaceholder, brandCounts, receiptOf, type Receipt, type InboxLayout, type InboxPanels } from '@/lib/leads/inbox'
import { EMOJI_GROUPS, insertAt, withRecent } from '@/lib/leads/emoji'
import { whenFull } from '@/lib/leads/time'
import { formatPhone } from '@/lib/leads/phone'
import { dayLabel, timeOf, whenShort } from '@/lib/leads/time'
import type { LeadBrand, LeadConfig, LeadContact, LeadLabel, LeadMessage, LeadThread } from '@/lib/leads/types'
import { infoEntries, type LeadInfo } from '@/lib/leads/info'
import { LeadIcon } from '@/components/layout/lead-icons'
import { CHANNEL_LABEL, initials } from './bits'
import CustomerCard from './CustomerCard'
import s from './inbox.module.css'

/**
 * Lead View › Inbox v2 (2026-10-22, the redesign v2 handoff `Inbox v2.dc.html` — the user: "照 claude design 最新版本").
 * Three columns whose two edges drag (kept in the browser, `inboxv2-layout`): the conversations (brand, search,
 * where they stand), the chat (who replies NOW, where the customer came from, the messages, the composer with the
 * AI draft) and the customer (the phone card, the hand-over, what the salesperson needs, the timeline).
 *
 * Messenger is connected (2026-10-26): a brand’s Page brings its customers in, and a reply is recorded, then sent through
 * Meta — a reply Meta refused says why under it. Instagram is not connected yet.
 * What the handoff draws that needs the database first is drawn and held, saying so: switching who replies, photos
 * and files. The General info menu inserts the brand's live cards (step 3).
 */

type Filter = InboxState | 'all'
// All first (the user, 2026-10-27); the list still opens on Waiting.
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'answered', label: 'Answered' },
  { id: 'handed', label: 'Handed' },
]
const LIST_REFRESH_MS = 15_000
const STATE_LABEL: Readonly<Record<InboxState, string>> = { waiting: 'Waiting', answered: 'Answered', handed: 'Handed' }

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
}: {
  config: LeadConfig
  contacts: LeadContact[]
  initialThread: LeadThread | null
  /** The top bar's search, handed in on the address (`?q=`). */
  initialQuery?: string
  canReply: boolean
  canEdit: boolean
  /** Lead View · Manage: may give a conversation to a CS (mig 20261027150000). */
  canManage?: boolean
  /** Who is signed in — the hand-over's text and the NOW pill name them. */
  csName: string
  /** Brands whose AI agent is a copilot. */
  aiBrands: string[]
  /** Is there an API key for the AI Agent at all? */
  aiConnected: boolean
  /** General info (null before its migration): the composer's menu. */
  info: LeadInfo | null
  /** The Data Center's quick replies: typing "/" in the reply box offers them. */
  quick?: QuickReply[]
  /** Customer Service's labels (mig 20261027190000; empty before it). */
  labels?: LeadLabel[]
}) {
  const [brand, setBrand] = useState<string>('all')
  const [filter, setFilter] = useState<Filter>(initialQuery ? 'all' : 'waiting')
  const [query, setQuery] = useState(initialQuery)
  const [label, setLabel] = useState<string>('')
  // Quick filters, as Business Suite's chips (the user, 2026-10-27): Unread, and one label at a time — a click again clears.
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [selected, setSelected] = useState<string | null>(initialThread?.contact.id ?? contacts[0]?.id ?? null)
  const [threads, setThreads] = useState<Record<string, LeadThread>>(initialThread ? { [initialThread.contact.id]: initialThread } : {})
  const [loading, startLoading] = useTransition()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setQuery(initialQuery); if (initialQuery) setFilter('all') }, [initialQuery])

  // The columns' widths: the handoff's until the browser has kept others.
  const [layout, setLayout] = useState<InboxLayout>({ listW: LIST_W.start, rightW: RIGHT_W.start })
  useEffect(() => {
    try { setLayout(readLayout(window.localStorage.getItem(LAYOUT_KEY))) } catch { /* a private window keeps the handoff's */ }
  }, [])
  const drag = useDrag(layout, setLayout)
  // The customer panel opens, the timeline folds, until this browser kept otherwise.
  const [panels, setPanels] = useState<InboxPanels>({ card: true, log: false })
  useEffect(() => {
    try { setPanels(readPanels(window.localStorage.getItem(PANELS_KEY))) } catch { /* a private window keeps the defaults */ }
  }, [])
  const togglePanel = (k: keyof InboxPanels) => setPanels(p => {
    const next = { ...p, [k]: !p[k] }
    try { window.localStorage.setItem(PANELS_KEY, JSON.stringify(next)) } catch { /* not kept in a private window */ }
    return next
  })
  const RAIL = 40
  const cardW = panels.card ? layout.rightW : RAIL
  const logW = panels.log ? LOG_W : RAIL

  const brands = useMemo(() => new Map(config.brands.map(b => [b.id, b])), [config.brands])
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/[\s-]/g, '')
  // A customer's labels: the open conversation's as just read (a label set a moment ago), else the list's.
  const labelsOf = (c: LeadContact) => threads[c.id]?.contact.labels ?? c.labels ?? []
  const found = contacts.filter(c => {
    if (label && !labelsOf(c).some(l => l.id === label)) return false
    if (unreadOnly && !(c.unread ?? 0)) return false
    if (!q) return true
    const hay = `${c.name} ${c.phone ?? ''} ${c.phone ? formatPhone(c.phone) : ''} ${c.lastText} ${adLabel(c)}`.toLowerCase()
    return hay.includes(q) || (qDigits.length >= 3 && /^\d+$/.test(qDigits) && (c.phone ?? '').includes(qDigits))
  })
  // Each brand's number: its conversations under the status tab picked (the user: numbers beside the brands).
  const perBrand = brandCounts(found.filter(c => filter === 'all' || inboxState(c) === filter))
  const searched = found.filter(c => brand === 'all' || c.brandId === brand)
  const counts = useMemo(() => {
    const n: Record<Filter, number> = { waiting: 0, answered: 0, handed: 0, all: searched.length }
    for (const c of searched) n[inboxState(c)]++
    return n
  }, [searched])
  const shown = searched.filter(c => filter === 'all' || inboxState(c) === filter)

  // Read here since its last message (readThread marks it seen, mig 20261027170000): its unread badge goes at once,
  // before the list is read again.
  const [readAt, setReadAt] = useState<Record<string, string>>({})
  const load = useCallback((id: string) => {
    startLoading(async () => {
      const r = await readThread(id)
      if (!r.ok) setError(r.reason)
      else if (r.data) {
        setThreads(t => ({ ...t, [id]: r.data! }))
        setReadAt(m => ({ ...m, [id]: r.data!.contact.lastAt }))
      }
    })
  }, [])
  const pick = (id: string) => {
    setSelected(id)
    setError(null)
    // The address names the conversation, so a refresh (and a link) opens it again.
    window.history.replaceState(null, '', `/leads?c=${id}`)
    // Always read: the cached copy shows at once, and the read marks the chat seen.
    load(id)
  }
  // The list stays live (2026-10-27 — the user: a row still showed 12:53 while the chat had 12:55): the page's data is
  // read again every 15 s while this tab is in view, and at once when it comes back. A refresh keeps what is typed.
  const router = useRouter()
  useEffect(() => {
    const fresh = () => { if (document.visibilityState === 'visible') router.refresh() }
    const timer = window.setInterval(fresh, LIST_REFRESH_MS)
    document.addEventListener('visibilitychange', fresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', fresh) }
  }, [router])
  // The list changed under us (a write, a refresh): read the open conversation again.
  const lastAt = contacts.find(c => c.id === selected)?.lastAt
  const seen = useRef(lastAt)
  useEffect(() => {
    if (selected && lastAt && seen.current !== lastAt) load(selected)
    seen.current = lastAt
  }, [lastAt, selected, load])

  const thread = selected ? threads[selected] ?? null : null
  const contact = thread?.contact ?? contacts.find(c => c.id === selected) ?? null
  const brandOf = contact ? brands.get(contact.brandId) : undefined

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>Inbox</h1>
      </div>

      <div className={s.grid} style={{ gridTemplateColumns: `${layout.listW}px minmax(0,1fr) ${cardW}px ${logW}px` }}>
        <div className={s.handle} style={{ left: layout.listW, marginLeft: -5 }} onMouseDown={e => drag(e, 'listW')} title="Drag to resize" aria-hidden="true" />
        {panels.card ? <div className={s.handle} style={{ right: cardW + logW, marginRight: -4 }} onMouseDown={e => drag(e, 'rightW')} title="Drag to resize" aria-hidden="true" /> : null}

        {/* ── Conversations ── */}
        <section className={s.list} aria-label="Conversations">
          <div className={s.listHead}>
            <div className={s.brands} role="group" aria-label="Brand">
              <button type="button" className={s.brandTab} aria-pressed={brand === 'all'} onClick={() => setBrand('all')}>All<span className={s.brandCount}>{perBrand.all ?? 0}</span></button>
              {config.brands.map(b => (
                <button key={b.id} type="button" className={s.brandTab} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}<span className={s.brandCount}>{perBrand[b.id] ?? 0}</span></button>
              ))}
            </div>
            <label className={s.find}>
              <LeadIcon name="search" size={14} />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone, message or ad" aria-label="Search conversations" />
            </label>
            <div className={s.quickChips} role="group" aria-label="Filter">
              <button type="button" className={s.quickChip} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(u => !u)}>Unread</button>
              {labels.map(l => (
                <button key={l.id} type="button" className={s.quickChip} data-tone={l.tone} aria-pressed={label === l.id}
                  onClick={() => setLabel(cur => (cur === l.id ? '' : l.id))}>{l.name}</button>
              ))}
            </div>
            <div className={s.states} role="group" aria-label="Where they stand">
              {FILTERS.map(f => (
                <button key={f.id} type="button" className={s.stateTab} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}<span className={s.stateCount}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={s.rows}>
            {shown.length === 0 ? (
              <div className={s.empty}>
                {contacts.length === 0 ? 'No conversations yet. Until Meta is connected, send a test message from Settings › Test.' : 'Nothing here.'}
              </div>
            ) : shown.map(c => {
              const st = inboxState(c)
              const unread = c.id === selected || readAt[c.id] === c.lastAt ? 0 : c.unread
              return (
                <button key={c.id} type="button" className={s.row} aria-current={c.id === selected} data-waiting={st === 'waiting' || undefined} onClick={() => pick(c.id)}>
                  <span className={s.avatarWrap} aria-hidden="true">
                    <span className={s.avatar}>{initials(c.name)}</span>
                    <span className={s.channel} data-ch={c.channel}>{c.channel === 'instagram' ? 'IG' : 'FB'}</span>
                  </span>
                  <span className={s.rowBody}>
                    <span className={s.rowTop}>
                      <span className={s.rowName}>{c.name || '—'}</span>
                      {st === 'waiting' && c.unread === undefined ? <span className={s.waitDot} aria-label="Waiting" /> : null}
                      <span className={s.rowTime} data-unread={unread ? '' : undefined}>{whenShort(c.lastAt, config.today)}</span>
                    </span>
                    <span className={s.rowLine}>
                      <span className={s.rowText}>{c.lastDir === 'out' ? '↩ ' : ''}{c.lastText}</span>
                      {unread ? <span className={s.unread} aria-label={`${unread} unread`}>{unreadLabel(unread)}</span> : null}
                    </span>
                    <span className={s.chips}>
                      <span className={s.chip}>{brands.get(c.brandId)?.name ?? '—'}</span>
                      {c.flowState === 'running' ? <span className={s.chip} data-tone="quiet">Template</span> : null}
                      {labelsOf(c).map(l => <span key={l.id} className={s.label} data-tone={l.tone}>{l.name}</span>)}
                      {c.isTest ? <span className={s.testTag}>TEST</span> : null}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── The chat ── */}
        <section className={s.chat} aria-label="Chat">
          {contact ? (
            <Chat key={contact.id} contact={contact} thread={thread} brand={brandOf} csName={csName}
              canReply={canReply} canManage={canManage} aiOn={aiBrands.includes(contact.brandId)} aiConnected={aiConnected} info={info} quick={quick} today={config.today}
              loading={loading && !thread} onSent={() => load(contact.id)} />
          ) : (
            <div className={s.empty}>Pick a conversation.</div>
          )}
          {error ? <div className={s.error} role="alert" style={{ margin: 12 }}>{error}</div> : null}
        </section>

        {/* ── The customer ── */}
        {panels.card ? (
          <aside className={s.panel} aria-label="Customer">
            <button type="button" className={s.fold} title="Fold the customer panel" aria-label="Fold the customer panel" onClick={() => togglePanel('card')}>»</button>
            {contact ? (
              <CustomerCard key={contact.id} contact={contact} brand={brandOf} labels={labels} canManage={canManage}
                canEdit={canEdit} csName={csName} onSaved={() => load(contact.id)} />
            ) : null}
          </aside>
        ) : (
          <button type="button" className={s.rail} onClick={() => togglePanel('card')} title="Open the customer panel">
            <span className={s.railArrow}>«</span><span className={s.railLabel}>Customer</span>
          </button>
        )}

        {/* ── The timeline: its own panel on the right, folded until opened (the user, 2026-10-23) ── */}
        {panels.log ? (
          <aside className={s.log} aria-label="Timeline">
            <button type="button" className={s.logHead} onClick={() => togglePanel('log')} title="Fold the timeline">
              <LeadIcon name="history" size={15} /><span className={s.logTitle}>Timeline</span><span className={s.logSub}>this chat</span><span className={s.fill} />›
            </button>
            <div className={s.logBody}>
              {!contact ? <span className={s.logEmpty}>Pick a chat to see its history</span>
                : !(thread?.events ?? []).length ? <span className={s.logEmpty}>Nothing has happened in this chat yet</span>
                : [...(thread?.events ?? [])].reverse().map((e, i) => (
                  <div key={i} className={s.event}>
                    <span className={s.eventAt}>{whenFull(e.at)}</span>
                    <span>{e.what}{e.by ? <span className={s.logSub}> · {e.by}</span> : null}</span>
                  </div>
                ))}
            </div>
          </aside>
        ) : (
          <button type="button" className={s.rail} data-log="" onClick={() => togglePanel('log')} title="Open the timeline">
            <LeadIcon name="history" size={15} /><span className={s.railLabel}>Timeline</span>
          </button>
        )}
      </div>
    </div>
  )
}

/** Drag a column's edge: the list's grows to the right, the customer's to the left; kept when let go. */
function useDrag(layout: InboxLayout, setLayout: (next: InboxLayout | ((l: InboxLayout) => InboxLayout)) => void) {
  return (e: ReactMouseEvent, key: keyof InboxLayout) => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = layout[key]
    const dir = key === 'listW' ? 1 : -1
    const range = key === 'listW' ? LIST_W : RIGHT_W
    let last = layout
    const move = (ev: MouseEvent) => setLayout(l => (last = { ...l, [key]: clampWidth(w0 + dir * (ev.clientX - x0), range) }))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(last)) } catch { /* not kept in a private window */ }
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
}

function Chat({ contact, thread, brand, csName, canReply, canManage, aiOn, aiConnected, info, quick, today, loading, onSent }: {
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
}) {
  const [text, setText] = useState('')
  const replyBox = useRef<HTMLTextAreaElement>(null)
  // An emoji goes where the cursor is, and the cursor stays after it.
  const putEmoji = (emoji: string) => {
    const box = replyBox.current
    const r = insertAt(text, box?.selectionStart ?? text.length, box?.selectionEnd ?? text.length, emoji)
    setText(r.text.slice(0, 2000))
    requestAnimationFrame(() => { box?.focus(); box?.setSelectionRange(r.caret, r.caret) })
  }
  // "/word" at the end of the reply box: the quick replies it may mean (the handoff's Data Center › Quick replies).
  const qm = useMemo(() => quickMatches(text, quick, contact.brandId), [text, quick, contact.brandId])
  const putQuick = (r: QuickReply) => {
    if (!qm) return
    setText(t => insertQuick(t, qm.typed, r.body))
    void quickReplyUsed(r.id)
  }
  const [sending, startSending] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The AI draft on offer, and the one put in the reply box (its outcome is kept when the reply goes).
  const [draft, setDraft] = useState<DraftForInbox | null>(null)
  const [used, setUsed] = useState<DraftForInbox | null>(null)
  const [drafting, startDrafting] = useTransition()
  const [whoOpen, setWhoOpen] = useState(false)
  // Answering one message, and the Page's emoji on a customer's message (mig 20261027220000).
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
  const end = useRef<HTMLDivElement>(null)
  const count = thread?.messages.length ?? 0
  // Photos and files (mig 20261027140000): picked from the camera (photos, videos) or the paperclip (anything), put in
  // the bucket lead-media, then sent as a reply — the reply box's words as its caption.
  const photoPick = useRef<HTMLInputElement>(null)
  const filePick = useRef<HTMLInputElement>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const paths = useMemo(() => (thread?.messages ?? []).map(m => m.mediaPath).filter((x): x is string => !!x), [thread])
  useEffect(() => {
    const missing = paths.filter(x => !links[x])
    if (!missing.length) return
    void leadMediaLinks(missing).then(r => { if (r.ok) setLinks(l => ({ ...l, ...r.data })) })
  }, [paths, links])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [count])

  const now = replyingNow(contact, csName)
  const botOn = now.kind !== 'cs'
  const state = inboxState(contact)
  const ad = adLabel(contact)
  const manager = adsManagerLink(contact.adAccount ?? '', contact.adId ?? '')

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
      // Saved, but Messenger did not take it (the window, the connection): say why — the message shows "not sent".
      if (r.data.notSent) setError('Saved but not sent: ' + r.data.notSent)
    })
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

  return (
    <>
      <div className={s.chatHead}>
        <div className={s.who}>
          <span className={s.whoName}>{contact.name || '—'}</span>
          <span className={s.whoLine}>
            <span className={s.chip}>{brand?.name ?? '—'}</span>
            <span>{CHANNEL_LABEL[contact.channel]}</span>
            <span className={s.sep}>·</span>
            <span className={s.ellipsis}>{ad ? `Ad: ${ad}` : 'Organic'}</span>
          </span>
        </div>
        <div className={s.nowWrap}>
          <button type="button" className={s.now} onClick={() => setWhoOpen(o => !o)} aria-haspopup="menu" aria-expanded={whoOpen} title="Change who replies">
            <span className={s.nowIcon}><LeadIcon name={botOn ? 'workflow' : 'headset'} size={14} /></span>
            <span className={s.nowKicker}>NOW</span>
            <span className={s.nowWho}>{now.label}</span>
            <span className={s.nowChevron}><LeadIcon name="chevronDown" size={13} /></span>
          </button>
          {whoOpen ? (
            <>
              <div className={s.scrim} onClick={() => setWhoOpen(false)} aria-hidden="true" />
              <div className={s.menu} role="menu" aria-label="Hand this chat to">
                <div className={s.menuKicker}>HAND THIS CHAT TO</div>
                <button type="button" role="menuitemradio" aria-checked={!botOn} className={s.menuItem} disabled={botOn}>
                  <span className={s.nowIcon}><LeadIcon name="headset" size={14} /></span>
                  <span style={{ flex: 1 }}>CS · {csName}</span>
                  <span className={s.menuTick}>{botOn ? '' : '✓'}</span>
                </button>
                <button type="button" role="menuitemradio" aria-checked={false} className={s.menuItem} disabled>
                  <span className={s.nowIcon}><LeadIcon name="sparkles" size={14} /></span>
                  <span style={{ flex: 1 }}>AI Agent</span>
                  <span className={s.menuTick} />
                </button>
                {botOn ? (
                  <button type="button" role="menuitemradio" aria-checked className={s.menuItem}>
                    <span className={s.nowIcon}><LeadIcon name="workflow" size={14} /></span>
                    <span style={{ flex: 1 }}>{now.label}</span>
                    <span className={s.menuTick}>✓</span>
                  </button>
                ) : null}
                <div className={s.menuNote}>Handing a chat to the AI Agent or a template comes with Reply rules — a later step of the redesign.</div>
              </div>
            </>
          ) : null}
        </div>
        <OwnerPicker contact={thread?.contact ?? contact} canManage={canManage} onChanged={onSent} />
        <span className={s.stateTag} data-state={state}>{STATE_LABEL[state]}</span>
      </div>

      <div className={s.source}>
        <span className={s.kicker}>{ad ? 'FROM THE AD' : 'SOURCE'}</span>
        {ad ? (
          <>
            <span className={s.adName}>{ad}</span>
            <span className={s.adPath}>{[CHANNEL_LABEL[contact.channel], [contact.adCampaign, contact.adSet].filter(Boolean).join(' › ')].filter(Boolean).join(' · ')}</span>
            <span style={{ flex: 1 }} />
            {contact.adLink ? <a className={s.link} href={contact.adLink} target="_blank" rel="noopener noreferrer">View the ad ↗</a> : null}
            {manager ? <a className={s.link} href={manager} target="_blank" rel="noopener noreferrer">Ads Manager ↗</a> : null}
          </>
        ) : (
          <span className={s.adName} style={{ fontWeight: 500 }}>Organic · messaged the Page directly</span>
        )}
      </div>

      <div className={s.messages}>
        {loading ? <div className={s.empty}>Loading…</div> : null}
        {(thread?.messages ?? []).map((m, i, all) => {
          const day = dayLabel(m.at)
          const newDay = i === 0 || dayLabel(all[i - 1].at) !== day
          return (
            <div key={m.id} className={s.msg} data-out={m.direction === 'out' || undefined}>
              {newDay ? <div className={s.day} style={{ alignSelf: 'stretch' }}>{day}</div> : null}
              {m.direction === 'out' ? <MessageLabel m={m} /> : null}
              {m.replyToMid ? <Quote m={byMid.get(m.replyToMid) ?? null} /> : null}
              {m.mediaPath || m.mediaUrl ? <MessageMedia m={m} link={m.mediaPath ? links[m.mediaPath] : m.mediaUrl ?? undefined} /> : null}
              <div className={s.bubbleRow}>
                {(m.mediaPath || m.mediaUrl) && isMediaPlaceholder(m.body) ? null : <div className={s.bubble}>{m.body}</div>}
                {canReply && m.mid && !contact.isTest ? (
                  <span className={s.msgActions}>
                    {m.direction === 'in' ? (
                      <span className={s.nowWrap}>
                        <button type="button" className={s.msgAction} title="React" aria-label="React" onClick={() => setReacting(r => (r === m.id ? null : m.id))} disabled={sending}><LeadIcon name="smile" size={15} /></button>
                        {reacting === m.id ? (
                          <>
                            <div className={s.scrim} onClick={() => setReacting(null)} aria-hidden="true" />
                            <div className={s.reactMenu} role="menu" aria-label="React">
                              {QUICK_REACTIONS.map(e => (
                                <button key={e} type="button" className={s.emojiBtn} aria-pressed={m.reaction === e} onClick={() => react(m, m.reaction === e ? null : e)}>{e}</button>
                              ))}
                              {m.reaction ? <button type="button" className={s.textLink} style={{ fontSize: 12, padding: '0 4px' }} onClick={() => react(m, null)}>Remove</button> : null}
                            </div>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                    <button type="button" className={s.msgAction} title="Reply" aria-label="Reply" onClick={() => { setReplyingTo(m); replyBox.current?.focus() }}><LeadIcon name="reply" size={15} /></button>
                  </span>
                ) : null}
              </div>
              {m.reaction ? <span className={s.reaction} title="The Page's reaction">{m.reaction}</span> : null}
              {m.buttons?.length ? (
                <div className={s.buttons}>{m.buttons.map(b => <span key={b} className={s.button}>{b}</span>)}</div>
              ) : null}
              {m.phoneFound ? <span className={s.found}>Phone found · {formatPhone(m.phoneFound)}</span> : null}
              <span className={s.meta}>{metaOf(m)}<Ticks r={receiptOf(m, thread?.contact ?? contact)} /></span>
            </div>
          )
        })}
        <div ref={end} />
      </div>

      {canReply ? (
        <div className={s.composeArea}>
          {error ? <div className={s.error} role="alert">{error}</div> : null}
          {replyingTo ? (
            <div className={s.replyBar}>
              <span className={s.replyBarText}>
                <span className={s.replyBarWho}>Replying to {replyingTo.direction === 'in' ? (contact.name || 'the customer') : 'the Page'}</span>
                <span className={s.ellipsis}>{replyingTo.body}</span>
              </span>
              <button type="button" className={s.iconBtn} onClick={() => setReplyingTo(null)} aria-label="Cancel the reply">×</button>
            </div>
          ) : null}
          {draft ? (
            <div className={s.draft}>
              <div className={s.draftHead}>
                <span className={s.draftKicker}>✦ AI DRAFT · NOT SENT</span>
                <span className={s.draftUsed}>Used: {draft.used.length ? draft.used.map(u => u.title).join(', ') : 'none'}</span>
              </div>
              {draft.handoff || draft.note ? (
                <div className={s.draftFlag}>{draft.handoff ? 'A person should take over' : ''}{draft.handoff && draft.note ? ' · ' : ''}{draft.note}</div>
              ) : null}
              <div className={s.draftText}>{draft.reply}</div>
              <div className={s.row6}>
                <button type="button" className={s.btn} data-strong="" onClick={useDraft}>Use</button>
                <button type="button" className={s.btn} onClick={askDraft} disabled={drafting}>{drafting ? 'Drafting…' : 'Another'}</button>
                <button type="button" className={s.btn} data-quiet="" onClick={dismissDraft}>Dismiss</button>
              </div>
            </div>
          ) : null}
          <div className={s.composer}>
            {qm && qm.matches.length && !botOn ? (
              <div className={s.quickMenu} role="listbox" aria-label="Quick replies">
                {qm.matches.slice(0, 6).map(r => (
                  <button key={r.id} type="button" role="option" aria-selected={false} className={s.quickItem} onMouseDown={e => e.preventDefault()} onClick={() => putQuick(r)}>
                    <span className={s.quickKey}>{r.shortcut}</span><span className={s.quickText}>{r.body}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <textarea ref={replyBox} className={s.reply} rows={3} value={text} onChange={e => setText(e.target.value)} maxLength={2000} disabled={botOn}
              aria-label="Reply" placeholder={botOn ? 'A template is replying. Switch to CS from “Now” above to reply yourself.' : `Reply as ${csName}…`}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); return }
                // Tab takes the first quick reply offered.
                if (e.key === 'Tab' && qm?.matches.length && !botOn) { e.preventDefault(); putQuick(qm.matches[0]) }
              }} />
            <div className={s.tools}>
              <span className={s.row6} style={{ gap: 2 }}>
                <button type="button" className={s.iconBtn} disabled={botOn || sending} title="Send a photo or video" onClick={() => photoPick.current?.click()}><LeadIcon name="camera" /></button>
                <button type="button" className={s.iconBtn} disabled={botOn || sending} title="Send a file" onClick={() => filePick.current?.click()}><LeadIcon name="paperclip" /></button>
                <EmojiMenu disabled={botOn || sending} onPick={putEmoji} />
                <input ref={photoPick} type="file" accept="image/*,video/*" hidden onChange={e => { sendFile(e.target.files?.[0]); e.target.value = '' }} />
                <input ref={filePick} type="file" hidden onChange={e => { sendFile(e.target.files?.[0]); e.target.value = '' }} />
              </span>
              <span className={s.rule} aria-hidden="true" />
              <InfoMenu info={info} brandId={contact.brandId} today={today} disabled={botOn}
                onInsert={(v, whole) => setText(t => (whole ? (t ? t.replace(/\s*$/, '') + '\n\n' : '') + v : t + (t && !/\s$/.test(t) ? ' ' : '') + v))} />
              {/* Always drawn, as the handoff; it says why when it cannot draft. */}
              {!draft ? (
                <button type="button" className={s.aiBtn} onClick={askDraft} disabled={drafting || botOn || !aiOn || !aiConnected}
                  title={!aiConnected ? 'AI not connected (no API key)' : !aiOn ? 'Set up this brand’s AI Agent first (AI Agent › Save)' : 'The AI writes a draft into the box; you edit and send it'}>{drafting ? 'Drafting…' : '✦ AI draft'}</button>
              ) : null}
              <span className={s.hint}>{used ? 'From an AI draft — check it before sending.' : ''}</span>
              <button type="button" className={s.send} onClick={send} disabled={sending || botOn || !text.trim()}>{sending ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * The CS who handles the conversation (mig 20261027150000): taken by their first reply, or given here by Lead View ·
 * Manage — the list is everybody whose permissions give Lead View › Inbox's Create. Everybody still sees every chat.
 */
function OwnerPicker({ contact, canManage, onChanged }: { contact: LeadContact; canManage: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }> | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const label = contact.assignedTo ? (contact.assignedName || 'a colleague') : 'No CS yet'
  if (!canManage) return <span className={s.owner} title="Who handles this chat">CS · {label}</span>
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
    <span className={s.nowWrap}>
      <button type="button" className={s.owner} data-button="" onClick={toggle} aria-haspopup="menu" aria-expanded={open} disabled={busy} title="Give this chat to a CS">
        CS · {label}<LeadIcon name="chevronDown" size={12} />
      </button>
      {open ? (
        <>
          <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={s.menu} role="menu" aria-label="Give this chat to">
            <div className={s.menuKicker}>GIVE THIS CHAT TO</div>
            {agents === null && !error ? <div className={s.menuNote}>Loading…</div> : null}
            {(agents ?? []).map(a => (
              <button key={a.id} type="button" role="menuitemradio" aria-checked={contact.assignedTo === a.id} className={s.menuItem} onClick={() => give(a.id)} disabled={busy}>
                <span style={{ flex: 1 }}>{a.name}</span><span className={s.menuTick}>{contact.assignedTo === a.id ? '✓' : ''}</span>
              </button>
            ))}
            {agents && !agents.length ? <div className={s.menuNote}>Nobody yet — a person whose permissions tick Lead View › Inbox (Create) shows here.</div> : null}
            <button type="button" role="menuitemradio" aria-checked={!contact.assignedTo} className={s.menuItem} onClick={() => give(null)} disabled={busy}>
              <span style={{ flex: 1 }}>Nobody</span><span className={s.menuTick}>{contact.assignedTo ? '' : '✓'}</span>
            </button>
            {error ? <div className={s.menuNote} role="alert">{error}</div> : null}
          </div>
        </>
      ) : null}
    </span>
  )
}

/** A message's photo, video or file: shown in place; a file (or a customer's attachment Meta keeps) opens in a tab. */
function MessageMedia({ m, link }: { m: LeadMessage; link: string | undefined }) {
  const kind = mediaKind(m.mediaMime, m.body)
  // Meta's addresses expire after a while (a signed link after an hour): say so instead of a broken picture.
  const [gone, setGone] = useState(false)
  const what = kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : kind === 'audio' ? 'Voice message' : 'File'
  if (!link) return <div className={s.mediaWait}>{what} · loading…</div>
  if (gone) return <div className={s.mediaWait}>{what} · no longer available from Meta</div>
  // A short-lived signed link (or Meta's): nothing for next/image to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  if (kind === 'image') return <a href={link} target="_blank" rel="noopener noreferrer"><img className={s.mediaImg} src={link} alt={m.body} onError={() => setGone(true)} /></a>
  if (kind === 'video') return <video className={s.mediaImg} src={link} controls preload="metadata" onError={() => setGone(true)} />
  if (kind === 'audio') return <audio className={s.mediaAudio} src={link} controls preload="metadata" onError={() => setGone(true)} />
  const name = m.mediaPath ? m.mediaPath.replace(/^.*\//, '').replace(/^[0-9a-f-]{36}-/, '') : 'Attachment'
  return <a className={s.mediaFile} href={link} target="_blank" rel="noopener noreferrer"><LeadIcon name="paperclip" size={14} />{name}</a>
}

/** Who wrote an outgoing message: CS (dark), a template or a campaign (AUTO), the AI Agent (AI), the Page from Business Suite (PAGE). */
function MessageLabel({ m }: { m: LeadMessage }) {
  const [tag, who, label] = m.sender === 'cs' ? ['CS', 'cs', m.byName]
    : m.sender === 'ai' ? ['AI', 'ai', 'AI Agent']
      : m.sender === 'campaign' ? ['AUTO', 'auto', `Campaign · ${m.byName}`]
        : m.sender === 'page' ? ['PAGE', 'auto', m.byName || 'Business Suite']
        : ['AUTO', 'auto', `Template · ${m.byName}`]
  return (
    <div className={s.label}>
      <span className={s.tag} data-who={who}>{tag}</span>
      <span className={s.labelName}>{label}</span>
    </div>
  )
}

/** Under a message: its time — and, for ours, only recorded (a test) or not sent; Meta's ticks say the rest. */
function metaOf(m: LeadMessage): string {
  if (m.direction === 'in' || m.delivery === 'sent') return timeOf(m.at)
  return [timeOf(m.at), m.delivery === 'recorded' ? 'recorded' : 'not sent'].join(' · ')
}

/** Quick reactions, as Messenger's row; the Page's emoji on a customer's message (mig 20261027220000). */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

/** The message a reply answers, quoted above it as Messenger does (only one Lead View has is drawn in full). */
function Quote({ m }: { m: LeadMessage | null }) {
  return (
    <div className={s.quote}>
      <span className={s.quoteWho}>↩ {m ? (m.direction === 'in' ? 'Customer' : 'Page') : 'Replied to a message'}</span>
      {m ? <span className={s.quoteText}>{m.body}</span> : null}
    </div>
  )
}

/** WhatsApp's ticks (mig 20261027190000): ✓ sent, ✓✓ delivered, blue ✓✓ read — from Meta's receipts. */
function Ticks({ r }: { r: Receipt | null }) {
  if (r !== 'sent' && r !== 'delivered' && r !== 'read') return null
  const title = r === 'read' ? 'Read' : r === 'delivered' ? 'Delivered' : 'Sent'
  return <span className={s.ticks} data-r={r} title={title} aria-label={title}>{r === 'sent' ? '✓' : '✓✓'}</span>
}

const RECENT_KEY = 'lead-emoji-recent'

/** The reply box's emoji (2026-10-27 — the user: "聊天室加 Emoji"): the viewer's recent ones, then the groups. Stays open for several. */
function EmojiMenu({ disabled, onPick }: { disabled: boolean; onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const toggle = () => {
    if (!open) {
      try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); setRecent(Array.isArray(r) ? r.filter((e): e is string => typeof e === 'string').slice(0, 8) : []) } catch { setRecent([]) }
    }
    setOpen(o => !o)
  }
  const pick = (emoji: string) => {
    onPick(emoji)
    const next = withRecent(recent, emoji)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* a private window: no recent row */ }
  }
  const groups = recent.length ? [{ name: 'Recent', emoji: recent }, ...EMOJI_GROUPS] : EMOJI_GROUPS
  return (
    <span className={s.nowWrap}>
      <button type="button" className={s.iconBtn} disabled={disabled} title="Emoji" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}><LeadIcon name="smile" /></button>
      {open ? (
        <>
          <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={s.emojiMenu} role="dialog" aria-label="Emoji">
            {groups.map(g => (
              <div key={g.name}>
                <div className={s.menuKicker}>{g.name.toUpperCase()}</div>
                <div className={s.emojiGrid}>
                  {g.emoji.map(e => (
                    <button key={e} type="button" className={s.emojiBtn} onMouseDown={ev => ev.preventDefault()} onClick={() => pick(e)} aria-label={e}>{e}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </span>
  )
}

/** The composer's General info menu (the handoff's 560px panel): a card's header inserts it whole, a line inserts its value. */
function InfoMenu({ info, brandId, today, disabled, onInsert }: {
  info: LeadInfo | null
  brandId: string
  today: string
  disabled: boolean
  onInsert: (value: string, whole: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const entries = info ? infoEntries(info, brandId, today) : []
  if (!info) {
    return (
      <button type="button" className={s.toolBtn} disabled title="General info waits for its database update">
        <span className={s.toolAccent}><LeadIcon name="bookOpen" size={13} /></span>General info<LeadIcon name="chevronDown" size={13} />
      </button>
    )
  }
  return (
    <span className={s.infoWrap}>
      <button type="button" className={s.toolBtn} onClick={() => setOpen(o => !o)} disabled={disabled} aria-expanded={open}>
        <span className={s.toolAccent}><LeadIcon name="bookOpen" size={13} /></span>General info<LeadIcon name="chevronDown" size={13} />
      </button>
      {open ? (
        <>
          <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={s.infoPanel} role="dialog" aria-label="General info">
            <div className={s.infoHead}>
              <span className={s.infoTitle}>General info</span>
              <span className={s.infoHint}>Pick a card to insert it, or one line only</span>
              <a className={s.link} href="/leads/info">Edit ↗</a>
            </div>
            <div className={s.infoGrid}>
              {entries.length === 0 ? <div className={s.empty}>Nothing in use for this brand yet — add it on General info.</div> : entries.map(e => (
                <div key={e.card.id} className={s.infoCard}>
                  <button type="button" className={s.infoCardHead} title="Insert the whole card"
                    onClick={() => { onInsert(e.card.name + '\n' + e.fields.map(f => `${f.label}: ${f.value}`).join('\n'), true); setOpen(false) }}>
                    <span className={s.infoCardName}>{e.card.name || e.card.code}</span>
                    <span className={s.infoInsert}><LeadIcon name="plus" size={12} />Insert</span>
                  </button>
                  <div className={s.infoLines}>
                    {e.fields.map(f => (
                      <button key={f.token} type="button" className={s.infoLine} title="Insert this line" onClick={() => { onInsert(f.value, false); setOpen(false) }}>
                        <span className={s.infoLabel}>{f.label}</span>
                        <span className={s.infoValue}>{f.value}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </span>
  )
}
