'use client'

import { useEffect, useState, useTransition } from 'react'
import dayjs from 'dayjs'
import {
  getAttachmentSignedUrl,
  getAttachmentPreviewUrls,
} from '@/app/(portal)/payments/actions'

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

function isImage(fileType: string): boolean {
  return (fileType ?? '').startsWith('image/')
}

export default function AttachmentList({ attachments, emptyMessage }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // id → signed image URL, fetched once on mount for inline thumbnails so the
  // reviewer sees the photos without clicking Download on each one.
  const [previews, setPreviews] = useState<Record<string, string>>({})
  // Currently enlarged image ({ url, name }) — null = lightbox closed.
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  const imageIds = attachments.filter((a) => isImage(a.file_type)).map((a) => a.id)
  // Stable dependency key so the effect only re-runs when the set changes.
  const imageKey = imageIds.join(',')

  useEffect(() => {
    if (imageIds.length === 0) return
    let cancelled = false
    getAttachmentPreviewUrls(imageIds)
      .then((rows) => {
        if (cancelled) return
        setPreviews(Object.fromEntries(rows.map((r) => [r.id, r.url])))
      })
      .catch(() => {
        // Preview is best-effort — Download still works if signing fails.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

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
        {attachments.map((a) => {
          const img = isImage(a.file_type)
          const previewUrl = previews[a.id]
          return (
            <div key={a.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-4">
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

              {img ? (
                previewUrl ? (
                  <button
                    type="button"
                    onClick={() => setLightbox({ url: previewUrl, name: a.file_name })}
                    className="mt-3 block cursor-zoom-in rounded-md border border-hairline overflow-hidden bg-paper"
                    aria-label={`Enlarge ${a.file_name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={a.file_name}
                      className="max-h-64 w-auto object-contain"
                    />
                  </button>
                ) : (
                  <div className="mt-3 h-24 rounded-md border border-hairline bg-surface-2/40 flex items-center justify-center">
                    <span className="font-serif italic text-xs text-muted">
                      Loading preview…
                    </span>
                  </div>
                )
              ) : null}
            </div>
          )
        })}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger font-serif italic">{error}</p>
      ) : null}

      {lightbox ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 backdrop-blur-sm p-6"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-[90vh] max-w-[92vw] object-contain rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="fixed top-5 right-6 text-paper/90 hover:text-paper font-serif italic text-sm"
          >
            Close ✕
          </button>
        </div>
      ) : null}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
