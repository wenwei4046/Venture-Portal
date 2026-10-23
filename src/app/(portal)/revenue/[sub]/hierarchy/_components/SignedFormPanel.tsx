'use client'

import { useRef, useState, type DragEvent } from 'react'
import { btn } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { dayLabel, type SignedForm } from '@/lib/commission/sales-group-requests'
import { SIGNED_FORM_ACCEPT, signedFormRefusal } from '@/lib/commission/waiting-add'
import { stageInto } from '@/lib/storage/stage'
import { signedFormDownload, uploadSignedForm, viewSignedForm } from '../../../waiting-actions'
import FormFileIcon from './FormFileIcon'
import FormFileViewer from './FormFileViewer'
import w from './waiting.module.css'

/**
 * An applicant's signed form, in their drawer on Sales Groups › Waiting list (2026-10-20, the user: "i want here
 * can be view for the letter they submit, then can be upload as well, the file"): the file a member sent with
 * Submit waiting list, or HR attached — its icon, its name, when and by whom. *View* opens it in the 640px viewer
 * the uploaded form's View uses; *Replace* uploads another in its place. With none on file, the dashed *Upload
 * the signed form* (a file can be dropped on it too). Uploading is Member services · Edit's, as "+" is; the
 * file is what "+" takes: a PDF, PNG or JPG, or a Word file (2026-10-20, the user: "want word file as well"),
 * of 100 MB or less (3 MB until 2026-10-23). A Word .docx is read in the viewer; an old .doc is Download only.
 */
export default function SignedFormPanel({
  requestId,
  applicant,
  form,
  canUpload,
  onUploaded,
}: {
  requestId: string
  /** The applicant's name, for the toast and the viewer. */
  applicant: string
  /** The form on file, or null. */
  form: SignedForm | null
  /** Member services · Edit: Upload and Replace are drawn. */
  canUpload: boolean
  onUploaded: (form: SignedForm) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)
  const [over, setOver] = useState(false)

  function clear() {
    if (fileRef.current) fileRef.current.value = ''
  }

  async function upload(file: File | undefined) {
    if (!file || uploading) return
    const refused = signedFormRefusal(file)
    if (refused) {
      setError(refused)
      clear()
      return
    }
    setUploading(true)
    setError(null)
    const data = new FormData()
    data.set('requestId', requestId)
    // Sent ahead of the action (2026-10-23, lib/storage/stage.ts) — up to 100 MB.
    const done = await stageInto(data, 'file', file).then(
      () => uploadSignedForm(data),
      (err: unknown) => ({ ok: false as const, reason: err instanceof Error ? err.message : 'The signed form could not be sent.' }),
    )
    setUploading(false)
    clear()
    if (!done.ok) {
      setError(done.reason)
      return
    }
    onUploaded(done.form)
    flash(form ? `${applicant}'s signed form replaced — ${done.form.name}` : `Signed form uploaded for ${applicant}`)
  }

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept={SIGNED_FORM_ACCEPT}
      aria-label={form ? `Replace ${applicant}'s signed form` : `Upload ${applicant}'s signed form`}
      disabled={uploading}
      onChange={e => void upload(e.target.files?.[0])}
    />
  )

  function drop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setOver(false)
    void upload(e.dataTransfer.files?.[0])
  }

  return (
    <div>
      {form ? (
        <div className={w.signed}>
          <FormFileIcon name={form.name} type={form.type} />
          <div className={w.signedText}>
            <div className={w.signedName} title={form.name}>
              {form.name}
            </div>
            <div className={w.signedSub}>{[dayLabel(form.at), form.by].filter(Boolean).join(' · ')}</div>
          </div>
          <button type="button" className={`${btn('outlineFrame')} ${w.signedButton}`} onClick={() => setViewing(true)} disabled={uploading}>
            View
          </button>
          {canUpload ? (
            <label className={`${btn('outline')} ${w.signedButton} ${w.signedPick}`} data-busy={uploading ? 'true' : undefined}>
              {uploading ? 'Uploading…' : 'Replace'}
              {input}
            </label>
          ) : null}
        </div>
      ) : canUpload ? (
        <label
          className={w.signedDrop}
          data-busy={uploading ? 'true' : undefined}
          data-over={over ? 'true' : undefined}
          onDragOver={e => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={e => {
            // Crossing onto its own words is still over it.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
          }}
          onDrop={drop}
        >
          <span className={w.signedDropTitle}>{uploading ? 'Uploading…' : 'Upload the signed form'}</span>
          <span className={w.signedDropHint}>PDF, Word, PNG or JPG · 100 MB or smaller</span>
          {input}
        </label>
      ) : (
        <div className={w.signedNone}>No signed form on file.</div>
      )}
      {error ? (
        <p className={w.failError} role="alert">
          {error}
        </p>
      ) : null}
      {viewing && form ? (
        <FormFileViewer
          kicker={`${applicant} · Signed form`}
          name={form.name}
          open={() => viewSignedForm(requestId)}
          download={() => signedFormDownload(requestId)}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </div>
  )
}
