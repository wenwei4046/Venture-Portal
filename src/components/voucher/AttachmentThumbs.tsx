'use client'

import { useEffect, useState } from 'react'
import { getAttachmentPreviewUrls, getAttachmentSignedUrl } from '@/app/(portal)/payments/actions'

// A voucher's attachments as thumbnails (2026-10-07, the Approvals queue's
// phone panel — the user picked B: see the bill without leaving the list). An
// image or a PDF opens in a new tab from its signed URL, which is fetched once
// when the strip is shown; any other file opens through the download action,
// as the detail page's AttachmentList does.

export interface AttachmentThumb {
  id: string
  fileName: string
  fileType: string
}

type Kind = 'image' | 'pdf' | 'file'
const kindOf = (fileType: string): Kind =>
  fileType.startsWith('image/') ? 'image' : fileType === 'application/pdf' ? 'pdf' : 'file'

export default function AttachmentThumbs({ attachments }: { attachments: AttachmentThumb[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [opening, setOpening] = useState<string | null>(null)

  // Stable key so the signing runs once per set of files, not per render.
  const previewKey = attachments
    .filter((a) => kindOf(a.fileType) !== 'file')
    .map((a) => a.id)
    .join(',')
  useEffect(() => {
    if (!previewKey) return
    let cancelled = false
    getAttachmentPreviewUrls(previewKey.split(','))
      .then((rows) => {
        if (!cancelled) setUrls(Object.fromEntries(rows.map((r) => [r.id, r.url])))
      })
      .catch(() => {
        // Best effort: a file whose preview could not be signed still opens by name.
      })
    return () => {
      cancelled = true
    }
  }, [previewKey])

  if (attachments.length === 0) return <span className="text-muted">No attachments</span>

  const open = (id: string) => {
    setOpening(id)
    getAttachmentSignedUrl(id)
      .then(({ url }) => window.open(url, '_blank', 'noopener,noreferrer'))
      .catch(() => {})
      .finally(() => setOpening(null))
  }

  return (
    <div className="att-thumbs">
      {attachments.map((a) => {
        const kind = kindOf(a.fileType)
        const url = urls[a.id]
        if (kind === 'image' && url) {
          return (
            <a key={a.id} href={url} target="_blank" rel="noopener noreferrer" className="att-thumb" aria-label={a.fileName} title={a.fileName}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL; not an optimisable asset */}
              <img src={url} alt={a.fileName} />
            </a>
          )
        }
        if (kind === 'pdf' && url) {
          return (
            <a key={a.id} href={url} target="_blank" rel="noopener noreferrer" className="att-thumb att-pdf" aria-label={a.fileName} title={a.fileName}>
              <span>PDF</span>
            </a>
          )
        }
        return (
          <button key={a.id} type="button" onClick={() => open(a.id)} disabled={opening === a.id} className="att-file" title={a.fileName}>
            {a.fileName}
          </button>
        )
      })}
    </div>
  )
}
