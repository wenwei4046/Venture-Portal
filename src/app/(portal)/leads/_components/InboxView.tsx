'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent } from 'react'
import { draftLeadReply, readThread, replyToLead, setDraftOutcome, type DraftForInbox } from '@/lib/leads/actions'
import { outcomeOf } from '@/lib/leads/ai'
import { adLabel, adsManagerLink } from '@/lib/leads/ads'
import { inboxState, type InboxState } from '@/lib/leads/handoff'
import { LAYOUT_KEY, LIST_W, RIGHT_W, clampWidth, readLayout, replyingNow, type InboxLayout } from '@/lib/leads/inbox'
import { formatPhone } from '@/lib/leads/phone'
import { dayLabel, timeOf, whenShort } from '@/lib/leads/time'
import type { LeadBrand, LeadConfig, LeadContact, LeadMessage, LeadThread } from '@/lib/leads/types'
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
 * Meta is not connected yet: a reply is recorded, not sent, and conversations arrive only through Settings › Test.
 * What the handoff draws that needs the database first is drawn and held, saying so: switching who replies, photos
 * and files, and the General info cards.
 */

type Filter = InboxState | 'all'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'waiting', label: 'Waiting' },
  { id: 'answered', label: 'Answered' },
  { id: 'handed', label: 'Handed' },
  { id: 'all', label: 'All' },
]
const STATE_LABEL: Readonly<Record<InboxState, string>> = { waiting: 'Waiting', answered: 'Answered', handed: 'Handed' }

export default function InboxView({
  config,
  contacts,
  initialThread,
  initialQuery = '',
  canReply,
  canEdit,
  csName,
  aiBrands,
  aiConnected,
}: {
  config: LeadConfig
  contacts: LeadContact[]
  initialThread: LeadThread | null
  /** The top bar's search, handed in on the address (`?q=`). */
  initialQuery?: string
  canReply: boolean
  canEdit: boolean
  /** Who is signed in — the hand-over's text and the NOW pill name them. */
  csName: string
  /** Brands whose AI agent is a copilot. */
  aiBrands: string[]
  /** Is there an API key for the AI Agent at all? */
  aiConnected: boolean
}) {
  const [brand, setBrand] = useState<string>('all')
  const [filter, setFilter] = useState<Filter>(initialQuery ? 'all' : 'waiting')
  const [query, setQuery] = useState(initialQuery)
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

  const brands = useMemo(() => new Map(config.brands.map(b => [b.id, b])), [config.brands])
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/[\s-]/g, '')
  const inBrand = contacts.filter(c => brand === 'all' || c.brandId === brand)
  const searched = inBrand.filter(c => {
    if (!q) return true
    const hay = `${c.name} ${c.phone ?? ''} ${c.phone ? formatPhone(c.phone) : ''} ${c.lastText} ${adLabel(c)}`.toLowerCase()
    return hay.includes(q) || (qDigits.length >= 3 && /^\d+$/.test(qDigits) && (c.phone ?? '').includes(qDigits))
  })
  const counts = useMemo(() => {
    const n: Record<Filter, number> = { waiting: 0, answered: 0, handed: 0, all: searched.length }
    for (const c of searched) n[inboxState(c)]++
    return n
  }, [searched])
  const shown = searched.filter(c => filter === 'all' || inboxState(c) === filter)

  const load = useCallback((id: string) => {
    startLoading(async () => {
      const r = await readThread(id)
      if (!r.ok) setError(r.reason)
      else if (r.data) setThreads(t => ({ ...t, [id]: r.data! }))
    })
  }, [])
  const pick = (id: string) => {
    setSelected(id)
    setError(null)
    // The address names the conversation, so a refresh (and a link) opens it again.
    window.history.replaceState(null, '', `/leads?c=${id}`)
    if (!threads[id]) load(id)
  }
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
        <div className={s.status}>
          <span className={s.dot} aria-hidden="true" />Meta not connected · only test conversations · replies are recorded, not sent
        </div>
      </div>

      <div className={s.grid} style={{ gridTemplateColumns: `${layout.listW}px minmax(0,1fr) ${layout.rightW}px` }}>
        <div className={s.handle} style={{ left: layout.listW, marginLeft: -5 }} onMouseDown={e => drag(e, 'listW')} title="Drag to resize" aria-hidden="true" />
        <div className={s.handle} style={{ right: layout.rightW, marginRight: -4 }} onMouseDown={e => drag(e, 'rightW')} title="Drag to resize" aria-hidden="true" />

        {/* ── Conversations ── */}
        <section className={s.list} aria-label="Conversations">
          <div className={s.listHead}>
            <div className={s.brands} role="group" aria-label="Brand">
              <button type="button" className={s.brandTab} aria-pressed={brand === 'all'} onClick={() => setBrand('all')}>All</button>
              {config.brands.map(b => (
                <button key={b.id} type="button" className={s.brandTab} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>
              ))}
            </div>
            <label className={s.find}>
              <LeadIcon name="search" size={14} />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone, message or ad" aria-label="Search conversations" />
            </label>
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
              return (
                <button key={c.id} type="button" className={s.row} aria-current={c.id === selected} data-waiting={st === 'waiting' || undefined} onClick={() => pick(c.id)}>
                  <span className={s.avatarWrap} aria-hidden="true">
                    <span className={s.avatar}>{initials(c.name)}</span>
                    <span className={s.channel} data-ch={c.channel}>{c.channel === 'instagram' ? 'IG' : 'FB'}</span>
                  </span>
                  <span className={s.rowBody}>
                    <span className={s.rowTop}>
                      <span className={s.rowName}>{c.name || '—'}</span>
                      {st === 'waiting' ? <span className={s.waitDot} aria-label="Waiting" /> : null}
                      <span className={s.rowTime}>{whenShort(c.lastAt, config.today)}</span>
                    </span>
                    <span className={s.rowText}>{c.lastDir === 'out' ? '↩ ' : ''}{c.lastText}</span>
                    <span className={s.chips}>
                      <span className={s.chip}>{brands.get(c.brandId)?.name ?? '—'}</span>
                      {c.flowState === 'running' ? <span className={s.chip} data-tone="quiet">Template</span> : null}
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
              canReply={canReply} aiOn={aiBrands.includes(contact.brandId)} aiConnected={aiConnected}
              loading={loading && !thread} onSent={() => load(contact.id)} />
          ) : (
            <div className={s.empty}>Pick a conversation.</div>
          )}
          {error ? <div className={s.error} role="alert" style={{ margin: 12 }}>{error}</div> : null}
        </section>

        {/* ── The customer ── */}
        <aside className={s.panel} aria-label="Customer">
          {contact ? (
            <CustomerCard key={contact.id} contact={contact} events={thread?.events ?? []} brand={brandOf}
              canEdit={canEdit} csName={csName} onSaved={() => load(contact.id)} />
          ) : null}
        </aside>
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

