'use client'

import { useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { attachMktTaskFiles } from '@/lib/marketing/actions'
import type { AttachTask } from '@/lib/marketing/library'
import s from './library.module.css'

// *Attach to task* (`Library.dc.html`, ⑥-4): a file of the Library onto one of its subsidiary's open tasks — each row
// its Track ID, title and where it stands now. The file stays the Library's; the task shows it under Library files.

export default function AttachToTask({ file, name, sub, tasks, onClose }: {
  file: string
  name: string
  sub: string
  tasks: AttachTask[]
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const attach = async (t: AttachTask) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await attachMktTaskFiles(t.id, [file])
      if (!r.ok) { flash(r.reason); return }
      flash(r.attached ? `Attached "${name}" to ${t.trackId}` : `"${name}" is on ${t.trackId} already`)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={s.scrim} onClick={onClose}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-label={`Attach "${name}" to a task`} onClick={e => e.stopPropagation()}>
        <div className={s.dialogHead}>
          <div className={s.dialogTitle}>Attach &ldquo;{name}&rdquo; to a task</div>
          <button type="button" className={s.x} aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className={s.targets}>
          {tasks.map(t => (
            <button key={t.id} type="button" className={s.target} disabled={busy} onClick={() => void attach(t)}>
              <span className={s.taskId}>{t.trackId}</span>
              <span className={`${s.grow} ${s.ellipsis} ${s.taskTitle}`}>{t.title}</span>
              <span className={s.mono}>{t.stage ? `Now at ${t.stage}` : ''}</span>
            </button>
          ))}
          {!tasks.length ? <div className={s.none}>No open tasks for {sub}</div> : null}
        </div>
      </div>
    </div>
  )
}
