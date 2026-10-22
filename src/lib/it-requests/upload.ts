import { createClient } from '@/lib/supabase/client'
import { itContentType, itFileRefusal, itObjectPath, type ItUpload } from './model'

/**
 * A screenshot or a file going up from the browser straight into the private bucket `it-requests` (2026-10-20, IT
 * support): a phone's screenshot or recording is bigger than a Server Action carries (4 MB, next.config.ts), so the file
 * never passes through the server. The bucket takes it only into the uploader's own folder (`<their id>/…`), and the
 * request or note that files it afterwards asks the database whether it really arrived (`it_request_files_check`).
 * While viewing as somebody the browser's client writes nothing, so this answers with its read-only words.
 */

const BUCKET = 'it-requests'

export type Uploaded = { ok: true; file: ItUpload } | { ok: false; reason: string }

export async function uploadItFile(file: File): Promise<Uploaded> {
  const refused = itFileRefusal(file)
  if (refused) return { ok: false, reason: refused }
  const contentType = itContentType(file.name, file.type) ?? 'application/octet-stream'
  const supabase = createClient()
  // The signed-in account, from the session the browser already holds (no round trip).
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return { ok: false, reason: 'Sign in again to attach files.' }
  const path = itObjectPath(uid, file.name, crypto.randomUUID())
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false })
  if (error) {
    const msg = String((error as { message?: unknown }).message ?? '')
    return { ok: false, reason: msg.startsWith('Read-only') ? msg : `${file.name} could not be uploaded${msg ? `: ${msg}` : '.'}` }
  }
  return { ok: true, file: { path, name: file.name || 'file', contentType, size: file.size } }
}

/** An upload taken off before it was sent: removed, as far as the bucket lets it (only one's own, never a filed one). */
export async function removeItUpload(path: string): Promise<void> {
  try {
    await createClient().storage.from(BUCKET).remove([path])
  } catch {
    // Left behind, it is only ever its uploader's.
  }
}