function Chat({ contact, thread, brand, csName, canReply, aiOn, aiConnected, loading, onSent }: {
  contact: LeadContact
  thread: LeadThread | null
  brand: LeadBrand | undefined
  csName: string
  canReply: boolean
  aiOn: boolean
  aiConnected: boolean
  loading: boolean
  onSent: () => void
}) {
  const [text, setText] = useState('')
  const [sending, startSending] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The AI draft on offer, and the one put in the reply box (its outcome is kept when the reply goes).
  const [draft, setDraft] = useState<DraftForInbox | null>(null)
  const [used, setUsed] = useState<DraftForInbox | null>(null)
  const [drafting, startDrafting] = useTransition()
  const [whoOpen, setWhoOpen] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const count = thread?.messages.length ?? 0
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
      const r = await replyToLead(contact.id, body)
      if (!r.ok) { setError(r.reason); return }
      if (used) void setDraftOutcome(used.id, outcomeOf(used.reply, body))
      setUsed(null)
      setText('')
      onSent()
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
              <div className={s.bubble}>{m.body}</div>
              {m.buttons?.length ? (
                <div className={s.buttons}>{m.buttons.map(b => <span key={b} className={s.button}>{b}</span>)}</div>
              ) : null}
              {m.phoneFound ? <span className={s.found}>Phone found · {formatPhone(m.phoneFound)}</span> : null}
              <span className={s.meta}>{metaOf(m)}</span>
            </div>
          )
        })}
        <div ref={end} />
      </div>

      {canReply ? (
        <div className={s.composeArea}>
          {error ? <div className={s.error} role="alert">{error}</div> : null}
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
            <textarea className={s.reply} rows={3} value={text} onChange={e => setText(e.target.value)} maxLength={2000} disabled={botOn}
              aria-label="Reply" placeholder={botOn ? 'A template is replying. Switch to CS from “Now” above to reply yourself.' : `Reply as ${csName}…`}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }} />
            <div className={s.tools}>
              <span className={s.row6} style={{ gap: 2 }}>
                <button type="button" className={s.iconBtn} disabled title="Camera — photos come with Meta"><LeadIcon name="camera" /></button>
                <button type="button" className={s.iconBtn} disabled title="Photo, video or file — comes with Meta"><LeadIcon name="paperclip" /></button>
              </span>
              <span className={s.rule} aria-hidden="true" />
              <button type="button" className={s.toolBtn} disabled title="General info — its page comes in a later step of the redesign">
                <span className={s.toolAccent}><LeadIcon name="bookOpen" size={13} /></span>General info<LeadIcon name="chevronDown" size={13} />
              </button>
              {aiOn && aiConnected && !draft ? (
                <button type="button" className={s.aiBtn} onClick={askDraft} disabled={drafting || botOn}>{drafting ? 'Drafting…' : '✦ AI draft'}</button>
              ) : null}
              {aiOn && !aiConnected ? <span className={s.aiMissing}>AI not connected (no API key)</span> : null}
              <span className={s.hint}>{used ? 'From an AI draft — check it before sending.' : ''}</span>
              <button type="button" className={s.send} onClick={send} disabled={sending || botOn || !text.trim()}>{sending ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** Who wrote an outgoing message: CS (dark), a template or a campaign (AUTO), the AI Agent (AI). */
function MessageLabel({ m }: { m: LeadMessage }) {
  const [tag, who, label] = m.sender === 'cs' ? ['CS', 'cs', m.byName]
    : m.sender === 'ai' ? ['AI', 'ai', 'AI Agent']
      : m.sender === 'campaign' ? ['AUTO', 'auto', `Campaign · ${m.byName}`]
        : ['AUTO', 'auto', `Template · ${m.byName}`]
  return (
    <div className={s.label}>
      <span className={s.tag} data-who={who}>{tag}</span>
      <span className={s.labelName}>{label}</span>
    </div>
  )
}

/** Under a message: its time — and, for ours, whether it was only recorded (Meta not connected) or not sent. */
function metaOf(m: LeadMessage): string {
  if (m.direction === 'in') return timeOf(m.at)
  return [timeOf(m.at), m.delivery === 'recorded' ? 'recorded' : m.delivery === 'failed' ? 'not sent' : 'sent'].join(' · ')
}
