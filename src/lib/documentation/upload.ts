import { createClient } from '@/lib/supabase/client'
import { contentTypeOf, fileRefusal, objectPath } from './model'

/**
 * A file going up from the browser straight into the private bucket
 * (2026-10-11, Documentation): a handbook or a catalogue is bigger than a
 * Server Action carries (4 MB, next.config.ts), so the file never passes
 * through the server — the bucket's policy asks Documentation · Create of the
 * uploader's own session, and the Server Action that files it afterwards asks
 * the database whether the object really arrived (`hr_doc_file_present`).
 * While viewing as somebody the browser's client writes nothing, so this
 * answers with its read-only words.
 */

export type Uploaded = { ok: true; path: string; fileName: string; contentType: string | null; size: number } | { ok: false; reason: string }

const BUCKET = 'hr-documents'

export async function uploadDocumentationFile(folder: 'documents' | 'publish' | 'drive' | { letterFor: string }, file: File): Promise<Uploaded> {
  const refused = fileRefusal(file)
  if (refused) return { ok: false, reason: refused }
  const path = objectPath(folder, crypto.randomUUID(), file.name)
  const contentType = contentTypeOf(file.name, file.type)
  const { error } = await createClient().storage.from(BUCKET).upload(path, file, { contentType: contentType ?? undefined, upsert: false })
  if (error) {
    const msg = String((error as { message?: unknown }).message ?? '')
    return { ok: false, reason: msg.startsWith('Read-only') ? msg : `The file could not be uploaded${msg ? `: ${msg}` : '.'}` }
  }
  return { ok: true, path, fileName: file.name, contentType, size: file.size }
}
