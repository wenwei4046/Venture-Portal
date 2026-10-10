'use client'

import { useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { adminMemberAction, type AdminMemberData } from '@/app/(member)/member/actions'
import { officeToday } from '@/lib/office-time'
import { shortDay } from '@/lib/commission/sales-group-requests'
import { memoLine, memoRefusal, type MemoReads } from '@/lib/member/member-services'
import s from './member-services.module.css'

/**
 * Member services › Publish memo (2026-10-10, the HR revamp): Title, Body and
 * the departments it goes to; it is sent from People & Culture, in force
 * today, and members acknowledge reading it — the old form's other fields at
 * the values everybody used. Beside it, every memo published and how many of
 * its audience have read it (`member_memo_reads`).
 */
export default function MemoPanel({ data, reads }: { data: AdminMemberData; reads: Record<string, MemoReads> | null }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<string[]>(() => {
    const fair = data.departments.find(d => d.name.trim().toLowerCase() === 'fair')
    return fair ? [fair.id] : []
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function publish() {
    if (busy) return
    const refused = memoRefusal(title, body, audience)
    if (refused) {
      setError(refused)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await adminMemberAction({
        action: 'publish_memo',
        title: title.trim(),
        body: body.trim(),
        sender: 'People & Culture',
        effectiveAt: officeToday(),
        requiresAck: true,
        departments: audience,
        version: 1,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const names = data.departments.filter(d => audience.includes(d.id)).map(d => d.name)
      setTitle('')
      setBody('')
      flash(`Memo published to ${names.join(', ')}`)
    } catch {
      setError('The memo could not be published. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.memoGrid}>
      <section className={s.memoForm} aria-labelledby="memo-new">
        <h2 id="memo-new" className={s.memoTitle}>Publish a new memo</h2>
        <label className={s.field}>
          <span className={s.fieldLabel}>Title</span>
          <input className={s.input} value={title} maxLength={200} onChange={e => { setTitle(e.target.value); setError('') }} />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>Body</span>
          <textarea className={s.input} rows={7} value={body} maxLength={30000} onChange={e => { setBody(e.target.value); setError('') }} />
        </label>
        <div className={s.field}>
          <span className={s.fieldLabel} id="memo-audience">Audience</span>
          <div className={s.audience} role="group" aria-labelledby="memo-audience">
            {data.departments.map(d => {
              const on = audience.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  className={s.aud}
                  aria-pressed={on}
                  onClick={() => setAudience(a => (on ? a.filter(x => x !== d.id) : [...a, d.id]))}
                >
                  {on ? '☑' : '☐'} {d.name}
                </button>
              )
            })}
          </div>
        </div>
        <div className={s.memoFoot}>
          <span className={s.memoErr} role={error ? 'alert' : undefined}>{error}</span>
          <button type="button" className={s.publish} onClick={publish} disabled={busy || !data.canPublishMemos}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </section>

      <section className={s.published} aria-labelledby="memo-published">
        <h2 id="memo-published" className={s.publishedTitle}>Published</h2>
        {data.memos.map(m => (
          <div key={m.id} className={s.memo}>
            <div className={s.memoTop}>
              <span className={s.memoName}>{m.title}</span>
              <span className={s.memoWhen}>{shortDay(m.publishedAt)}</span>
            </div>
            <div className={s.memoLine}>{memoLine(m, reads)}</div>
          </div>
        ))}
        {data.memos.length === 0 ? <p className={s.empty} style={{ margin: 0 }}>Nothing published yet.</p> : null}
      </section>
    </div>
  )
}
