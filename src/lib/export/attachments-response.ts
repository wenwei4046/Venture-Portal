import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { joinWithAttachments, printKind, type PrintFile, type PrintPart } from './attachments-pdf'
import { renderPdfBuffer } from './pdf'
import type React from 'react'

/**
 * A PDF printed with its attachments, sent back (2026-11-09). One printed with its files can be large — a scanned
 * agreement is several MB — and a server's answer stops at about 4.5 MB on Vercel, so a PDF past 4 MB is put in file
 * storage for a while and the browser is sent to a link that reads it for ten minutes. Those copies are swept away
 * after a day, each time another one is made.
 */

export interface AttachmentRow {
  name: string
  type: string | null
  path: string
}

/** The `?attachments=1` the PDF links carry when Include attachments is ticked. */
export const withAttachments = (url: URL) => url.searchParams.get('attachments') === '1'

/** Fetches each printable file with the reader's own session (what they may read, they may print). */
export async function fetchPrintFiles(db: SupabaseClient, bucket: string, rows: readonly AttachmentRow[]): Promise<PrintFile[]> {
  const out: PrintFile[] = []
  for (const r of rows) {
    if (!printKind(r)) continue
    let bytes: Uint8Array | null = null
    try {
      const { data, error } = await db.storage.from(bucket).download(r.path)
      if (!error && data) bytes = new Uint8Array(await data.arrayBuffer())
    } catch {
      bytes = null
    }
    out.push({ name: r.name, type: r.type, bytes })
  }
  return out
}

/** Each document rendered on its own, so its files can follow it. */
export async function renderParts<T>(docs: readonly T[], render: (doc: T) => React.ReactElement, files: (doc: T) => Promise<PrintFile[]>): Promise<PrintPart[]> {
  const parts: PrintPart[] = []
  for (const d of docs) parts.push({ doc: new Uint8Array(await renderPdfBuffer(render(d))), files: await files(d) })
  return parts
}

const INLINE_LIMIT = 4 * 1024 * 1024
const KEEP_MS = 24 * 60 * 60 * 1000
const EXPORTS = 'exports/'

export async function pdfWithAttachmentsResponse(args: { filename: string; parts: readonly PrintPart[] }): Promise<Response> {
  const bytes = await joinWithAttachments(args.parts)
  const name = `${args.filename}.pdf`
  if (bytes.length <= INLINE_LIMIT) {
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }
  const { r2Location, r2Put, presignGet, r2List, r2DeleteMany } = await import('../storage/r2')
  const loc = r2Location('payment-attachments', `${EXPORTS}${crypto.randomUUID()}/${name}`, false)
  const put = await r2Put(loc, bytes, 'application/pdf')
  if (!put.ok) return Response.json({ error: `The PDF could not be prepared (${put.message}).` }, { status: 502 })
  try {
    const listed = await r2List(loc.r2Bucket, `payment-attachments/${EXPORTS}`)
    const old = listed.objects.filter((o) => Date.now() - Date.parse(o.lastModified) > KEEP_MS)
    if (old.length) await r2DeleteMany(old.map((o) => ({ r2Bucket: loc.r2Bucket, key: o.key })))
  } catch {
    // Sweeping is best effort: the next export tries again.
  }
  const url = await presignGet(loc, 600, { download: name })
  return new Response(null, { status: 303, headers: { Location: url, 'Cache-Control': 'no-store, max-age=0' } })
}
