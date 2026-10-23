'use client'

import { useState, useTransition } from 'react'
import { answerPicStage } from '@/lib/marketing/pic-actions'
import { nameOk, stageReasonOk, workLastLine, workState, workWaiting, type PicNo, type PicPage, type PicWork as Work } from '@/lib/marketing/pic'
import type { Tone } from '@/lib/marketing/task'
import s from './pic.module.css'

// The work on the PIC's link (②b-2d, `PIC Task Link.dc.html`): each deliverable of the project, where it stands in
// plain words; the one waiting for the PIC opened — what they may see of it (its fields, its links, the team's words
// for them), Approve (their full name) or Request changes (what should change). One answer per version sent; after it,
// the receipt — theirs, or the other PIC's when the project has two (either one's answer counts, ②b-2d-2a). The code
// is the only key (mkt_pic_stage_answer checks it).

const TONE: Record<Tone, string> = { waiting: s.waiting, done: s.done, red: s.red, draft: s.draft }

function Item({ code, work, today, you, onPage }: { code: string; work: Work; today: string; you: PicNo; onPage: (p: PicPage | null) => void }) {
  const [step, setStep] = useState<'choose' | 'approve' | 'changes'>('choose')
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const st = workState(work, today, you)
  const stage = work.stage
  const waiting = !!stage?.waiting
  const go = (to: typeof step) => {
    setError(null)
    setStep(to)
  }
  const send = (decision: 'approve' | 'changes') =>
    start(async () => {
      if (!stage) return
      setError(null)
      const r = await answerPicStage(code, work.id, stage.ver, decision, name, reason)
      if (!r.ok) {
        setError(r.reason)
        return
      }
      onPage(r.page)
      setStep('choose')
      setReason('')
    })
  const last = work.last

  return (
    <div className={`${s.workItem}${waiting ? ` ${s.workOpen}` : ''}`} aria-label={work.title}>
      <div className={s.workHead}>
        <span className={s.workTitle}>{work.title}</span>
        <span className={s.grow} />
        <span className={`${s.pill} ${TONE[st.tone]}`}><span className={s.dot} aria-hidden="true" />{st.label}</span>
      </div>
      <div className={s.workMeta}>{work.done} of {work.stages} steps done{stage && !waiting && work.status !== 'done' ? ` · now: ${stage.name}` : ''}</div>
      {waiting && stage ? (
        <>
          <div className={s.workStage}>{stage.name} · version {stage.ver}</div>
          {stage.note ? <div className={s.workNote}>{stage.note}</div> : null}
          {stage.fields.length ? (
            <dl className={s.fields}>
              {stage.fields.map(f => (
                <div key={f.name} className={s.kv}>
                  <dt className={s.k}>{f.name}</dt>
                  {f.value === null ? <dd className={`${s.v} ${s.empty}`}>—</dd>
                    : /^https:\/\//i.test(f.value) ? <dd className={s.v}><a className={s.link} href={f.value} target="_blank" rel="noreferrer noopener">{f.value}</a></dd>
                      : <dd className={s.v}>{f.value}</dd>}
                </div>
              ))}
            </dl>
          ) : null}
          {stage.links.length ? (
            <div className={s.workLinks}>
              {stage.links.map(l => (
                <a key={l.url} className={s.link} href={l.url} target="_blank" rel="noreferrer noopener">{l.label || l.url}</a>
              ))}
            </div>
          ) : null}
          {step === 'choose' ? (
            <div className={s.choose}>
              <button type="button" className={`${s.btn} ${s.approve}`} onClick={() => go('approve')}>Approve</button>
              <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go('changes')}>Request changes</button>
            </div>
          ) : null}
          {step === 'approve' ? (
            <div className={s.step}>
              <div className={s.stepTitle}>You’re approving {stage.name}</div>
              <div className={s.stepText}>This confirms version {stage.ver} as it is. Type your full name to sign off.</div>
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
          {step === 'changes' ? (
            <div className={s.step}>
              <div className={s.stepTitle}>What should change?</div>
              <div className={s.stepText}>A reason is required. Be as specific as you can.</div>
              <textarea className={`${s.reasonInput}${reason && !stageReasonOk(reason) ? ` ${s.reasonBad}` : ''}`} value={reason} maxLength={1000}
                placeholder="e.g. Make the logo bigger" aria-label="What should change" onChange={e => setReason(e.target.value)} />
              <div className={`${s.hintRow}${stageReasonOk(reason) ? ` ${s.hintOk}` : ''}`}>
                <span>{stageReasonOk(reason) ? 'Ready to send' : 'Required'}</span>
                <span className={s.mono}>{reason.length}/1000</span>
              </div>
              {error ? <div className={s.error} role="alert">{error}</div> : null}
              <div className={s.stepBtns}>
                <button type="button" className={`${s.btn} ${s.ghost} ${s.back}`} disabled={pending} onClick={() => go('choose')}>Back</button>
                <button type="button" className={`${s.btn} ${s.dark}`} disabled={pending || !stageReasonOk(reason)} onClick={() => send('changes')}>
                  {pending ? 'Sending…' : 'Send to the team'}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : last ? (
        <div className={s.workLast}>{workLastLine(last, you)}</div>
      ) : null}
    </div>
  )
}

export default function PicWork({ code, page, onPage }: { code: string; page: PicPage; onPage: (p: PicPage | null) => void }) {
  if (!page.work.length) return null
  const waiting = workWaiting(page.work)
  return (
    <section className={s.card} aria-label="The work">
      <div className={s.cardHead}>
        <span className={s.cardTitle}>{waiting ? 'Needs your approval' : 'The work'}</span>
        <span className={s.grow} />
        <span className={s.cardMeta}>{page.work.filter(w => w.status === 'done').length}/{page.work.length} done</span>
      </div>
      <div className={s.workList}>
        {[...page.work].sort((a, b) => Number(!!b.stage?.waiting) - Number(!!a.stage?.waiting)).map(w => (
          <Item key={w.id} code={code} work={w} today={page.today} you={page.you} onPage={onPage} />
        ))}
      </div>
    </section>
  )
}
