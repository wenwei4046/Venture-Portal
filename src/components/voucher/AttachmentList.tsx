'use client'

import { useState, useTransition } from 'react'
import dayjs from 'dayjs'
import { getAttachmentSignedUrl } from '@/app/(portal)/payments/actions'

export interface AttachmentListItem {
  id: string
  file_name: string
  file_type: string
  file_size?: number | null
  description?: string | null
  uploaded_at: string
}

interface Props {
  attachments: AttachmentListItem[]
  emptyMessage?: string
}

export default function AttachmentList({ attachments, emptyMessage }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleDownload = (id: string) => {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      try {
        const { url } = await getAttachmentSignedUrl(id)
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open attachment')
      } finally {
        setPendingId(null)
      }
    })
  }

  if (attachments.length === 0) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-6 text-center">
        <p className="font-serif italic text-muted text-sm">
          {emptyMessage ?? 'No attachments yet.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-5 py-3 gap-4">
            <div className="min-w-0">
              <div className="font-serif text-sm text-ink truncate">{a.file_name}</div>
              <div className="font-mono text-xs text-muted">
                {a.file_type}
                {a.description ? ` · ${a.description}` : ''}
                {typeof a.file_size === 'number'
                  ? ` · ${formatFileSize(a.file_size)}`
                  : ''}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-xs text-muted hidden sm:block">
                {dayjs(a.uploaded_at).format('D MMM HH:mm')}
              </span>
              <button
                type="button"
                onClick={() => handleDownload(a.id)}
                disabled={pendingId === a.id}
                className="text-xs font-serif italic text-accent hover:text-accent-hover disabled:opacity-50"
              >
                {pendingId === a.id ? 'Opening…' : 'Download'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger font-serif italic">{error}</p>
      ) : null}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
