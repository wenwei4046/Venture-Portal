'use client'

import { useState, useTransition } from 'react'
import { answerPicStage } from '@/lib/marketing/pic-actions'
import { nameOk, stageReasonOk, type PicPage } from '@/lib/marketing/pic'
import s from './pic.module.css'

// The PIC's answer on the simpler task view (Workflow Builder 2a › PIC link view): Request changes · Approve in the
// status card; Approve asks their full name, Request changes what should change — sent with the version they read
// (mkt_pic_stage_answer checks the code itself, as before).

export default function PicAnswer({ code, work, stage, ver, onPage }: {
  code: string
  work: string
  stage: string
  ver: number
  onPage: (p: PicPage | null) => void
}) {
  const [step, setStep] = useState<'choose' | 'approve' | 'changes'>('choose')
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const go = (to: typeof step) => {
    setError(null)
    setStep(to)
  }
  const send = (decision: 'approve' | 'changes') =>
    start(async () => {
      setError(null)
      const r = await answerPicStage(code, work, ver, decision, name, reason)
      if (!r.ok) return setError(r.reason)
      onPage(r.page)
      setStep('choose')
      setReason('')
    })
  if (step === 'choose') {
    return (
      <div className={s.choose}>
        <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go('changes')}>Request changes</button>
        <button type="button" className={`${s.btn} ${s.approve}`} onClick={() => go('approve')}>Approve</button>
      </div>
    )
  }
  return step === 'approve' ? (
    <div className={s.step} style={{ flexBasis: '100%' }}>
      <div className={s.stepTitle}>You’re approving {stage}</div>
      <input className={s.nameInput} value={name} maxLength={80} placeholder="Full name" aria-label="Full name" autoComplete="name" onChange={e => setName(e.target.value)} />
      {error ? <div className={s.error} role="alert">{error}</div> : null}
      <div className={s.stepBtns}>
        <button type="button" className={`${s.btn} ${s.ghost} ${s.back}`} disabled={pending} onClick={() => go('choose')}>Back</button>
        <button type="button" className={`${s.btn} ${s.approve}`} disabled={pending || !nameOk(name)} onClick={() => send('approve')}>{pending ? 'Sending…' : 'Confirm approval'}</button>
      </div>
    </div>
  ) : (
    <div className={s.step} style={{ flexBasis: '100%' }}>
      <div className={s.stepTitle}>What should change?</div>
      <textarea className={`${s.reasonInput}${reason && !stageReasonOk(reason) ? ` ${s.reasonBad}` : ''}`} value={reason} maxLength={1000}
        placeholder="e.g. Make the logo bigger" aria-label="What should change" onChange={e => setReason(e.target.value)} />
      {error ? <div className={s.error} role="alert">{error}</div> : null}
      <div className={s.stepBtns}>
        <button type="button" className={`${s.btn} ${s.ghost} ${s.back}`} disabled={pending} onClick={() => go('choose')}>Back</button>
        <button type="button" className={`${s.btn} ${s.dark}`} disabled={pending || !stageReasonOk(reason)} onClick={() => send('changes')}>{pending ? 'Sending…' : 'Send to the team'}</button>
      </div>
    </div>
  )
}
