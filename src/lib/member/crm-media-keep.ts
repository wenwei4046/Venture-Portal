import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchWhatsAppMedia, messengerMediaAddress } from '@/lib/whatsapp/media'

/**
 * A customer's photo, video, voice note and file kept on arrival (the owner, 2026-11-10: "Yes, copy on arrival";
 * mig 20261110140000). Meta keeps a WhatsApp customer's media id 7 days and Messenger's signed address ~10–30 days, so the
 * chat went black; what WE send was already in crm-media. Now each customer file is copied into the private bucket
 * crm-media at `<contact id>/in-<message id>.<ext>` and recorded with `crm_keep_in_media`, after which
 * GET /member/crm-media/<id> serves our copy (a signed link), as for what we send.
 *
 * Handed the caller's client — the two Meta webhooks' and the hourly sweep's, the service role's (admin.ts' existing
 * callers; `crm_media_to_keep` / `crm_keep_in_media` are the service role's alone). Its `.storage` reaches R2 through
 * `withFileStorage`. Never throws: a file it cannot keep stays at Meta's address, counted as tried, and the hourly sweep
 * asks again (up to 6 tries, while Meta still has it). Logs `[crm-media keep]` with the message id and a reason only —
 * never an address or a token.
 */

/** At most this many bytes are kept (the same ceiling Lead View's copy keeps; a bigger file stays at Meta). */
export const KEEP_LIMIT = 25 * 1024 * 1024
/** One file's whole copy — asking Meta, downloading, nothing more. */
export const KEEP_TIMEOUT_MS = 20_000

export type KeepRow = { id: string; contactId: string; channel?: string | null; mediaId?: string | null; mediaUrl?: string | null; mime?: string | null }
export type KeepResult = { listed: number; kept: number }

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'video/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/webm': 'weba', 'audio/x-m4a': 'm4a',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip',
  'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

/** A type as the database takes it (`^[a-z]+/[a-z0-9.+-]+$`): lower case, no parameters — else a plain download. */
export function cleanMime(mime: string | null | undefined): string {
  const m = (mime ?? '').split(';')[0].trim().toLowerCase()
  return /^[a-z]+\/[a-z0-9.+-]+$/.test(m) ? m : 'application/octet-stream'
}

/** Where a customer's file is kept: their folder, by the message's id (what `crm_keep_in_media` accepts, and nothing else). */
export function keptInPath(contactId: string, messageId: string, mime: string): string {
  const sub = mime.split('/')[1]?.replace(/[^a-z0-9]/g, '').slice(0, 10)
  return `${contactId}/in-${messageId}.${EXT[mime] ?? (sub || 'bin')}`
}

/** The body read up to `limit` bytes; null when it is empty or longer (the download is then stopped). */
async function readCapped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!body) return null
  const reader = body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    parts.push(value)
  }
  if (!size) return null
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out
}

const tooLong = (length: string | null | undefined, limit: number) => Number(length) > limit

type Got = { ok: true; bytes: Uint8Array; mime: string } | { ok: false; why: string }

/** The file's bytes from Meta: WhatsApp by its media id with the token, Messenger from its signed CDN address (Meta's hosts only). */
async function fetchFromMeta(row: KeepRow, token: string | undefined, fetchImpl: typeof fetch, limit: number, timeoutMs: number): Promise<Got> {
  const signal = AbortSignal.timeout(timeoutMs)
  const timed: typeof fetch = (input, init) => fetchImpl(input, { ...init, signal })
  if (row.mediaId) {
    if (!token) return { ok: false, why: 'no token' }
    const media = await fetchWhatsAppMedia(row.mediaId, token, timed)
    if (!media.ok) return { ok: false, why: `whatsapp ${media.status}` }
    if (tooLong(media.length, limit)) { await media.body?.cancel().catch(() => undefined); return { ok: false, why: 'over the size cap' } }
    const bytes = await readCapped(media.body, limit)
    return bytes ? { ok: true, bytes, mime: cleanMime(media.type || row.mime) } : { ok: false, why: 'empty or over the size cap' }
  }
  const address = messengerMediaAddress(row.mediaUrl)
  if (!address) return { ok: false, why: 'not a Meta address' }
  const res = await timed(address, { cache: 'no-store' })
  if (!res.ok) { await res.body?.cancel().catch(() => undefined); return { ok: false, why: `messenger ${res.status}` } }
  // A redirect followed must still have ended on Meta's hosts.
  if (res.url && !messengerMediaAddress(res.url)) { await res.body?.cancel().catch(() => undefined); return { ok: false, why: 'left Meta' } }
  if (tooLong(res.headers.get('content-length'), limit)) { await res.body?.cancel().catch(() => undefined); return { ok: false, why: 'over the size cap' } }
  const bytes = await readCapped(res.body, limit)
  return bytes ? { ok: true, bytes, mime: cleanMime(res.headers.get('content-type') || row.mime) } : { ok: false, why: 'empty or over the size cap' }
}

