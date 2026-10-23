'use client'

import { useEffect, useState } from 'react'
import type { ProjectLog } from '@/lib/marketing/audit'
import AuditLog from './AuditLog'
import { readProjectLog } from './read'
import s from './audit.module.css'

// A project's Audit trail, opened from the trail's head on its page (④-3): the handoff draws it as a tab of the product
// task page, which waits for the Assignment plan (②b-2) — until then it opens over the page, read when it opens.

export default function FormalLogSheet({ project, track, onClose }: { project: string; track: string; onClose: () => void }) {
  // undefined: reading; null: could not be read.
  const [log, setLog] = useState<ProjectLog | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void readProjectLog(project).then(l => { if (live) setLog(l) })
    return () => { live = false }
  }, [project])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className={s.scrim} onClick={onClose}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label="Audit trail" onClick={e => e.stopPropagation()}>
        <div className={s.head}>
          <span className={s.title}>Audit trail</span>
          <span className={s.track}>{track}</span>
          <span className={s.grow} />
          <button type="button" className={s.close} aria-label="Close" onClick={onClose} autoFocus>×</button>
        </div>
        <div className={s.body}>
          {log === undefined ? <div className={s.wait}>Reading the log…</div>
            : log === null ? <div className={s.wait}>Could not read the log</div>
            : <AuditLog log={log} />}
        </div>
      </div>
    </div>
  )
}
