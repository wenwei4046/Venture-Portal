'use client'

import { useEffect, useRef, useState } from 'react'
import { Window } from '@/components/hrv/overlay'
import ds from '../documentation.module.css'
import s from './drive.module.css'

/**
 * + New › New folder, and a folder's Rename (2026-10-12): the kit Window, 400px — the name, Cancel · Create /
 * Rename. The page checks the name first (`folderNameRefusal`), the database again (`hr_drive_name_taken`).
 */
export default function FolderNameWindow({
  mode,
  where,
  initial = '',
  check,
  onSave,
  onClose,
}: {
  mode: 'new' | 'rename'
  /** "In HOUZS Venture" — where it is made, or which folder is renamed. */
  where: string
  initial?: string
  check: (name: string) => string | null
  onSave: (name: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const title = mode === 'new' ? 'New folder' : 'Rename folder'

  // The name takes the keys at once — after the Window has put the focus on itself.
  useEffect(() => {
    const t = window.setTimeout(() => {
      field.current?.focus()
      field.current?.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  async function save() {
    if (busy) return
    const refused = check(name)
    if (refused) return setError(refused)
    setBusy(true)
    setError('')
    try {
      const res = await onSave(name.trim())
      if (!res.ok) return setError(res.reason)
      onClose()
    } catch {
      setError(mode === 'new' ? 'The folder could not be made. Please try again.' : 'The folder could not be renamed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Window open onClose={onClose} width={400} scrim={0.22} label={title}>
      <form
        onSubmit={e => {
          e.preventDefault()
          void save()
        }}
      >
        <div className={ds.winHead}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={ds.winTitle}>{title}</div>
            <div className={ds.winSub}>{where}</div>
          </div>
          <button type="button" className={ds.close} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={ds.winBody}>
          <label className={s.winField}>
            <span className={s.winLabel}>Folder name</span>
            <input
              ref={field}
              className={ds.winInput}
              value={name}
              maxLength={80}
              placeholder={mode === 'new' ? 'e.g. Carres Sdn Bhd, or Finance' : undefined}
              onChange={e => {
                setName(e.target.value)
                setError('')
              }}
            />
          </label>
          {error ? <span className={ds.winErr} role="alert">{error}</span> : null}
        </div>
        <div className={ds.winFoot}>
          <button type="button" className={ds.cancel} onClick={onClose}>Cancel</button>
          <button type="submit" className={ds.go} disabled={busy}>{mode === 'new' ? 'Create' : 'Rename'}</button>
        </div>
      </form>
    </Window>
  )
}
