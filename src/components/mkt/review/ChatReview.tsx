'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { flash } from '@/components/hrv/toast'
import { openMktChatReview } from '@/lib/marketing/actions'
import { chatTime } from '@/lib/marketing/chat'
import {
  REASON_MAX, reviewPair, reviewProblem, reviewWhen, tidyReason, type ChatReview as Review, type ChatReviewLog, type ChatReviewOpen,
} from '@/lib/marketing/chat-review'
import { readChatReviewMore } from './review-read'
import s from './review.module.css'

// Chat review (⑦-3b; the user's answer 35, amended): a direct message opened on a complaint by a full-access title's own
// login — the two people and the reason first; then their messages, read only (the first of the two on the left); every
// opening a record, kept for good and listed under it. Nobody is told; no read mark moves.

export default function ChatReview({ log }: { log: ChatReviewLog }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState<ChatReviewOpen | null>(null)
  // Records made here, until the page's own read has them.
  const [made, setMade] = useState<Review[]>([])
  const [pending, start] = useTransition()
  const [reading, setReading] = useState(false)

  const reviews = useMemo(() => {
    const kept = new Set(log.reviews.map(r => r.id))
    return [...made.filter(r => !kept.has(r.id)), ...log.reviews]
  }, [made, log.reviews])
  const firstOf = (staff: string, fallback: string) => log.people.find(p => p.staff === staff)?.first ?? fallback

  const submit = () => {
    if (pending) return
    const problem = reviewProblem(a || null, b || null, reason)
    if (problem) {
      flash(problem)
      return
    }
    start(async () => {
      const r = await openMktChatReview(a, b, tidyReason(reason))
      if (!r.ok) {
        flash(r.reason)
        return
      }
      setOpen(r.open)
      setMade(cur => [r.open.review, ...cur])
      setReason('')
    })
  }

  const earlier = async () => {
    if (!open || !open.messages.length || reading) return
    setReading(true)
    try {
      const r = await readChatReviewMore(open.review.id, open.messages[0].id)
      if ('reason' in r) {
        flash(r.reason)
        return
      }
      setOpen(cur => (cur ? { ...cur, messages: [...r.messages, ...cur.messages], more: r.more } : cur))
    } finally {
      setReading(false)
    }
  }

  return (
    <div className={s.page}>
      <div className={s.head}>
        <span className={s.headIcon} aria-hidden="true">🔍</span>
        <h1 className={s.title}>Chat review</h1>
      </div>

      {open ? (
        <section className={s.card} aria-label="The chat opened">
          <div className={s.openHead}>
            <button type="button" className={s.back} aria-label="Close the chat" title="Close" onClick={() => setOpen(null)}>←</button>
            <span className={s.openPair}>
              {firstOf(open.review.a.staff, open.review.a.name)} ↔ {firstOf(open.review.b.staff, open.review.b.name)}
            </span>
            <span className={s.chip}>Logged</span>
          </div>
          <div className={s.openReason}>{open.review.reason}</div>
          <div className={s.openMeta}>{reviewWhen(open.review.at)} · {open.review.by}</div>
          <div className={s.log} role="log" aria-label="Their messages">
            {open.more ? (
              <button type="button" className={s.earlier} disabled={reading} onClick={() => void earlier()}>Earlier messages</button>
            ) : null}
            {open.messages.length ? null : <div className={s.empty}>No messages</div>}
            {open.messages.map(m => (
              <div key={m.id} className={s.msg} data-side={m.from === open.review.b.staff ? 'b' : 'a'}>
                <span className={s.meta}>{m.first || 'Someone'} · {chatTime(m.at)}</span>
                {m.body ? <div className={s.bubble}>{m.body}</div> : null}
                {m.project ? (
                  <Link href={`/marketing/projects/${encodeURIComponent(m.project.track || m.project.id)}`} className={s.task}>
                    <span className={s.taskId}>📎 {m.project.track}</span>
                    <span className={s.taskTitle}>{m.project.title}</span>
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className={s.card} aria-label="Open a chat">
          <div className={s.pair}>
            <label className={s.field}>
              <span className={s.label}>Person</span>
              <select className={s.select} value={a} onChange={e => setA(e.target.value)} aria-label="The first person">
                <option value="" disabled>Pick a person</option>
                {log.people.map(p => (
                  <option key={p.staff} value={p.staff} disabled={p.staff === b}>{p.first}{p.title ? ` · ${p.title}` : ''}</option>
                ))}
              </select>
            </label>
            <span className={s.and} aria-hidden="true">↔</span>
            <label className={s.field}>
              <span className={s.label}>Person</span>
              <select className={s.select} value={b} onChange={e => setB(e.target.value)} aria-label="The second person">
                <option value="" disabled>Pick a person</option>
                {log.people.map(p => (
                  <option key={p.staff} value={p.staff} disabled={p.staff === a}>{p.first}{p.title ? ` · ${p.title}` : ''}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={s.field}>
            <span className={s.label}>Reason</span>
            <input className={s.input} value={reason} maxLength={REASON_MAX} aria-label="Reason" onChange={e => setReason(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }} />
          </label>
          <div className={s.foot}>
            <button type="button" className={s.primary} disabled={pending} onClick={submit}>Open chat</button>
          </div>
        </section>
      )}

      <section className={s.records} aria-label="Records">
        <h2 className={s.sectionTitle}>
          Records <span className={s.count}>{reviews.length}</span>
        </h2>
        {reviews.length ? (
          <table className={s.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Opened by</th>
                <th>Chat</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => (
                <tr key={r.id}>
                  <td className={s.when}>{reviewWhen(r.at)}</td>
                  <td>{r.by}</td>
                  <td>{reviewPair(r)}</td>
                  <td className={s.reason}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={s.empty}>No records yet</div>
        )}
      </section>
    </div>
  )
}
