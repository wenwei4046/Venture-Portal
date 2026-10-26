'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { fileRoute } from '@/lib/storage/browser'
import { flash } from '@/components/hrv/toast'
import { attachMktTaskFiles, detachMktTaskFile } from '@/lib/marketing/actions'
import { folderTiles, libraryFromRow, sizeLabel, type Library, type TaskFile } from '@/lib/marketing/library'
import s from './task.module.css'

// A task's files from the Library (⑥-4, `Library.dc.html` › *Attach from Library*): each the Library's own file —
// opened from there, no copy — and, for Marketing · Edit while the task is open, *+ Attach from Library*: the task's
// subsidiary's folders and their files to tick (those on the task already ticked), *Attach n files*. × takes a file off
// the task; it stays in the Library.

export default function TaskLibrary({ project, sub, open, initial, canEdit }: {
  project: string
  sub: string
  open: boolean
  initial: TaskFile[]
  canEdit: boolean
}) {
  const [files, setFiles] = useState(initial)
  const [lib, setLib] = useState<Library | 'loading' | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const on = new Set(files.map(f => f.id))

  const openPicker = async () => {
    setLib('loading')
    setPicked([])
    const { data, error } = await (createClient() as unknown as SupabaseClient).rpc('mkt_library')
    if (error) {
      setLib(null)
      flash(error.message || 'The Library could not be read.')
      return
    }
    setLib(libraryFromRow(data))
  }
  const attach = async () => {
    if (busy || !picked.length) return
    setBusy(true)
    try {
      const r = await attachMktTaskFiles(project, picked)
      if (!r.ok) { flash(r.reason); return }
      setFiles(r.files)
      setLib(null)
      flash(r.attached === 1 ? 'Attached 1 file from the Library' : `Attached ${r.attached} files from the Library`)
    } finally {
      setBusy(false)
    }
  }
  const detach = async (f: TaskFile) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await detachMktTaskFile(project, f.id)
      if (!r.ok) { flash(r.reason); return }
      setFiles(r.files)
      flash(`Took "${f.name}" off the task`)
    } finally {
      setBusy(false)
    }
  }

  const folders = lib && lib !== 'loading' ? folderTiles(lib, sub).filter(t => !t.type.link) : []

  return (
    <div>
      <div className={s.secHead}>
        <span className={s.secIcon} aria-hidden="true">📚</span>
        <span className={s.secTitle}>Library files</span>
        <span className={s.tag}>{files.length}</span>
        <span className={s.grow} />
        {canEdit && open ? (
          <button type="button" className={s.btn} disabled={lib === 'loading'} onClick={() => void openPicker()}>+ Attach from Library</button>
        ) : null}
      </div>
      <div className={s.files}>
        {files.map(f => (
          <span key={f.id} className={s.fileChip}>
            <a href={fileRoute('marketing', f.path)} target="_blank" rel="noreferrer" className={s.libLink}>📚 <span>{f.name}</span></a>
            <span className={s.libMeta}>{f.folder} · {sizeLabel(f.size)}</span>
            {canEdit ? <button type="button" className={s.fileX} aria-label={`Take ${f.name} off the task`} disabled={busy} onClick={() => void detach(f)}>×</button> : null}
          </span>
        ))}
        {!files.length ? <span className={s.noFiles}>No files from the Library</span> : null}
      </div>

      {lib && lib !== 'loading' ? (
        <div className={s.scrim} onClick={() => setLib(null)}>
          <div className={`${s.dialog} ${s.pickDialog}`} role="dialog" aria-modal="true" aria-label="Attach from Library" onClick={e => e.stopPropagation()}>
            <div className={s.dialogTitle}>Attach from Library</div>
            <div className={s.pickList}>
              {folders.map(t => {
                const inside = lib.files.filter(f => f.folder === t.folder.id)
                return (
                  <div key={t.folder.id} className={s.pickFolder}>
                    <div className={s.pickHead}>📁 {t.type.name} <span className={s.libMeta}>{inside.length}</span></div>
                    {inside.map(f => {
                      const already = on.has(f.id)
                      const ticked = already || picked.includes(f.id)
                      return (
                        <label key={f.id} className={`${s.pickRow}${already ? ` ${s.pickOn}` : ''}`}>
                          <input type="checkbox" checked={ticked} disabled={already || busy}
                            onChange={() => setPicked(p => (p.includes(f.id) ? p.filter(x => x !== f.id) : [...p, f.id]))} />
                          <span className={`${s.grow} ${s.pickName}`}>{f.name}</span>
                          <span className={s.libMeta}>{already ? 'on the task' : sizeLabel(f.size)}</span>
                        </label>
                      )
                    })}
                  </div>
                )
              })}
              {!folders.some(t => lib.files.some(f => f.folder === t.folder.id)) ? <div className={s.noFiles}>No files in this subsidiary&rsquo;s Library yet</div> : null}
            </div>
            <div className={s.dialogBtns}>
              <button type="button" className={s.btn} onClick={() => setLib(null)}>Cancel</button>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy || !picked.length} onClick={() => void attach()}>
                {!picked.length ? 'Attach' : picked.length === 1 ? 'Attach 1 file' : `Attach ${picked.length} files`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
