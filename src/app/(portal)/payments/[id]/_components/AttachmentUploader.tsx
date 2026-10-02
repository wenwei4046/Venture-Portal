'use client'

import { useState, useTransition, useRef } from 'react'
import { uploadVoucherAttachment } from '../../actions'

interface Props {
  voucherId: string
  voucherStatus: string
  canUpload: boolean
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv'
const CLIENT_MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls', '.docx', '.doc', '.csv']

export default function AttachmentUploader({ voucherId, voucherStatus, canUpload }: Props) {
  const [selected, setSelected] = useState<File[]>([])
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!canUpload) {
    return (
      // No box of its own: it sits inside the voucher page's 附件 card (2026-10-02).
      <p className="font-sans text-muted text-sm">
        Attachments are locked once the voucher is {voucherStatus.replace('_', ' ')}. To change,
        revert or void this voucher first.
      </p>
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setSuccess(null)
    const files = Array.from(e.target.files ?? [])
    for (const f of files) {
      if (f.size > CLIENT_MAX_BYTES) {
        setError(`File "${f.name}" is larger than 10 MB`)
        return
      }
      const lower = f.name.toLowerCase()
      const dotIdx = lower.lastIndexOf('.')
      const ext = dotIdx >= 0 ? lower.slice(dotIdx) : ''
      if (!ALLOWED_EXT.includes(ext)) {
        setError(`File "${f.name}" has disallowed extension: ${ext || '(none)'}`)
        return
      }
    }
    setSelected(files)
  }

  const handleUpload = () => {
    if (selected.length === 0) {
      setError('Pick at least one file first.')
      return
    }
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('voucher_id', voucherId)
        if (description.trim()) fd.set('description', description.trim())
        for (const f of selected) fd.append('files', f)

        const result = await uploadVoucherAttachment(fd)
        setSuccess(
          `Uploaded ${result.count} file${result.count === 1 ? '' : 's'}.`,
        )
        setSelected([])
        setDescription('')
        if (fileInputRef.current) fileInputRef.current.value = ''
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      }
    })
  }

  return (
    <div className="border border-hairline rounded-md bg-paper p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-md text-ink">Add attachments</h3>
        <span className="font-mono text-xs text-muted">PDF, image, Excel, Word, CSV · ≤ 10 MB</span>
      </div>

      <div className="space-y-3">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={handleFileChange}
            disabled={isPending}
            className="block text-sm font-sans text-ink
              file:mr-3 file:py-1.5 file:px-3
              file:rounded file:border file:border-hairline
              file:text-sm file:font-serif file:italic
              file:bg-surface-2 file:text-ink hover:file:bg-surface-2/70"
          />
          {selected.length > 0 ? (
            <div className="mt-1 text-xs font-mono text-muted">
              {selected.length} file{selected.length === 1 ? '' : 's'} selected
            </div>
          ) : null}
        </div>

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional label (e.g., bank receipt)"
          disabled={isPending}
          className="w-full border border-hairline rounded-md px-3 py-2 text-sm font-serif bg-surface"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={isPending || selected.length === 0}
            className="px-4 py-2 bg-accent text-white text-sm font-serif italic rounded-md hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending ? 'Uploading…' : 'Upload'}
          </button>
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSelected([])
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              disabled={isPending}
              className="px-4 py-2 border border-hairline text-sm font-serif italic rounded-md hover:bg-surface-2/40"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-danger font-serif italic">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-3 text-sm text-ledger font-serif italic">{success}</p>
      ) : null}
    </div>
  )
}
