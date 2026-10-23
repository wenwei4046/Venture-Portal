'use client'

import { useEffect, useState, useTransition } from 'react'
import { ACCEPT_HOURS, workingHours } from '@/lib/marketing/board'
import { answerPic } from '@/lib/marketing/pic-actions'
import {
  bothState, dateWords, nameOk, picAnswered, picBanner, picStatus, picTimeline, reasonOk, receiptTime, type PicField, type PicPage as Page,
} from '@/lib/marketing/pic'
import type { Tone } from '@/lib/marketing/task'
import PicWork from './PicWork'
import s from './pic.module.css'

// The PIC's link (⑤-1, `PIC Link.dc.html`) — the subsidiary's PIC, who has no login, reads the meeting minutes as far
// as the template lets them see and approves (their full name typed) or asks for changes (their words, 5–500). Where
// it stands, why it waits for them again, the progress; after an answer, the receipt. Once the work is under way, the
// work too (②b-2d, PicWork): each deliverable, the stage waiting for them answered on the same link. The code is the
// only key.

const TONE: Record<Tone, string> = { waiting: s.waiting, done: s.done, red: s.red, draft: s.draft }

function Value({ field }: { field: PicField }) {
  const v = field.value
  if (v === null) return <dd className={`${s.v} ${s.empty}`}>—</dd>
  if (typeof v === 'string') return <dd className={s.v}>{field.type === 'Date' ? dateWords(v) : v}</dd>
  if (Array.isArray(v)) return <dd className={s.v}>{v.join(', ')}</dd>
  return (
    <dd className={s.v}>
      <div className={s.tableWrap}>
        <table className={s.table}>
          {v.cols.length ? <thead><tr>{v.cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead> : null}
          <tbody>
            {v.rows.map((r, i) => <tr key={i}>{(v.cols.length ? v.cols : r).map((_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </dd>
  )
}

export default function PicPage({ code, initial }: { code: string; initial: Page | null }) {
  const [page, setPage] = useState(initial)
  const [step, setStep] = useState<'choose' | 'approve' | 'changes'>('choose')
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // How long it has waited for them, only once in the browser (the server's clock and the browser's differ).
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [page])

  const top = (
    <header className={s.top}>
      <div className={s.topIn}>
        <span className={s.logo} aria-hidden="true">H</span>
        <span className={s.brand}>HOUZS Marketing</span>
        <span className={s.grow} />
        <span className={s.topNote}>Project tracking</span>
      </div>
    </header>
  )
  if (!page) {
    return (
      <div className={`mkt-pic ${s.root}`}>
        {top}
        <main className={s.main}>
          <div className={s.closed}><div className={s.closedTitle}>This link is closed</div></div>
        </main>
      </div>
    )
  }

  // Both PICs sign off (②b-2d-2b): theirs in, the minutes wait for the other — nothing more to answer here.
  const both = page.status === 'waiting_pic' ? bothState(page.both, page.ok, page.you, page.other) : null
  const status = both?.mine ? { label: `Waiting for ${both.other}`, tone: 'waiting' as Tone } : picStatus(page.status)
  const overdue = !!now && page.status === 'waiting_pic' && !both?.mine && !!page.sentAt && workingHours(page.sentAt, now, new Set()) >= ACCEPT_HOURS
  const banner = picBanner(page, overdue)
  const answered = picAnswered(page)
  const steps = picTimeline(page)
  const waiting = page.status === 'waiting_pic' && !both?.mine
  const go = (to: typeof step) => {
    setError(null)
    setStep(to)
  }
  const send = (decision: 'approve' | 'changes') =>
    start(async () => {
      setError(null)
      const r = await answerPic(code, decision, name, reason)
      if (!r.ok) {
        setError(r.reason)
        return
      }
      if (r.page) setPage(r.page)
      setStep('choose')
    })

  return (
    <div className={`mkt-pic ${s.root}`}>
      {top}
      <main className={s.main}>
        <div className={s.sub}>{[page.sub, page.product].filter(Boolean).join(' · ')}</div>
        <h1 className={s.title}>{page.title}</h1>
        <div className={s.idRow}>
          <span className={s.track}>{page.track}</span>
          <span className={`${s.pill} ${TONE[status.tone]}`}><span className={s.dot} aria-hidden="true" />{status.label}</span>
        </div>

        {banner ? (
          <div className={`${s.banner} ${TONE[banner.tone]}`} role="status">
            <span className={s.dot} aria-hidden="true" />
            <div>
              <div className={s.bannerTitle}>{banner.title}</div>
              <div className={s.bannerText}>{banner.text}</div>
            </div>
          </div>
        ) : null}

        <div className={s.grid}>
          <div className={s.col}>
            <PicWork code={code} page={page} onPage={p => setPage(p)} />
            {answered ? (
              <div className={s.answered}>
                <span className={`${s.mark}${answered.approved ? ` ${s.markOk}` : ''}`} aria-hidden="true">{answered.approved ? '✓' : '↺'}</span>
                <div className={s.answeredTitle}>{answered.title}</div>
                <div className={s.answeredText}>{answered.text}</div>
                {answered.quote ? <div className={s.quote}>“{answered.quote}”</div> : null}
                <div className={s.receipt}>{answered.receipt}</div>
              </div>
            ) : null}

            <section className={s.card} aria-label="Meeting minutes">
              <div className={s.cardHead}>
                <span className={s.cardTitle}>{waiting ? 'Needs your approval' : 'Requirements'}</span>
                <span className={s.grow} />
                {waiting && page.sentAt ? <span className={s.cardMeta}>Sent {receiptTime(page.sentAt)}</span> : null}
              </div>
              <div className={s.minutesTitle}>Meeting minutes · {page.minutes.title}</div>
              <dl className={s.fields}>
                {page.minutes.fields.filter(f => f.type !== 'Signature' || f.value !== null).map(f => (
                  <div key={f.name} className={s.kv}>
                    <dt className={s.k}>{f.name}</dt>
                    <Value field={f} />
                  </div>
                ))}
              </dl>

              {both?.mine ? <div className={s.workLast}>You approved · waiting for {both.other}</div> : null}
              {waiting && step === 'choose' ? (
                <div className={s.choose}>
                  <button type="button" className={`${s.btn} ${s.approve}`} onClick={() => go('approve')}>Approve</button>
                  <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go('changes')}>Request changes</button>
                </div>
              ) : null}
              {waiting && step === 'approve' ? (
                <div className={s.step}>
                  <div className={s.stepTitle}>You’re approving the minutes</div>
                  <div className={s.stepText}>This confirms the meeting minutes as they are. Type your full name to sign off.</div>
                  <input className={s.nameInput} value={name} maxLength={80} placeholder="Full name" aria-label="Full name" autoComplete="name"
                    onChange={e => setName(e.target.value)} />
                  {error ? <div className={s.error} role="alert">{error}</div> : null}
                  <div className={s.stepBtns}>
                    <button type="button" className={`${s.btn} ${s.ghost} ${s.back}`} disabled={pending} onClick={() => go('choose')}>Back</button>
                    <button type="button" className={`${s.btn} ${s.approve}`} disabled={pending || !nameOk(name)} onClick={() => send('approve')}>
                      {pending ? 'Sending…' : 'Confirm approval'}
                    </button>
                  </div>
                </div>
              ) : null}
              {waiting && step === 'changes' ? (
                <div className={s.step}>
                  <div className={s.stepTitle}>What should change?</div>
                  <div className={s.stepText}>A reason is required. Be as specific as you can.</div>
                  <textarea className={`${s.reasonInput}${reason && !reasonOk(reason) ? ` ${s.reasonBad}` : ''}`} value={reason} maxLength={500}
                    placeholder="e.g. Add Threads, and start the campaign on 5 Nov" aria-label="What should change" onChange={e => setReason(e.target.value)} />
                  <div className={`${s.hintRow}${reasonOk(reason) ? ` ${s.hintOk}` : ''}`}>
                    <span>{reasonOk(reason) ? 'Ready to send' : 'Required'}</span>
                    <span className={s.mono}>{reason.length}/500</span>
                  </div>
                  {error ? <div className={s.error} role="alert">{error}</div> : null}
                  <div className={s.stepBtns}>
                    <button type="button" className={`${s.btn} ${s.ghost} ${s.back}`} disabled={pending} onClick={() => go('choose')}>Back</button>
                    <button type="button" className={`${s.btn} ${s.dark}`} disabled={pending || !reasonOk(reason)} onClick={() => send('changes')}>
                      {pending ? 'Sending…' : 'Send to the team'}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className={s.col}>
            <section className={`${s.card} ${s.progress}`} aria-label="Progress">
              <div className={`${s.cardTitle} ${s.progressHead}`}>Progress</div>
              {steps.map((t, i) => (
                <div key={t.label} className={s.tl}>
                  <div className={s.tlRail}>
                    <span className={`${s.tlMark}${t.state === 'done' ? ` ${s.tlDone}` : t.state === 'cur' ? ` ${s.tlCur}` : ''}`}>{t.state === 'done' ? '✓' : ''}</span>
                    {i < steps.length - 1 ? <span className={`${s.tlLine}${t.state === 'done' ? ` ${s.tlLineDone}` : ''}`} /> : null}
                  </div>
                  <div className={s.tlBody}>
                    <div className={s.tlTop}>
                      <span className={`${s.tlLabel}${t.state === 'cur' ? ` ${s.tlLabelCur}` : t.state === 'next' ? ` ${s.tlLabelNext}` : ''}`}>{t.label}</span>
                      {t.date ? <span className={s.tlDate}>{t.date}</span> : null}
                    </div>
                    {t.sub ? <div className={s.tlSub}>{t.sub}</div> : null}
                  </div>
                </div>
              ))}
            </section>
            <p className={s.foot}>
              Questions? Reply to {page.owner ?? 'the team'} on WhatsApp. This link is private to {page.sub || 'you'} — please don’t forward it.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
