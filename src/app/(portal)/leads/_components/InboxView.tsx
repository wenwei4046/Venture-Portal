'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { readThread, replyToLead } from '@/lib/leads/actions'
import { inboxState, type InboxState } from '@/lib/leads/handoff'
import { formatPhone } from '@/lib/leads/phone'
import { whenShort } from '@/lib/leads/time'
import type { LeadConfig, LeadContact, LeadThread } from '@/lib/leads/types'
import { BrandChip, CHANNEL_LABEL, initials } from './bits'
import CustomerCard from './CustomerCard'
import s from './lead.module.css'

/**
 * Lead View › Inbox (2026-10-16, the design canvas's "Inbox" board): the conversations on the left (by brand,
 * by where they stand, a search), the chat in the middle, the customer card on the right. Customer Service
 * replies here; the card keeps the phone and hands the lead to the brand's sales.
 *
 * Meta is not connected yet: a reply is recorded, not sent, and conversations arrive only through
 * Settings › Test. AI drafts, quick replies and flows are later phases of the canvas.
 */

type Filter = InboxState | 'all'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'waiting', label: '要回覆 Waiting' },
  { id: 'answered', label: '已回覆 Answered' },
  { id: 'handed', label: '已轉交 Handed' },
  { id: 'all', label: '全部 All' },
]

