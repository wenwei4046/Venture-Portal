'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { LeadIcon } from '@/components/layout/lead-icons'
import { dismissCorrection, saveAgent } from '@/lib/leads/actions'
import { CORRECTION_TOPICS, topicOf, type AgentMore, type Correction } from '@/lib/leads/agent'
import { whenFull } from '@/lib/leads/time'
import b from './settings.module.css'
import s from './corrections.module.css'

/**
 * Lead View v2 › AI corrections (2026-11-02, the v2 handoff §7.11): replies CS changed before sending an AI draft.
 * STATUS (All · To review · Saved · Dismissed; To review by default) and TOPIC on the left; the corrections; the picked
 * one — CUSTOMER ASKED, AI SAID (struck through), CORRECT ANSWER (editable), Topic, Corrected by, Chat — with Save as
 * fixed answer (it really makes the brand's fixed answer, through the AI Agent's save) or Dismiss
 * (lead_ai_dismiss, mig 20261102130000). Every brand's at once. Kept though not drawn (the user's point 2): the period
 * and Export CSV, at the foot of the left column.
 */

type St = 'open' | 'saved' | 'dism'
export type BrandCorrection = Correction & { brandId: string }
const ST_LABEL: Record<St, string> = { open: 'To review', saved: 'Saved', dism: 'Dismissed' }
const TOPICS = CORRECTION_TOPICS.map(([t]) => t).filter(t => t !== 'Other')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateOf = (iso: string) => { const d = new Date(new Date(iso).getTime() + 8 * 3600e3); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}` }

export default function CorrectionsView({ corrections, more, brands, dismissed, days, ready, canManage }: {
  corrections: BrandCorrection[]
  /** Each brand's AI Agent settings, answers and playbook — what Save as fixed answer saves through. */
  more: Record<string, AgentMore | null>
  brands: Array<{ id: string; name: string }>
  dismissed: number[]
  days: number | null
  ready: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [st, setSt] = useState<'all' | St>('open')
  const [topic, setTopic] = useState<string>('All')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [ctx, setCtx] = useState<{ id: number; x: number; y: number } | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState('')
  const gone = useMemo(() => new Set(dismissed), [dismissed])

  const answerOf = (c: BrandCorrection) => (c.answerId ? more[c.brandId]?.answers.find(a => a.id === c.answerId) ?? null : null)
  const stOf = (c: BrandCorrection): St => (answerOf(c) ? 'saved' : gone.has(c.id) ? 'dism' : 'open')
  const topicOfC = (c: BrandCorrection) => topicOf(c.question ?? '')
  const ql = q.trim().toLowerCase()
  const inQ = (c: BrandCorrection) => !ql || `${c.question ?? ''} ${c.wrong} ${c.right}`.toLowerCase().includes(ql)
  const vis = corrections.filter(c => inQ(c) && (st === 'all' || stOf(c) === st) && (topic === 'All' || topicOfC(c) === topic))
  const cur = vis.find(c => c.id === sel) ?? vis[0] ?? null
  const brandName = (id: string) => brands.find(x => x.id === id)?.name ?? '—'

  const save = (c: BrandCorrection) => {
    const m = more[c.brandId]
    if (!m) { setError('This brand’s AI Agent could not be read, so the fixed answer cannot be saved.'); return }
    const text = (edits[c.id] ?? c.right).trim()
    if (!text) { setError('Write the correct answer first.'); return }
    const existing = answerOf(c)
    const answers = existing
      ? m.answers.map(a => (a.id === existing.id ? { ...a, answer: text } : a))
      : [...m.answers, { id: `new-${c.id}`, question: (c.question ?? '').slice(0, 500) || 'Customer’s question', answer: text, draftId: c.id }]
    start(async () => {
      setError('')
      const r = await saveAgent(c.brandId, { settings: m.settings, answers, playbook: m.playbook })
      if (!r.ok) { setError(r.reason); return }
      if (gone.has(c.id)) await dismissCorrection(c.id, false)
      flash('Saved as fixed answer')
      router.refresh()
    })
  }
  const dismiss = (c: BrandCorrection, on: boolean) => start(async () => {
    setError('')
    const r = await dismissCorrection(c.id, on)
    if (!r.ok) { setError(r.reason); return }
    router.refresh()
  })
  const csv = () => {
    const rows = [['Date', 'Brand', 'By', 'Topic', 'Customer asked', 'AI said', 'CS sent', 'Fixed answer now', 'Status', 'Chat'],
      ...corrections.map(c => [whenFull(c.at), brandName(c.brandId), c.by, topicOfC(c), c.question ?? '', c.wrong, c.right, answerOf(c)?.answer ?? '', ST_LABEL[stOf(c)], c.conversation])]
    const text = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = 'AI corrections.csv'
    document.body.appendChild(a); a.click(); a.remove()
  }

  const count = (k: 'all' | St) => corrections.filter(c => inQ(c) && (k === 'all' || stOf(c) === k)).length
  const ctxC = ctx ? corrections.find(c => c.id === ctx.id) ?? null : null
  const ctxSt = ctxC ? stOf(ctxC) : null

  return (
    <div className={b.wrap}>
      <section className={b.board} style={{ gridTemplateColumns: '200px minmax(0, 1fr) 400px' }}>
        <div className={b.nav}>
          <span className={s.navKicker}>STATUS</span>
          {(['all', 'open', 'saved', 'dism'] as const).map(k => {
            const n = count(k)
            return (
              <button key={k} type="button" className={b.navBtn} aria-pressed={st === k} onClick={() => setSt(k)}>
                <span className={s.dot} data-st={k === 'all' ? undefined : k} />
                <span className={b.navLabel}>{k === 'all' ? 'All' : ST_LABEL[k]}</span>
                <span className={s.count} data-rust={(k === 'open' && n > 0) || undefined}>{n}</span>
              </button>
            )
          })}
          <div className={s.navGap} />
          <span className={s.navKicker}>TOPIC</span>
          {['All', ...TOPICS].map(t => (
            <button key={t} type="button" className={b.navBtn} aria-pressed={topic === t} onClick={() => setTopic(t)}>
              <span className={s.dot} />
              <span className={b.navLabel}>{t === 'All' ? 'All topics' : t}</span>
              <span className={s.count}>{corrections.filter(c => inQ(c) && (st === 'all' || stOf(c) === st) && (t === 'All' || topicOfC(c) === t)).length}</span>
            </button>
          ))}
          <div className={s.navGap} />
          <span className={s.navKicker}>PERIOD</span>
          {([[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [null, 'All time']] as const).map(([d, l]) => (
            <button key={l} type="button" className={b.navBtn} aria-pressed={days === d} onClick={() => router.push(`/leads/corrections?d=${d ?? 'all'}`)}>
              <span className={s.dot} /><span className={b.navLabel}>{l}</span>
            </button>
          ))}
          <button type="button" className={b.navBtn} onClick={csv} disabled={!corrections.length}>
            <LeadIcon name="download" size={16} className={b.navIcon} /><span className={b.navLabel}>Export CSV</span>
          </button>
        </div>

        <div className={b.mid}>
          <div className={b.midHead}>
            <div className={b.search}>
              <LeadIcon name="search" size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search questions and replies" aria-label="Search questions and replies" />
            </div>
          </div>
          <div className={b.list}>
            {vis.map(c => {
              const k = stOf(c)
              return (
                <div key={c.id} className={s.row} role="option" aria-selected={cur?.id === c.id} tabIndex={0}
                  onClick={() => setSel(c.id)} onKeyDown={e => { if (e.key === 'Enter') setSel(c.id) }}
                  onContextMenu={e => { if (!canManage) return; e.preventDefault(); setSel(c.id); setCtx({ id: c.id, x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 160) }) }}>
                  <div className={s.rowText}>
                    <span className={s.q}>{c.question || 'Customer’s question'}</span>
                    <span className={s.sub}>{topicOfC(c)} · {c.by || 'CS'} · {dateOf(c.at)}</span>
                  </div>
                  <span className={s.st} data-st={k}>{ST_LABEL[k]}</span>
                </div>
              )
            })}
            {!vis.length ? <div className={b.empty}>{ready ? 'Nothing here' : 'Waiting for the database update'}</div> : null}
          </div>
        </div>

        <div className={b.side}>
          {cur ? (() => {
            const k = stOf(cur)
            return (
              <div className={b.detail}>
                <div className={s.block}><span className={b.sectKicker}>CUSTOMER ASKED</span><span className={s.asked}>{cur.question || 'Customer’s question'}</span></div>
                <div className={s.block}><span className={b.sectKicker}>AI SAID</span><div className={s.said}>{cur.wrong}</div></div>
                <div className={s.block}>
                  <span className={b.sectKicker}>CORRECT ANSWER</span>
                  <textarea className={s.right} rows={4} value={edits[cur.id] ?? answerOf(cur)?.answer ?? cur.right} maxLength={2000} disabled={!canManage}
                    aria-label="Correct answer" onChange={e => setEdits(x => ({ ...x, [cur.id]: e.target.value }))} />
                </div>
                <div className={b.kv}>
                  <div className={b.kvRow}><span>Topic</span><span>{topicOfC(cur)}</span></div>
                  <div className={b.kvRow}><span>Corrected by</span><span>{cur.by || 'CS'} · {dateOf(cur.at)}</span></div>
                  <div className={b.kvRow}><span>Chat</span><span><Link href={`/leads?c=${cur.contactId}`} style={{ color: 'inherit' }}>{cur.conversation}</Link> · {brandName(cur.brandId)}</span></div>
                </div>
                {error ? <span className={b.error} role="alert">{error}</span> : null}
                {k === 'open' && canManage ? (
                  <div className={s.acts}>
                    <button type="button" className={s.save} disabled={busy} onClick={() => save(cur)}>Save as fixed answer</button>
                    <button type="button" className={s.dismiss} disabled={busy || !ready} onClick={() => dismiss(cur, true)}>Dismiss</button>
                  </div>
                ) : null}
                {k === 'saved' ? (
                  <div className={s.done} data-st="saved">
                    <span>Saved as fixed answer</span>
                    {canManage && edits[cur.id] !== undefined && edits[cur.id] !== answerOf(cur)?.answer
                      ? <button type="button" className={s.doneBtn} disabled={busy} onClick={() => save(cur)}>Update</button>
                      : <Link className={s.doneBtn} href={`/leads/ai?b=${cur.brandId}&tab=answers`}>View</Link>}
                  </div>
                ) : null}
                {k === 'dism' ? (
                  <div className={s.done} data-st="dism">
                    <span>Dismissed</span>
                    {canManage ? <button type="button" className={s.doneBtn} disabled={busy} onClick={() => dismiss(cur, false)}>Undo</button> : null}
                  </div>
                ) : null}
              </div>
            )
          })() : null}
        </div>
      </section>

      {ctx && ctxC ? (
        <>
          <div className={s.ctxCatch} onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null) }} aria-hidden="true" />
          <div className={s.ctx} role="menu" style={{ left: ctx.x, top: ctx.y }}>
            {ctxSt !== 'saved' ? <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { setCtx(null); save(ctxC) }}>Save as fixed answer</button> : null}
            {ctxSt === 'open' ? <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { setCtx(null); dismiss(ctxC, true) }}>Dismiss</button> : null}
            {ctxSt === 'dism' ? <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { setCtx(null); dismiss(ctxC, false) }}>Move back to review</button> : null}
            {ctxSt === 'saved' ? <Link role="menuitem" className={s.ctxItem} href={`/leads/ai?b=${ctxC.brandId}&tab=answers`}>View fixed answer</Link> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
