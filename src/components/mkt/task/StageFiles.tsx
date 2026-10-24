'use client'

import { useRef, useState } from 'react'
import { officeTime } from '@/lib/office-time'
import { sizeText } from '@/lib/marketing/task'
import type { StageFile } from '@/lib/marketing/tasks'
import { fileRoute } from '@/lib/storage/browser'
import s from './task.module.css'
import u from './subtasks.module.css'

// A stage's own files (`Task Page.dc.html`'s *Drop the final cut here* — ②b-2e): each a card — 📎 the name (opened through
// the bucket's signed link), its size, *Uploaded by Ali · 25 Oct*, × while the stage is its owner's to work — and, then, the
// drop zone. The page sends what is dropped (StageFiles only says what was picked).

export default function StageFiles({ files, live, busy, label, onPick, onRemove }: {
  files: StageFile[]
  /** The viewer's own stage, open to them now. */
  live: boolean
  busy: boolean
  /** What the files are for — a File field's label, or "the stage" — for the drop zone and the screen reader. */
  label: string
  onPick: (list: FileList) => void
  onRemove: (path: string) => void
}) {
  const picker = useRef<HTMLInputElement | null>(null)
  const [over, setOver] = useState(false)
  return (
    <>
      {files.map(f => (
        <span key={f.path} className={u.delivered}>
          <a className={u.deliveredName} href={fileRoute('marketing', f.path)} target="_blank" rel="noreferrer">📎 {f.name}</a>
          <span className={u.deliveredMeta}>
            {sizeText(f.size)}{f.by ? ` · Uploaded by ${f.by}` : ''}{f.at ? ` · ${officeTime(f.at).format('D MMM')}` : ''}
          </span>
          {live ? <button type="button" className={s.fileX} aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => onRemove(f.path)}>×</button> : null}
        </span>
      ))}
      {live ? (
        <>
          <button type="button" className={`${u.drop}${over ? ` ${u.dropOver}` : ''}`} disabled={busy} onClick={() => picker.current?.click()}
            onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onPick(e.dataTransfer.files) }}>
            <span className={u.dropIcon} aria-hidden="true">⬆</span>
            <span className={u.dropText}>Drop the file here</span>
            <span className={u.dropHint}>Any file · up to 2 GB</span>
          </button>
          <input ref={picker} type="file" multiple hidden aria-label={`Upload files for ${label}`}
            onChange={e => { if (e.target.files?.length) onPick(e.target.files); e.target.value = '' }} />
        </>
      ) : null}
    </>
  )
}
