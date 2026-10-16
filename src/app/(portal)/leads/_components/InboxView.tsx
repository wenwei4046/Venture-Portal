'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { draftLeadReply, readThread, replyToLead, setDraftOutcome, type DraftForInbox } from '@/lib/leads/actions'
import { outcomeOf } from '@/lib/leads/ai'
import { inboxState, type InboxState } from '@/lib/leads/handoff'
import { formatPhone } from '@/lib/leads/phone'
import { whenShort } from '@/lib/leads/time'
import type { LeadConfig, LeadContact, LeadThread } from '@/lib/leads/types'
import { Bi, BrandChip, CHANNEL_LABEL, initials } from './bits'
import DraftBox from './DraftBox'
import CustomerCard from './CustomerCard'
import s from './lead.module.css'

/**
 * Lead View › Inbox (2026-10-16, the design canvas's "Inbox" board): the conversations on the left (by brand,
 * by where they stand, a search), the chat in the middle, the customer card on the right. Customer Service
 * replies here; the card keeps the phone and hands the lead to the brand's sales.
 *
 * Meta is not connected yet: a reply is recorded, not sent, and conversations arrive only through
 * Settings › Test. A brand whose AI agent is a copilot offers an AI draft above the reply box.
 */

type Filter = InboxState | 'all'
const FILTERS: Array<{ id: Filter; en: string; zh: string }> = [
  { id: 'waiting', en: 'Waiting', zh: '要回复' },
  { id: 'answered', en: 'Answered', zh: '已回复' },
  { id: 'handed', en: 'Handed', zh: '已转交' },
  { id: 'all', en: 'All', zh: '全部' },
]

export default function InboxView({
  config,
  contacts,
  initialThread,
  canReply,
  canEdit,
  csName,
  aiBrands,
}: {
  config: LeadConfig
  contacts: LeadContact[]
  initialThread: LeadThread | null
  canReply: boolean
  canEdit: boolean
  /** Who is signed in — the hand-over's text names them. */
  csName: string
  /** Brands whose AI agent is a copilot. */
  aiBrands: string[]
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
              <button type="button" className={s.tab} aria-pressed={brand === 'all'} onClick={() => setBrand('all')}><Bi en="All" zh="全部" /></button>
              {config.brands.map(b => (
                <button key={b.id} type="button" className={s.tab} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>
              ))}
            </div>
            <input className={s.search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, phone, message · 搜索" aria-label="Search conversations" />
            <div className={s.tabs} role="group" aria-label="Where they stand">
              {FILTERS.map(f => (
                <button key={f.id} type="button" className={s.tab} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  <Bi en={f.en} zh={f.zh} /><span className={s.count}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={s.rows}>
            {shown.length === 0 ? (
              <div className={s.empty}>
                {contacts.length === 0
                  ? <Bi block en="No conversations yet. Until Meta is connected, send a test message from Settings › Test." zh="还没有对话。Meta 串接之前，可以在 Settings › Test 发一则测试消息进来。" />
                  : <Bi block en="No conversations match." zh="没有符合的对话。" />}
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
                        {c.flowState === 'running' ? <span className={s.brand} data-tone="blue">Automation · 自动</span> : null}
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
              canReply={canReply} aiOn={aiBrands.includes(contact.brandId)} loading={loading && !thread} onSent={() => load(contact.id)} />
          ) : (
            <div className={s.empty}><Bi block en="Pick a conversation." zh="选一个对话" /></div>
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
  const label = state === 'waiting' ? 'Waiting' : state === 'answered' ? 'Answered' : 'Handed'
  const tone = state === 'waiting' ? 'clay' : state === 'handed' ? 'olive' : 'plum'
  return <span className={s.brand} data-tone={tone}>{label}</span>
}

function Chat({ contact, thread, brandName, today, canReply, aiOn, loading, onSent }: {
  contact: LeadContact
  thread: LeadThread | null
  brandName: string
  today: string
  canReply: boolean
  aiOn: boolean
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
        <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className={s.chatName}>{contact.name || '—'}</span>
          <span className={s.chatMeta}>
            <span>{brandName}</span><span>·</span><span>{CHANNEL_LABEL[contact.channel]}</span><span>·</span>
            <span>{contact.sourceAd ? `Ad: ${contact.sourceAd}` : 'Organic'}</span>
          </span>
        </div>
      </div>
      {contact.isTest ? (
        <div className={s.note}><Bi block en="Test conversation — from Settings › Test. Replies are recorded, never sent." zh="测试对话：回复只会记录，不会发出。" /></div>
      ) : (
        <div className={s.note}><Bi block en="Meta is not connected yet: replies are recorded here, not sent to the customer." zh="Meta 还没串接：回复会记录在这里，但还不会发给客户。" /></div>
      )}
      <div className={s.messages}>
        {loading ? <div className={s.empty}>Loading…</div> : null}
        {thread?.messages.map(m => m.direction === 'in' ? (
          <div key={m.id} className={s.msgIn}>
            <div className={s.bubbleIn}>{m.body}</div>
            {m.phoneFound ? <span className={s.found}>Phone found {formatPhone(m.phoneFound)} → card · 侦测到电话</span> : null}
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
              {m.sender === 'cs' ? `${m.byName} · CS` : m.sender === 'ai' ? 'AI Agent' : m.sender === 'campaign' ? `Campaign · ${m.byName}` : `Flow · ${m.byName}`} · {whenShort(m.at, today)}
              {m.delivery === 'recorded' ? ' · recorded' : m.delivery === 'failed' ? ' · not sent' : ''}
            </span>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error ? <div className={s.error} role="alert" style={{ margin: '0 16px 8px' }}>{error}</div> : null}
      {draft ? (
        <div style={{ margin: '0 16px 8px' }}>
          <DraftBox draft={draft} actions={
            <>
              <button type="button" className={btn('primary')} onClick={useDraft}><Bi en="Use" zh="使用" /></button>
              <button type="button" className={btn('outline')} onClick={askDraft} disabled={drafting}><Bi en="Another" zh="换一个" /></button>
              <button type="button" className={btn('outline')} onClick={dismissDraft}><Bi en="Dismiss" zh="不用" /></button>
            </>
          } />
        </div>
      ) : null}
      {canReply && aiOn && !draft ? (
        <div style={{ margin: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className={btn('outline')} onClick={askDraft} disabled={drafting}>
            {drafting ? 'Drafting…' : <>✦ <Bi en="AI draft" zh="AI 草稿" /></>}
          </button>
          {used ? <span className={s.hint}><Bi en="From an AI draft — check it before sending." zh="来自 AI 草稿，发送前请检查。" /></span> : null}
        </div>
      ) : null}
      {canReply ? (
        <div className={s.composer}>
          <label style={{ flex: 1, display: 'flex' }}>
            <span className="sr-only">Reply</span>
            <textarea className={s.textarea} rows={2} value={text} onChange={e => setText(e.target.value)} maxLength={2000}
              placeholder="Reply… (Ctrl + Enter to send) · 回复客户"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }} />
          </label>
          <button type="button" className={btn('primary')} onClick={send} disabled={sending || !text.trim()}>{sending ? 'Sending…' : <Bi en="Send" zh="发送" />}</button>
        </div>
      ) : null}
    </>
  )
}
