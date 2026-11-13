'use client'

import { useEffect, useState } from 'react'
import TaskFlowAvatar from './TaskFlowAvatar'
import s from './taskflow.module.css'

// The reassign / handoff modal (420px — Task Flow.dc.html): people with their role and "{n} active" (red at 5 or more),
// ✓ on the person now. The handoff's lists only the shortlist. A reassign may say why (optional, at most 300 — kept on
// the trail and in the notices, mkt_stage_reassign).

export interface PeopleRow {
  id: string
  name: string
  role: string
  load: number
  hue: number
  current: boolean
  busy: boolean
}

export const REASON_MAX = 300

export default function TaskFlowPeople({ title, sub, people, onPick, onClose, askReason = false }: {
  title: string
  sub: string
  people: PeopleRow[]
  onPick: (id: string, reason: string) => void
  onClose: () => void
  /** Offer "Why? (optional)" — a reassign's. */
  askReason?: boolean
}) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className={s.scrim} onClick={onClose}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className={s.mHead}>
          <span className={s.mTitle}>{title}</span>
          <span className={s.mSub}>{sub}</span>
        </div>
        <div className={s.mList}>
          {people.map(p => (
            <button key={p.id} type="button" className={`${s.mRow}${p.current ? ` ${s.mRowOn}` : ''}`} onClick={() => onPick(p.id, reason.trim())}>
              <TaskFlowAvatar init={p.name.charAt(0) || '?'} hue={p.hue} size={28} />
              <span className={s.mWho}>
                <span className={s.mName}>{p.name}</span>
                <span className={s.mRole}>{p.role}</span>
              </span>
              <span className={`${s.mLoad}${p.busy ? ` ${s.mLoadRed}` : ''}`}>{p.load} active</span>
              <span className={s.mTick}>{p.current ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        {askReason ? (
          <div className={s.mReason}>
            <input className={s.input} value={reason} maxLength={REASON_MAX} placeholder="Why? (optional)" aria-label="Why (optional)"
              onChange={e => setReason(e.target.value)} />
            <span className={s.mCount}>{reason.length}/{REASON_MAX}</span>
          </div>
        ) : null}
        <div className={s.mFoot}>Load = tasks they have open right now.</div>
      </div>
    </div>
  )
}
