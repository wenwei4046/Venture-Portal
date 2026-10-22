'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveAgent } from '@/lib/leads/actions'
import { CORRECTION_TOPICS, topicOf, type AgentMore, type Correction } from '@/lib/leads/agent'
import { whenFull } from '@/lib/leads/time'
import s from './replies.module.css'

/**
 * Lead View › AI corrections (2026-10-23, the redesign v2 handoff `Auto Reply.dc.html?view=corrections`): a brand's AI
 * drafts that CS changed before sending — what the customer asked, what the AI said (struck through) and what CS sent.
 * Saving one makes (or updates) the fixed answer for that question, through the AI Agent's save; the correction itself
 * never changes — an edited fixed answer shows IN USE over EARLIER · CS FIX. List or Summary (by topic), CSV, the period
 * (?d=) and page size at the foot.
 */

const RANGES: ReadonlyArray<[string, number | null]> = [['7 days', 7], ['30 days', 30], ['90 days', 90], ['All', null]]
const SIZES = [10, 20, 50] as const

export default function CorrectionsView({ brands, brandId, days, corrections, more, ready, canManage }: {
  brands: Array<{ id: string; name: string }>
  brandId: string
  days: number | null
  corrections: Correction[]
  more: AgentMore | null
  ready: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<'list' | 'summary'>('list')
  const [size, setSize] = useState<number>(10)
  const [page, setPage] = useState(0)
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [asking, setAsking] = useState<Correction | null>(null)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const brandName = brands.find(b => b.id === brandId)?.name ?? '—'
  const go = (b: string, d: number | null) => router.push(`/leads/corrections?b=${b}${d === null ? '&d=all' : `&d=${d}`}`)
  const answerOf = (c: Correction) => (c.answerId ? more?.answers.find(a => a.id === c.answerId) ?? null : null)
  const pages = Math.max(1, Math.ceil(corrections.length / size))
  const p = Math.min(page, pages - 1)
  const shown = corrections.slice(p * size, (p + 1) * size)
  const fresh = (c: Correction) => Date.now() - Date.parse(c.at) < 2 * 864e5

  const saveAsAnswer = (c: Correction, raw: string) => {
    if (!more) return
    const text = raw.trim()
    const existing = answerOf(c)
    const answers = existing
      ? more.answers.map(a => (a.id === existing.id ? { ...a, answer: text } : a))
      : [...more.answers, { id: `new-${c.id}`, question: (c.question ?? '').slice(0, 500) || 'Customer’s question', answer: text, draftId: c.id }]
    start(async () => {
      const r = await saveAgent(brandId, { settings: more.settings, answers, playbook: more.playbook, sources: more.sources.map(x => ({ fileId: x.fileId, paused: x.paused })) })
      if (!r.ok) { setError(r.reason); return }
      setEdits(e => { const n = { ...e }; delete n[c.id]; return n })
      setAsking(null)
      router.refresh()
    })
  }
  const csv = () => {
    const rows = [['Date', 'By', 'Customer asked', 'AI said', 'CS sent', 'Fixed answer now', 'Conversation'], ...corrections.map(c => [whenFull(c.at), c.by, c.question ?? '', c.wrong, c.right, answerOf(c)?.answer ?? '', c.conversation])]
    const text = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = `AI corrections ${brandName}.csv`
    document.body.appendChild(a); a.click(); a.remove()
  }
  const topics = CORRECTION_TOPICS.map(([t]) => ({ t, n: corrections.filter(c => topicOf(c.question ?? '') === t).length })).filter(x => x.n > 0)
  const top = [...topics].sort((a, b) => b.n - a.n)[0]

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>FILES</span>
          <h1 className={s.title}>AI corrections</h1>
        </div>
        <span className={s.status}><span className={s.dot} aria-hidden="true" />Meta not connected · auto replies run in test conversations only</span>
      </div>
      <div className={s.panel}>
        <div className={s.agentHead}>
          <span className={s.agentTitle}>AI corrections · {brandName}</span>
          <span className={s.brandSeg} role="group" aria-label="Brand">
            {brands.map(b => <button key={b.id} type="button" aria-pressed={b.id === brandId} onClick={() => go(b.id, days)}>{b.name}</button>)}
          </span>
        </div>
        <div className={s.scroll} style={{ paddingTop: 4 }}>
          {!ready ? <div className={s.note}>Waiting for the database update — corrections appear once drafts keep what CS sent.</div> : null}
          <span className={s.chipRow}>
            <span className={s.kicker}>CORRECTIONS FROM THE INBOX</span><span className={s.small}>{corrections.length} in total</span>
            <span className={s.fill} />
            <span className={s.brandSeg}>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
              <button type="button" aria-pressed={view === 'summary'} onClick={() => setView('summary')}>Summary</button>
            </span>
            <button type="button" className={s.btn} onClick={csv} disabled={corrections.length === 0}>Download CSV ↓</button>
          </span>
          {error ? <div className={s.error} role="alert">{error}</div> : null}

          {view === 'list' ? (
            <div className={s.box} style={{ maxWidth: 'none' }}>
              {shown.map(c => {
                const fixed = answerOf(c)
                const value = edits[c.id] ?? fixed?.answer ?? c.right
                const dirty = edits[c.id] !== undefined && edits[c.id] !== (fixed?.answer ?? c.right)
                return (
                  <div key={c.id} className={s.corrRow}>
                    <span className={s.small} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{whenFull(c.at)}<span>{c.by}</span>{fresh(c) ? <span className={s.newTag}>NEW</span> : null}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <span style={{ fontWeight: 500 }}>“{c.question ?? '—'}”</span>
                      <span className={s.corrLine}><span className={s.corrKicker} style={{ color: 'rgb(var(--lv-accent))' }}>AI SAID</span><s className={s.small}>{c.wrong}</s></span>
                      <span className={s.corrLine}>
                        <span className={s.corrKicker}>{fixed?.editedAt ? 'IN USE' : 'RIGHT'}</span>
                        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <textarea className={s.faqIn} rows={1} value={value} maxLength={2000} disabled={!canManage || !more} title="Edit · saved as a fixed answer"
                            onChange={e => setEdits(x => ({ ...x, [c.id]: e.target.value }))} aria-label="The right answer" />
                          {dirty ? <span style={{ display: 'flex', gap: 6 }}><button type="button" className={s.btn} data-strong="" onClick={() => setAsking(c)}>Save</button><button type="button" className={s.btn} data-quiet="" onClick={() => setEdits(x => { const n = { ...x }; delete n[c.id]; return n })}>Cancel</button></span> : null}
                          {fixed?.editedAt ? (
                            <>
                              <span className={s.small}>Edited {whenFull(fixed.editedAt)}</span>
                              <span className={s.earlier}><span className={s.corrKicker}>EARLIER · CS FIX {whenFull(c.at)}</span><span className={s.small}>{c.right}</span></span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      {fixed ? <Link className={s.status} data-tone="green" href="/leads/ai">Fixed answer →</Link> : canManage && more ? <button type="button" className={s.link} onClick={() => { setEdits(x => ({ ...x, [c.id]: value })); setAsking(c) }}>Make it a fixed answer</button> : null}
                      <Link className={s.link} href={`/leads?c=${c.contactId}`}>{c.conversation || 'Conversation'} ↗</Link>
                    </span>
                  </div>
                )
              })}
              {corrections.length === 0 ? <div className={s.corrRow}><span /><span className={s.small}>No corrections in this period. A correction is an AI draft CS changed before sending it.</span><span /></div> : null}
            </div>
          ) : (
            <div className={s.box} style={{ maxWidth: 640, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className={s.kicker}>Corrections by topic</span>
              {topics.map(t => (
                <span key={t.t} className={s.bar}><span style={{ width: 130 }}>{t.t}</span><span className={s.barTrack}><span className={s.barFill} style={{ width: `${(t.n / Math.max(...topics.map(x => x.n))) * 100}%` }} /></span><span className={s.small}>{t.n}</span></span>
              ))}
              {topics.length === 0 ? <span className={s.small}>Nothing yet.</span> : null}
              {top ? <span className={s.small}>Most corrections are about {top.t.toLowerCase()} — add the right facts to General info or the Data Center, or a fixed answer, so the agent stops guessing.</span> : null}
            </div>
          )}
        </div>
        {view === 'list' ? (
          <div className={s.foot} style={{ flexWrap: 'wrap' }}>
            <span className={s.small}>Last</span>
            <span className={s.brandSeg}>{RANGES.map(([l, v]) => <button key={l} type="button" aria-pressed={days === v} onClick={() => go(brandId, v)}>{l}</button>)}</span>
            <span className={s.small}>Per page</span>
            <span className={s.brandSeg}>{SIZES.map(n => <button key={n} type="button" aria-pressed={size === n} onClick={() => { setSize(n); setPage(0) }}>{n}</button>)}</span>
            <span className={s.fill} />
            <span className={s.small}>{corrections.length ? `${p * size + 1}–${Math.min(corrections.length, (p + 1) * size)} of ${corrections.length}` : '0 of 0'}</span>
            <button type="button" className={s.cardIcon} disabled={p === 0} onClick={() => setPage(p - 1)} title="Previous page">‹</button>
            <button type="button" className={s.cardIcon} disabled={p >= pages - 1} onClick={() => setPage(p + 1)} title="Next page">›</button>
          </div>
        ) : null}
      </div>
      {asking ? (
        <div className={s.modalScrim} onClick={e => { if (e.target === e.currentTarget && !busy) setAsking(null) }}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-label="Save as a new fixed answer">
            <span className={s.agentTitle}>Save as a new fixed answer?</span>
            <span className={s.small}>The AI will use it word for word when a customer asks something like “{asking.question ?? '—'}”. The original correction stays as history.</span>
            <div className={s.libBox} style={{ whiteSpace: 'pre-wrap' }}>{edits[asking.id] ?? asking.right}</div>
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className={s.btn} data-quiet="" disabled={busy} onClick={() => setAsking(null)}>Keep editing</button>
              <button type="button" className={s.btn} data-strong="" disabled={busy || !ready || !(edits[asking.id] ?? asking.right).trim()} onClick={() => saveAsAnswer(asking, edits[asking.id] ?? asking.right)}>{busy ? 'Saving…' : 'Save as new'}</button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
