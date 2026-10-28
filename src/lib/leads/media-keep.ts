import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Every photo, video and file kept (mig 20261028110000 — the user: "要确保不论是客户还是客服发的图片，影片，文件都是直接
 * 显示的"): Meta's addresses expire after a while, so what a customer or the Page sent is copied into the bucket
 * lead-media under its conversation's folder and the message points at our copy. Handed the webhook's client (the
 * service role's — lead_media_to_keep / lead_media_kept are its alone). Never throws: a file Meta no longer serves,
 * or one over the bucket's 25 MB, stays at Meta's address.
 */

export const KEEP_LIMIT = 25 * 1024 * 1024

/** Meta's own CDN only — nothing else is fetched. */
export function metaCdnUrl(url: string | null | undefined): string | null {
  return url && /^https:\/\/[A-Za-z0-9.-]+\.(fbcdn\.net|fbsbx\.com|facebook\.com)\//.test(url) ? url : null
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'application/pdf': 'pdf',
}

/** Where a message's file goes: its conversation's folder, by the message's id — a file keeps its own name. */
export function keptPath(contactId: string, messageId: number, mime: string, body: string): string {
  const named = /^\[File\] (.+)$/.exec(body.trim())?.[1]?.replace(/[\\/]/g, '_').slice(-120)
  return `chat/${contactId}/meta-${messageId}-${named ?? `file.${EXT[mime] ?? mime.split('/')[1]?.replace(/[^a-z0-9]/g, '') ?? 'bin'}`}`
}

export async function keepMedia(client: SupabaseClient, fetchImpl: typeof fetch = fetch): Promise<number> {
  const listed = await client.rpc('lead_media_to_keep')
  if (listed.error) {
    console.error('lead_media_to_keep failed:', listed.error.message)
    return 0
  }
  const kept: Array<{ id: number; path: string; mime: string }> = []
  for (const row of (listed.data ?? []) as Array<{ id: number; contactId: string; url: string; body: string }>) {
    const url = metaCdnUrl(row.url)
    if (!url) continue
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const blob = await res.blob()
      if (!blob.size || blob.size > KEEP_LIMIT) continue
      const mime = (res.headers.get('content-type') ?? blob.type ?? '').split(';')[0].trim() || 'application/octet-stream'
      const path = keptPath(row.contactId, row.id, mime, row.body)
      const up = await client.storage.from('lead-media').upload(path, blob, { contentType: mime, upsert: true })
      if (up.error) {
        console.error('lead media copy failed:', up.error.message)
        continue
      }
      kept.push({ id: row.id, path, mime })
    } catch {
      // Meta did not answer: asked again after the next delivery.
    }
  }
  if (!kept.length) return 0
  const done = await client.rpc('lead_media_kept', { p_rows: kept })
  if (done.error) {
    console.error('lead_media_kept failed:', done.error.message)
    return 0
  }
  return Number(done.data ?? 0)
}
