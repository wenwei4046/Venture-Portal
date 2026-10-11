import { createClient } from '@/lib/supabase/client'
import { HIRING_BUCKET, contentTypeOf, fileRefusal, objectPath } from './files'

/**
 * A candidate's or a talent's file going up from the browser straight into the
 * private bucket (2026-10-11, Hiring — as Documentation's do): a scan or a CV is
 * often bigger than a Server Action carries (4 MB, next.config.ts), so the file
 * never passes through the server. The bucket's policy asks Hiring · Create or
 * Edit of the uploader's own session (`hiring_files_write`, `files/`), and the
 * function that files it asks the database whether the object really arrived
 * (`hiring_take_upload`). An upload nobody files — a window closed before
 * Save — is cleared a day later (`hiring_orphan_files`). While viewing as
 * somebody the browser's client writes nothing, so this answers with its
 * read-only words.
 */

export type Uploaded = { ok: true; path: string; name: string } | { ok: false; reason: string }

export async function uploadHiringFile(file: File): Promise<Uploaded> {
  const refused = fileRefusal(file)
  if (refused) return { ok: false, reason: refused }
  const path = objectPath('files', crypto.randomUUID(), file.name)
  const { error } = await createClient()
    .storage.from(HIRING_BUCKET)
    .upload(path, file, { contentType: contentTypeOf(file.name) ?? undefined, upsert: false })
  if (error) {
    const msg = String((error as { message?: unknown }).message ?? '')
    return { ok: false, reason: msg.startsWith('Read-only') ? msg : `The file could not be uploaded${msg ? `: ${msg}` : '.'}` }
  }
  return { ok: true, path, name: file.name.trim().slice(0, 160) }
}