export default function InboxView({
  config,
  contacts,
  initialThread,
  canReply,
  canEdit,
  csName,
}: {
  config: LeadConfig
  contacts: LeadContact[]
  initialThread: LeadThread | null
  canReply: boolean
  canEdit: boolean
  /** Who is signed in — the hand-over's text names them. */
  csName: string
}) {
  const [brand, setBrand] = useState<string>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(initialThread?.contact.id ?? contacts[0]?.id ?? null)
  const [threads, setThreads] = useState<Record<string, LeadThread>>(initialThread ? { [initialThread.contact.id]: initialThread } : {})
  const [loading, startLoading] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const brands = useMemo(() => new Map(config.brands.map(b => [b.id, b])), [config.brands])
  const q = query.trim().toLowerCase()
  const inBrand = contacts.filter(c => brand === 'all' || c.brandId === brand)
  const counts = useMemo(() => {
    const n: Record<Filter, number> = { waiting: 0, answered: 0, handed: 0, all: inBrand.length }
    for (const c of inBrand) n[inboxState(c)]++
    return n
  }, [inBrand])
  const shown = inBrand.filter(c => (filter === 'all' || inboxState(c) === filter)
    && (!q || `${c.name} ${c.phone ?? ''} ${c.lastText} ${c.sourceAd}`.toLowerCase().includes(q)))

  const load = (id: string) => {
    startLoading(async () => {
      const r = await readThread(id)
      if (!r.ok) setError(r.reason)
      else if (r.data) setThreads(t => ({ ...t, [id]: r.data! }))
    })
  }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAt])

  const thread = selected ? threads[selected] ?? null : null
  const contact = thread?.contact ?? contacts.find(c => c.id === selected) ?? null

  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Inbox" />
      <div className={s.inbox}>
        {/* ── Conversations ── */}
        <section className={s.list} aria-label="Conversations">
          <div className={s.listHead}>
            <div className={s.tabs} role="group" aria-label="Brand">
              <button type="button" className={s.tab} aria-pressed={brand === 'all'} onClick={() => setBrand('all')}>全部</button>
              {config.brands.map(b => (
                <button key={b.id} type="button" className={s.tab} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>
              ))}
            </div>
            <input className={s.search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋 Search name, phone, message" aria-label="Search conversations" />
            <div className={s.tabs} role="group" aria-label="Where they stand">
              {FILTERS.map(f => (
                <button key={f.id} type="button" className={s.tab} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}<span className={s.count}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={s.rows}>
            {shown.length === 0 ? (
              <div className={s.empty}>
                {contacts.length === 0
                  ? '還沒有對話。Meta 串接之前，可以在 Settings › Test 送一則測試訊息進來。'
                  : '沒有符合的對話。'}
              </div>
            ) : (
              shown.map(c => {
                const st = inboxState(c)
                return (
                  <button key={c.id} type="button" className={s.row} aria-current={c.id === selected} onClick={() => pick(c.id)}>
                    <span className={s.avatar} aria-hidden="true">
                      {initials(c.name)}
                      <span className={s.channelDot} data-ch={c.channel}>{c.channel === 'instagram' ? 'IG' : 'FB'}</span>
                    </span>
                    <span className={s.rowBody}>
                      <span className={s.rowTop}>
                        <span className={s.rowName}>{c.name || '—'}</span>
                        <span className={s.rowTime}>{whenShort(c.lastAt, config.today)}</span>
                      </span>
                      <span className={s.rowText}>{c.lastDir === 'out' ? '↩ ' : ''}{c.lastText}</span>
                      <span className={s.rowChips}>
                        <BrandChip brand={brands.get(c.brandId)} />
                        <StateChip state={st} />
                        {c.flowState === 'running' ? <span className={s.brand} data-tone="blue">Flow 中</span> : null}
                        {c.phone ? <span className={s.found}>{formatPhone(c.phone)}</span> : null}
                        {c.isTest ? <span className={s.brand} data-tone="plum">TEST</span> : null}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        {/* ── The chat ── */}
        <section className={s.chat} aria-label="Chat">
          {contact ? (
            <Chat key={contact.id} contact={contact} thread={thread} brandName={brands.get(contact.brandId)?.name ?? ''} today={config.today}
              canReply={canReply} loading={loading && !thread} onSent={() => load(contact.id)} />
          ) : (
            <div className={s.empty}>選一個對話 Pick a conversation.</div>
          )}
          {error ? <div className={s.error} role="alert" style={{ margin: 12 }}>{error}</div> : null}
        </section>

        {/* ── The customer ── */}
        <aside className={s.card} aria-label="Customer">
          {contact ? (
            <CustomerCard key={contact.id} contact={contact} events={thread?.events ?? []} brand={brands.get(contact.brandId)}
              canEdit={canEdit} csName={csName} onSaved={() => load(contact.id)} />
          ) : null}
        </aside>
      </div>
    </HvPage>
  )
}

function StateChip({ state }: { state: InboxState }) {
  const label = state === 'waiting' ? '要回覆' : state === 'answered' ? '已回覆' : '已轉交'
  const tone = state === 'waiting' ? 'clay' : state === 'handed' ? 'olive' : 'plum'
  return <span className={s.brand} data-tone={tone}>{label}</span>
}

function Chat({ contact, thread, brandName, today, canReply, loading, onSent }: {
  contact: LeadContact
  thread: LeadThread | null
  brandName: string
  today: string
  canReply: boolean
  loading: boolean
  onSent: () => void
}) {
  const [text, setText] = useState('')
  const [sending, startSending] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const count = thread?.messages.length ?? 0
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [count])

  const send = () => {
    const body = text.trim()
    if (!body || sending) return
    setError(null)
    startSending(async () => {
      const r = await replyToLead(contact.id, body)
      if (!r.ok) { setError(r.reason); return }
      setText('')
      onSent()
    })
  }

  return (
    <>
      <div className={s.chatHead}>
        <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className={s.chatName}>{contact.name || '—'}</span>
          <span className={s.chatMeta}>
            <span>{brandName}</span><span>·</span><span>{CHANNEL_LABEL[contact.channel]}</span><span>·</span>
            <span>{contact.sourceAd ? `廣告 Ad：${contact.sourceAd}` : 'Organic'}</span>
          </span>
        </div>
      </div>
      {contact.isTest ? (
        <div className={s.note}>測試對話 Test conversation — 從 Settings › Test 送進來，回覆只會記錄，不會發出。</div>
      ) : (
        <div className={s.note}>Meta 還沒串接：回覆會記錄在這裡，但還不會發給客戶。</div>
      )}
      <div className={s.messages}>
        {loading ? <div className={s.empty}>Loading…</div> : null}
        {thread?.messages.map(m => m.direction === 'in' ? (
          <div key={m.id} className={s.msgIn}>
            <div className={s.bubbleIn}>{m.body}</div>
            {m.phoneFound ? <span className={s.found}>偵測到電話 {formatPhone(m.phoneFound)} → 客戶卡</span> : null}
            <span className={s.msgMeta}>{whenShort(m.at, today)}</span>
          </div>
        ) : (
          <div key={m.id} className={s.msgOut}>
            <div className={s.bubbleOut} data-sender={m.sender}>{m.body}</div>
            {m.buttons?.length ? (
              <span className={s.tabs} style={{ justifyContent: 'flex-end' }}>
                {m.buttons.map(b => <span key={b} className={s.flowButton}>{b}</span>)}
              </span>
            ) : null}
            <span className={s.msgMeta}>
              {m.sender === 'cs' ? `${m.byName} · 客服` : m.sender === 'ai' ? 'AI Agent' : `Flow · ${m.byName}`} · {whenShort(m.at, today)}
              {m.delivery === 'recorded' ? ' · 只記錄 recorded' : m.delivery === 'failed' ? ' · 沒發出 failed' : ''}
            </span>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error ? <div className={s.error} role="alert" style={{ margin: '0 16px 8px' }}>{error}</div> : null}
      {canReply ? (
        <div className={s.composer}>
          <label style={{ flex: 1, display: 'flex' }}>
            <span className="sr-only">Reply</span>
            <textarea className={s.textarea} rows={2} value={text} onChange={e => setText(e.target.value)} maxLength={2000}
              placeholder="回覆客戶… Reply (Ctrl + Enter 發送)"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }} />
          </label>
          <button type="button" className={btn('primary')} onClick={send} disabled={sending || !text.trim()}>{sending ? '發送中…' : '發送 Send'}</button>
        </div>
      ) : null}
    </>
  )
}
