'use client'

import { useEffect } from 'react'
import type { WfChange } from '@/lib/marketing/workflows'
import w from './workflows.module.css'

// The publish review (2a, 540px): "Publish v{n} · {Category} / {Template}", what changed against the version running now,
// who is affected, the warnings, Cancel · Publish. Esc and the scrim close it.

export default function PublishReview({
  title,
  sub,
  changes,
  impact,
  warnings,
  next,
  busy,
  onCancel,
  onPublish,
}: {
  title: string
  sub: string
  changes: WfChange[]
  impact: string
  warnings: string[]
  next: number
  busy: boolean
  onCancel: () => void
  onPublish: () => void
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCancel])
  return (
    <div className={w.scrim} onClick={onCancel}>
      <div className={w.modal} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className={w.mHead}>
          <span className={w.mTitle}>{title}</span>
          <span className={w.mSub}>{sub}</span>
        </div>
        <div className={w.mPart}>
          <span className={w.mLabel}>What changed</span>
          {changes.length ? changes.map((c, i) => (
            <div key={`${c.icon}-${i}`} className={w.mChange}>
              <span className={`${w.mIcon}${c.tone === 'add' ? ` ${w.mAdd}` : c.tone === 'remove' ? ` ${w.mRemove}` : ''}`}>{c.icon}</span>
              <span className={w.mText}>{c.text}</span>
            </div>
          )) : <span className={w.mNone}>Nothing changed since the last version.</span>}
        </div>
        <div className={w.mWho}>
          <span className={w.mWhoTitle}>Who is affected</span>
          <span className={w.mWhoText}>{impact}</span>
        </div>
        {warnings.length ? (
          <div className={w.mWarns}>{warnings.map(x => <span key={x} className={w.warn}>⚠️ {x}</span>)}</div>
        ) : null}
        <div className={w.mActs}>
          <button type="button" className={w.mCancel} onClick={onCancel}>Cancel</button>
          <button type="button" className={w.publish} disabled={busy} onClick={onPublish}>Publish v{next}</button>
        </div>
      </div>
    </div>
  )
}
