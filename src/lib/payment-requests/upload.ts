import { createClient } from '@/lib/supabase/client'
import { PR_BUCKET, prContentType, prFileRefusal, prObjectPath, type UploadedFile } from './model'

/**
 * A receipt or an invoice going up from the browser straight into the private bucket `payment-request-files`
 * (2026-10-29, PR ②): a phone's photo of a receipt is bigger than a Server Action carries (4 MB), so the file never
 * passes through the server. The bucket takes it only into the uploader's own folder (`<their id>/…`), and the request
 * that files it afterwards asks the database whether it really arrived (`payment_request_files_check`). While viewing as
 * somebody the browser's client writes nothing, so this answers with its read-only words.
 */

export type Uploaded = { ok: true; file: UploadedFile } | { ok: false; reason: string }

export async function uploadRequestFile(file: File): Promise<Uploaded> {
  const refused = prFileRefusal(file)
  if (refused) return { ok: false, reason: refused }
  const contentType = prContentType(file.name) ?? 'application/octet-stream'
  const supabase = createClient()
  // The signed-in account, from the session the browser already holds (no round trip).
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return { ok: false, reason: 'Sign in again to attach files.' }
  const path = prObjectPath(uid, file.name, crypto.randomUUID())
  const { error } = await supabase.storage.from(PR_BUCKET).upload(path, file, { contentType, upsert: false })
  if (error) {
    const msg = String((error as { message?: unknown }).message ?? '')
    return { ok: false, reason: msg.startsWith('Read-only') ? msg : `${file.name} could not be uploaded${msg ? `: ${msg}` : '.'}` }
  }
  return { ok: true, file: { path, name: file.name || 'file', contentType, size: file.size } }
}

/** An upload taken off before it was filed: removed, as far as the bucket lets it (only one's own, never a filed one). */
export async function removeRequestUpload(path: string): Promise<void> {
  try {
    await createClient().storage.from(PR_BUCKET).remove([path])
  } catch {
    // Left behind, it is only ever its uploader's.
  }
}
