'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HrIcon } from '@/components/hrv/icons'
import { flash } from '@/components/hrv/toast'
import { stageInto } from '@/lib/storage/stage'
import { deleteInvoiceAttachment, invoiceAttachmentUrl, uploadInvoiceAttachments } from '../../attachment-actions'
import type { InvoiceFile } from '../_lib/invoice-files'
import s from '@/components/finv/full.module.css'

// An invoice's Attachments card (2026-11-09, the user: "就是我开invoice 时放，也可以看完后放"): each file opens by a
// short link; a dashed button adds more; Remove, then Remove? to be sure — while the invoice is not voided. The files
// print after the invoice when its PDF is exported with Include attachments, in this order.

const sizeOf = (bytes: number | null) =>
  bytes == null ? '' : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

export default function InvoiceFiles({
  invoiceId,
  files,
  open,
  canEdit,
}: {
  invoiceId: string
  files: InvoiceFile[]
  /** Not voided: files come and go. */
  open: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, startBusy] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(null), 5000)
    return () => clearTimeout(t)
  }, [armed])

  const openFile = (id: string) =>
    void invoiceAttachmentUrl(invoiceId, id).then(
      ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
      () => setError('That file could not be opened just now.'),
    )
  const add = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv'
    input.onchange = () => {
      const picked = Array.from(input.files ?? [])
      if (picked.length === 0) return
      const form = new FormData()
      form.set('invoice_id', invoiceId)
      setError(null)
      startBusy(async () => {
        try {
          await stageInto(form, 'files', picked)
          const { count } = await uploadInvoiceAttachments(form)
          flash(`${count} ${count === 1 ? 'file' : 'files'} added`)
          router.refresh()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The files could not be added.')
        }
      })
    }
    input.click()
  }
  const remove = (id: string) => {
    if (armed !== id) {
      setArmed(id)
      return
    }
    setArmed(null)
    setError(null)
    startBusy(async () => {
      try {
        await deleteInvoiceAttachment(id)
        flash('File removed')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That file could not be removed.')
      }
    })
  }

  return (
    <div className={s.files}>
      {files.length === 0 ? <p className={s.none}>No attachments yet.</p> : null}
      {files.map((f) => (
        <div key={f.id} className={s.file}>
          <button type="button" className={s.fileOpen} onClick={() => openFile(f.id)}>
            <span className={s.fileIcon}>
              <HrIcon name="doc" size={15} />
            </span>
            <span className={s.fileName}>{f.name}</span>
            <span className={s.fileMeta}>{sizeOf(f.size)}</span>
          </button>
          {open && canEdit ? (
            <button type="button" className={s.fileRemove} data-armed={armed === f.id ? 'true' : undefined} disabled={busy} onClick={() => remove(f.id)}>
              {armed === f.id ? 'Remove?' : 'Remove'}
            </button>
          ) : null}
        </div>
      ))}
      {open && canEdit ? (
        <button type="button" className={s.add} disabled={busy} onClick={add}>
          + Add attachments
        </button>
      ) : null}
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
