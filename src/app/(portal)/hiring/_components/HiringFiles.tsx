'use client'

import type { ReactNode } from 'react'
import { Select } from '@/components/hrv/select'
import { addHiringFileType, type UploadedFile } from '@/lib/hiring/actions'
import { HIRING_ACCEPT, extLabel, startingType } from '@/lib/hiring/files'
import { uploadHiringFile } from '@/lib/hiring/upload'
import type { HiringFile, HiringFileType } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * A candidate's and a talent's files (2026-10-11, the user's answer: several
 * files, each with a file type — mig 20261011160000). No prototype draws this:
 * a file is the résumé row it replaces — the olive extension tile, the name,
 * its type under it — and a file chosen in a form waits, with its type, until
 * Save. The type is picked from the list, or named with "+ Add a new file
 * type…" (Edit), as Documentation's letter types are.
 */

export const NEW_TYPE = '__new'

/** A file chosen in a form, waiting to go up on Save. */
export interface Waiting {
  key: string
  file: File
  /** A type's id, NEW_TYPE (named in `newName`) or '' (not picked yet). */
  typeId: string
  newName: string
}

/**
 * The type picker: the types that are on (Form settings turns one off — it
 * leaves the picker, the files filed under it keep it), then "+ Add a new file
 * type…" (Edit), which names one in a field beside it.
 */
export function FileTypePick({
  types,
  value,
  newName,
  canAdd,
  label,
  onChange,
  onNewName,
}: {
  types: readonly HiringFileType[]
  value: string
  newName: string
  canAdd: boolean
  label: string
  onChange: (value: string) => void
  onNewName: (name: string) => void
}) {
  return (
    <>
      <Select bare className={`${s.select} ${s.hfType}`} value={value} aria-label={label} onChange={e => onChange(e.target.value)}>
        <option value="">Choose type…</option>
        {types.filter(t => t.active).map(t => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        {canAdd ? <option value={NEW_TYPE}>+ Add a new file type…</option> : null}
      </Select>
      {value === NEW_TYPE ? (
        <input className={`${s.input} ${s.hfTypeNew}`} value={newName} maxLength={60} placeholder="e.g. Driving licence" aria-label="New file type" onChange={e => onNewName(e.target.value)} />
      ) : null}
    </>
  )
}

/** One file as a row: its extension tile, its name, its type under it, then what may be done with it. */
export function FileRow({ name, type, struck = false, children }: { name: string; type: string; struck?: boolean; children?: ReactNode }) {
  return (
    <div className={s.hfRow} data-struck={struck ? 'true' : undefined}>
      <span className={s.extTile}>{extLabel(name)}</span>
      <span className={s.hfMain}>
        <span className={s.hfName}>{name}</span>
        <span className={s.hfKind}>{struck ? `${type} · removed on Save` : type}</span>
      </span>
      {children}
    </div>
  )
}

/**
 * The files a form will add: each with its type picker and ×, then the dashed
 * box that chooses more ("Upload résumé" while the record has no file at all).
 * A newly chosen file starts as the Résumé while there is none.
 */
export function WaitingFiles({
  types,
  kept,
  waiting,
  canAddType,
  onChange,
}: {
  types: readonly HiringFileType[]
  kept: readonly HiringFile[]
  waiting: readonly Waiting[]
  canAddType: boolean
  onChange: (next: Waiting[]) => void
}) {
  const choose = (list: FileList | null) => {
    if (!list?.length) return
    const next = [...waiting]
    for (const file of Array.from(list)) {
      next.push({ key: `${file.name}-${file.size}-${next.length}-${Date.now()}`, file, typeId: startingType(types, kept, next), newName: '' })
    }
    onChange(next)
  }
  const set = (key: string, patch: Partial<Waiting>) => onChange(waiting.map(w => (w.key === key ? { ...w, ...patch } : w)))
  const say = kept.length === 0 && waiting.length === 0 ? 'Upload résumé' : 'Add another file'
  return (
    <>
      {waiting.map(w => (
        <div key={w.key} className={s.hfRow}>
          <span className={s.extTile}>{extLabel(w.file.name)}</span>
          <span className={s.hfMain}>
            <span className={s.hfName}>{w.file.name}</span>
            <span className={s.hfKind}>Uploads on Save</span>
          </span>
          <FileTypePick
            types={types}
            value={w.typeId}
            newName={w.newName}
            canAdd={canAddType}
            label={`What ${w.file.name} is`}
            onChange={typeId => set(w.key, { typeId })}
            onNewName={newName => set(w.key, { newName })}
          />
          <button type="button" className={s.hfX} aria-label={`Leave out ${w.file.name}`} onClick={() => onChange(waiting.filter(x => x.key !== w.key))}>
            ×
          </button>
        </div>
      ))}
      <label className={s.fileDrop}>
        <span className={s.fileDropName}>{say}</span>
        <span className={s.fileDropBtn}>Choose file</span>
        <input
          type="file"
          multiple
          accept={HIRING_ACCEPT}
          className={s.hiddenFile}
          aria-label={say}
          onChange={e => {
            choose(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
    </>
  )
}

/** Why the waiting files cannot go yet, or null. */
export function waitingProblem(waiting: readonly Waiting[]): string | null {
  if (waiting.some(w => !w.typeId)) return 'Pick what kind of file it is.'
  if (waiting.some(w => w.typeId === NEW_TYPE && !w.newName.trim())) return 'Name the new file type.'
  return null
}

/**
 * The waiting files sent up: a new type named first (once per name — one the
 * list already has on is that one; one that was turned off comes back on
 * through the database), then each file straight into the bucket from the
 * browser. What the form then files, or why not. An upload a failure leaves
 * behind is cleared within the hour once a day old.
 */
export async function sendWaiting(
  waiting: readonly Waiting[],
  types: readonly HiringFileType[],
): Promise<{ ok: true; files: UploadedFile[] } | { ok: false; reason: string }> {
  const named = new Map<string, string>()
  const files: UploadedFile[] = []
  for (const w of waiting) {
    let typeId = w.typeId
    if (typeId === NEW_TYPE) {
      const name = w.newName.trim()
      const key = name.toLowerCase()
      const known = types.find(t => t.active && t.name.trim().toLowerCase() === key)?.id ?? named.get(key)
      if (known) typeId = known
      else {
        const added = await addHiringFileType(name)
        if (!added.ok) return { ok: false, reason: added.reason }
        named.set(key, added.id)
        typeId = added.id
      }
    }
    const up = await uploadHiringFile(w.file)
    if (!up.ok) return { ok: false, reason: up.reason }
    files.push({ path: up.path, name: up.name, typeId })
  }
  return { ok: true, files }
}
