'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { officeTime } from '@/lib/office-time'
import { useFinView } from '@/components/layout/fin-view'
import {
  getAttachmentSignedUrl,
  getAttachmentPreviewUrls,
  deleteVoucherAttachment,
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
  /** Show a 删除 action per file. The caller decides (Finance/Principal on a
   *  draft / pending_approval voucher); the RPC re-checks server-side. */
  canDelete?: boolean
  /** When the voucher was decided (approved). A file uploaded after that was
   *  added to a voucher already on its way, and is marked 事后补上 (2026-10-05). */
  lateAfter?: string | null
}

type PreviewKind = 'image' | 'pdf'

function previewKind(fileType: string): PreviewKind | null {
  const t = fileType ?? ''
  if (t.startsWith('image/')) return 'image'
  if (t === 'application/pdf') return 'pdf'
  return null
}

export default function AttachmentList({ attachments, emptyMessage, canDelete = false, lateAfter = null }: Props) {
  const decidedAt = lateAfter ? new Date(lateAfter).getTime() : null
  const isLate = (uploadedAt: string) => decidedAt !== null && new Date(uploadedAt).getTime() > decidedAt
  const router = useRouter()
  // English on the Finance view (2026-10-10, the handoff).
  const fin = useFinView()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  // Two-step delete: first click arms the row ("确定删除?"), second click
  // deletes. Any other click / a few seconds disarms it.
  const [armedId, setArmedId] = useState<string | null>(null)
  useEffect(() => {
    if (!armedId) return
    const t = setTimeout(() => setArmedId(null), 5000)
    return () => clearTimeout(t)
  }, [armedId])
  const handleDelete = (id: string) => {
    if (armedId !== id) {
      setArmedId(id)
      return
    }
    setArmedId(null)
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      try {
        await deleteVoucherAttachment(id)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : fin ? 'Delete failed' : '删除失败')
      } finally {
        setPendingId(null)
      }
    })
  }

  // id → signed URL, fetched once on mount so images/PDFs render inline and the
  // reviewer sees them without clicking Download on each one.
  const [previews, setPreviews] = useState<Record<string, string>>({})
  // Currently enlarged attachment — null = lightbox closed.
  const [lightbox, setLightbox] = useState<
    { url: string; name: string; kind: PreviewKind } | null
  >(null)

  const previewIds = attachments
    .filter((a) => previewKind(a.file_type) !== null)
    .map((a) => a.id)
  // Stable dependency key so the effect only re-runs when the set changes.
  const previewKey = previewIds.join(',')

  useEffect(() => {
    if (previewIds.length === 0) return
    let cancelled = false
    getAttachmentPreviewUrls(previewIds)
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
  }, [previewKey])

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
          const kind = previewKind(a.file_type)
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
                    {officeTime(a.uploaded_at).format('D MMM HH:mm')}
                  </span>
                  {isLate(a.uploaded_at) ? (
                    <span className="font-serif italic text-xs text-alert" title={fin ? 'Added after the voucher was approved' : '凭单批准之后才加的'}>
                      {fin ? 'Added late' : '事后补上'}
                    </span>
                  ) : null}
                  {kind && previewUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({ url: previewUrl, name: a.file_name, kind })
                      }
                      className="text-xs font-serif italic text-accent hover:text-accent-hover"
                    >
                      Enlarge
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleDownload(a.id)}
                    disabled={pendingId === a.id}
                    className="text-xs font-serif italic text-accent hover:text-accent-hover disabled:opacity-50"
                  >
                    {pendingId === a.id ? 'Opening…' : 'Download'}
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={pendingId === a.id}
                      title={fin ? 'Delete this attachment (only before the PV is approved)' : '删除这个附件（只在 PV 还没批准时可以）'}
                      className={`text-xs font-serif italic disabled:opacity-50 ${
                        armedId === a.id
                          ? 'text-white bg-danger rounded px-2 py-0.5'
                          : 'text-muted hover:text-danger'
                      }`}
                    >
                      {fin
                        ? pendingId === a.id ? 'Deleting…' : armedId === a.id ? 'Delete?' : 'Delete'
                        : pendingId === a.id ? '删除中…' : armedId === a.id ? '确定删除？' : '删除'}
                    </button>
                  ) : null}
                </div>
              </div>

              {kind ? (
                previewUrl ? (
                  kind === 'image' ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({ url: previewUrl, name: a.file_name, kind })
                      }
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
                    <div className="mt-3 rounded-md border border-hairline overflow-hidden bg-paper">
                      <iframe
                        src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                        title={a.file_name}
                        className="w-full h-80 sm:h-96"
                      />
                    </div>
                  )
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 backdrop-blur-sm p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
        >
          <div
            className="bg-paper rounded-lg shadow-2xl w-full max-w-[820px] max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2.5 border-b border-hairline bg-surface">
              <span className="font-serif text-sm text-ink truncate">{lightbox.name}</span>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="shrink-0 text-muted hover:text-ink font-serif italic text-sm"
              >
                Close ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-surface-2/40">
              {lightbox.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lightbox.url}
                  alt={lightbox.name}
                  className="block max-w-full h-auto mx-auto"
                />
              ) : (
                <iframe
                  src={lightbox.url}
                  title={lightbox.name}
                  className="w-full h-full min-h-[70vh]"
                />
              )}
            </div>
          </div>
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
