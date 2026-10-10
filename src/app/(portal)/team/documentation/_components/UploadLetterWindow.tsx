'use client'

import { useState } from 'react'
import { Window } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { addLetterType, fileLetter } from '@/lib/documentation/actions'
import { DOC_ACCEPT, fileExt, type LetterType } from '@/lib/documentation/model'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import s from './documentation.module.css'

const NEW = '__new'

/**
 * Data center › Upload (README §10, portal-26): "Upload a letter" to one
 * person's record — the letter type (or "+ Add a new letter type…", which
 * names one), the file, Upload. The letter is sent to them as it is filed.
 */
export default function UploadLetterWindow({
  person,
  types,
  onClose,
}: {
  person: { id: string; name: string }
  types: readonly LetterType[]
  onClose: () => void
}) {
  const [type, setType] = useState('')
  const [newName, setNewName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    if (!type) return setError('Choose the letter type.')
    if (type === NEW && !newName.trim()) return setError('Name the new letter type.')
    if (!file) return setError('Choose a file to upload.')
    setBusy(true)
    setError('')
    try {
      let typeId = type
      let typeName = types.find(t => t.id === type)?.name ?? ''
      if (type === NEW) {
        const existing = types.find(t => t.name.trim().toLowerCase() === newName.trim().toLowerCase())
        if (existing) {
          typeId = existing.id
          typeName = existing.name
        } else {
          const added = await addLetterType(newName.trim())
          if (!added.ok) return setError(added.reason)
          typeId = added.id
          typeName = newName.trim()
        }
      }
      const up = await uploadDocumentationFile({ letterFor: person.id }, file)
      if (!up.ok) return setError(up.reason)
      const res = await fileLetter({ staffId: person.id, typeId, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size })
      if (!res.ok) return setError(res.reason)
      flash(`${typeName} filed to ${person.name}'s record`)
      onClose()
    } catch {
      setError('The letter could not be filed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Window open onClose={onClose} width={460} scrim={0.22} label="Upload a letter">
      <div className={s.winHead}>
        <div style={{ flex: 1 }}>
          <div className={s.winTitle}>Upload a letter</div>
          <div className={s.winSub}>To {person.name}&apos;s record</div>
        </div>
        <button type="button" className={s.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className={s.winBody}>
        <label className={s.field}>
          <span className={s.fieldLabel}>Letter type</span>
          <Select
            bare
            className={s.winSelect}
            value={type}
            onChange={e => {
              setType(e.target.value)
              setError('')
            }}
          >
            <option value="">Choose…</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value={NEW}>+ Add a new letter type…</option>
          </Select>
        </label>
        {type === NEW ? (
          <label className={s.field}>
            <span className={s.fieldLabel}>New letter type</span>
            <input
              className={s.winInput}
              value={newName}
              maxLength={80}
              placeholder="e.g. Confirmation letter"
              onChange={e => {
                setNewName(e.target.value)
                setError('')
              }}
            />
          </label>
        ) : null}
        <label className={s.drop}>
          <span className={s.dropTile} aria-hidden="true">{file ? fileExt(file.name) : '+'}</span>
          <span className={s.dropText}>
            <span className={s.dropName}>{file ? file.name : 'Choose a file'}</span>
            <span className={s.dropHint}>PDF, Word or a scan</span>
          </span>
          <span className={s.dropBtn}>{file ? 'Replace' : 'Browse'}</span>
          <input
            type="file"
            accept={DOC_ACCEPT}
            className={s.hiddenFile}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) {
                setFile(f)
                setError('')
              }
              e.target.value = ''
            }}
          />
        </label>
        {error ? <span className={s.winErr} role="alert">{error}</span> : null}
      </div>
      <div className={s.winFoot}>
        <button type="button" className={s.cancel} onClick={onClose}>Cancel</button>
        <button type="button" className={s.go} onClick={save} disabled={busy}>Upload</button>
      </div>
    </Window>
  )
}