/** One customer file into crm-media and recorded. True when the message now points at our copy. */
export async function keepOne(client: SupabaseClient, row: KeepRow, opts: { token?: string; fetchImpl?: typeof fetch; limit?: number; timeoutMs?: number } = {}): Promise<boolean> {
  const say = (why: string) => console.warn('[crm-media keep]', row.id, why)
  try {
    const got = await fetchFromMeta(row, opts.token, opts.fetchImpl ?? fetch, opts.limit ?? KEEP_LIMIT, opts.timeoutMs ?? KEEP_TIMEOUT_MS)
    if (!got.ok) { say(got.why); return false }
    const path = keptInPath(row.contactId, row.id, got.mime)
    const blob = new Blob([got.bytes as BlobPart], { type: got.mime })
    const up = await client.storage.from('crm-media').upload(path, blob, { contentType: got.mime })
    // Already there (the webhook and the sweep both reached it): record it all the same.
    if (up.error && (up.error as { status?: number }).status !== 409 && !/already exists/i.test(up.error.message)) {
      say(`upload refused (${(up.error as { status?: number }).status ?? 'error'})`)
      return false
    }
    const done = await client.rpc('crm_keep_in_media', { p_message: row.id, p_path: path, p_mime: got.mime })
    if (done.error) { say(`not recorded (${done.error.code ?? 'error'})`); return false }
    return done.data !== false
  } catch (e) {
    say(e instanceof Error && e.name === 'TimeoutError' ? 'timed out' : 'failed')
    return false
  }
}

/**
 * Lists what is waiting (`crm_media_to_keep` — the delivery's own messages when `externalIds` is given, else the newest
 * of anything still at Meta: the sweep) and keeps each, one at a time.
 */
export async function keepCustomerMedia(client: SupabaseClient, opts: { externalIds?: string[]; limit?: number; token?: string; fetchImpl?: typeof fetch; budgetMs?: number } = {}): Promise<KeepResult> {
  if (opts.externalIds && !opts.externalIds.length) return { listed: 0, kept: 0 }
  try {
    const listed = await client.rpc('crm_media_to_keep', { p_external_ids: opts.externalIds ?? null, p_limit: opts.limit ?? 20 })
    if (listed.error) {
      console.error('[crm-media keep] listing failed', listed.error.code ?? 'error')
      return { listed: 0, kept: 0 }
    }
    const rows = (Array.isArray(listed.data) ? listed.data : []) as KeepRow[]
    let kept = 0
    // A time budget (the hourly sweep shares its 60 s): no new file is started past it — what is left waits for the next run.
    const until = opts.budgetMs ? Date.now() + opts.budgetMs : Infinity
    for (const row of rows) {
      if (Date.now() >= until) break
      if (await keepOne(client, row, { ...opts, timeoutMs: Math.min(KEEP_TIMEOUT_MS, Math.max(1000, until - Date.now())) })) kept++
    }
    return { listed: rows.length, kept }
  } catch {
    console.error('[crm-media keep] failed')
    return { listed: 0, kept: 0 }
  }
}
