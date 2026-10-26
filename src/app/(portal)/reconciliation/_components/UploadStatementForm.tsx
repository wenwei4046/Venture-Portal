'use client'

import { useId, useState, useTransition, type DragEvent } from 'react'
import { stageInto } from '@/lib/storage/stage'
import { uploadStatement } from '../actions'

// The statement upload (2026-08-08). 2026-10-10 — the handoff draws it as the
// body of the Upload statement modal: Bank account, Statement month, a dashed
// area to choose (or drop) the file, then Cancel / Upload & auto-match. The
// upload itself is as before: one form to uploadStatement, which redirects to
// the new session's review page.
export default function UploadStatementForm({
  banks,
  defaultMonth,
  onCancel,
}: {
  banks: Array<{ id: string; label: string }>
  defaultMonth: string
  /** Closes the modal the form sits in. */
  onCancel?: () => void
}) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [month, setMonth] = useState(defaultMonth)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileId = useId()

  const submit = () => {
    setError(null)
    if (!file) {
      setError('Pick a statement file (.xlsx / .csv)')
      return
    }
    const fd = new FormData()
    fd.set('bank_account_id', bankId)
    fd.set('period_month', month)
    startTransition(async () => {
      try {
        // Sent ahead of the action (2026-10-23, lib/storage/stage.ts) — a statement past a body's 4 MB goes too.
        await stageInto(fd, 'file', file)
        const r = await uploadStatement(fd)
        if (r?.error) setError(r.error)
      } catch (err) {
        // Success ends in redirect() → NEXT_REDIRECT must be re-thrown.
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    })
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer?.files?.[0]
    if (dropped && !isPending) setFile(dropped)
  }

  return (
    <div className="adm-form">
      <label className="adm-field">
        <span>Bank account</span>
        <select value={bankId} onChange={(e) => setBankId(e.target.value)} disabled={isPending} className="adm-input">
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="adm-field">
        <span>Statement month</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={isPending} className="adm-input font-mono" />
      </label>
      <div className="adm-field">
        <span>File</span>
        {/* The input stays in the tab order (hidden from sight); the dashed
            area is its label, so a click or a drop both choose the file. */}
        <input
          id={fileId}
          type="file"
          aria-label="Statement file"
          accept=".xlsx,.xls,.csv,.txt,.pdf"
          disabled={isPending}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="sr-only adm-file"
        />
        <label
          htmlFor={fileId}
          className={`adm-drop${dragOver ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="adm-drop-name">{file ? file.name : 'Choose file'}</span>
          <span className="adm-drop-hint">.xlsx or .csv · PDF needs your bank’s layout first</span>
        </label>
      </div>
      {error ? <p className="sheet-danger">{error}</p> : null}
      <div className="adm-modal-foot">
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={isPending} className="adm-btn">
            Cancel
          </button>
        ) : null}
        <button type="button" onClick={submit} disabled={isPending} className="adm-btn adm-btn-pri">
          {isPending ? 'Uploading…' : 'Upload & auto-match'}
        </button>
      </div>
    </div>
  )
}
