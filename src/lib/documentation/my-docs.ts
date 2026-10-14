import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { DOC_BUCKET } from './bucket'
import { myDocumentsFromRow, type MyDocuments } from './personal'
import type { FileLink } from './server'

/**
 * One's own documents (2026-10-14, mig 20261014190000): read and opened under the reader's OWN session —
 * `my_documents()` answers for `auth.uid()`'s People record only (Company: their department's; Personal: what HR
 * shares with them of their Data center folder, their letters not kept from them), `my_document_open()` records the
 * open and names the object, and the bucket signs it for its person (`hr_file_readable_by_member`). A link is made at
 * the tap and lives five minutes, as every Documentation file's. The Revenue app's View as reads somebody else's with
 * `my_documents_of` (Documentation · View) and opens them the way People › Documentation does.
 */

export type MyDocumentsRead = { ok: true; data: MyDocuments } | { ok: false; reason: string }

/** What a person opens: a company document, a file of their own folder, one of their letters. */
export type MyDocKind = 'document' | 'drive' | 'letter'

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export async function loadMyDocuments(): Promise<MyDocumentsRead> {
  const { data, error } = await (await client()).rpc('my_documents')
  if (error) return { ok: false, reason: error.code === '42501' ? error.message : 'Your documents could not be read. Please try again.' }
  const docs = myDocumentsFromRow(data)
  return docs ? { ok: true, data: docs } : { ok: false, reason: 'Your documents could not be read. Please try again.' }
}

/** Somebody's, as they see them (the Revenue app's View as, Documentation · View): nothing is marked seen. */
export async function loadDocumentsOf(staffId: string): Promise<MyDocumentsRead> {
  const { data, error } = await (await client()).rpc('my_documents_of', { p_staff: staffId })
  if (error) {
    return { ok: false, reason: error.code === '42501' || error.code === '22023' ? error.message : 'Documentation could not be read. Please try again.' }
  }
  const docs = myDocumentsFromRow(data)
  return docs ? { ok: true, data: docs } : { ok: false, reason: 'Documentation could not be read. Please try again.' }
}

/** One of theirs, opened by its person: the open recorded (seen; a letter's memo read), a short link made now. */
export async function openMyDocument(kind: MyDocKind, id: string, mode: 'view' | 'download' = 'view'): Promise<FileLink> {
  const supabase = await client()
  const { data, error } = await supabase.rpc('my_document_open', { p_kind: kind, p_id: id })
  if (error || !data) {
    return { ok: false, reason: error?.code === '42501' ? error.message : 'It could not be opened. Please try again.' }
  }
  const f = data as { path?: unknown; fileName?: unknown; contentType?: unknown }
  if (typeof f.path !== 'string' || !f.path) return { ok: false, reason: 'It could not be opened. Please try again.' }
  const fileName = typeof f.fileName === 'string' ? f.fileName : ''
  const signed = await supabase.storage.from(DOC_BUCKET).createSignedUrl(f.path, 300, mode === 'download' ? { download: fileName || true } : undefined)
  if (signed.error || !signed.data) return { ok: false, reason: 'It could not be opened. Please try again.' }
  return { ok: true, url: signed.data.signedUrl, fileName, contentType: typeof f.contentType === 'string' ? f.contentType : null }
}
