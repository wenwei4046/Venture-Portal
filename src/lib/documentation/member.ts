import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { DOC_BUCKET, type FileLink } from './server'
import { memberDocumentsFromRow, type MemberDocument } from './member-model'

/**
 * The Revenue app's side of Documentation (2026-10-11, HR revamp round 2 —
 * README 18.4): the documents HR shares with the member's department, newest
 * first, each "New" until they open it. Read and opened under the MEMBER's own
 * session — `member_documents()` / `member_document_open()` ask
 * `member_staff_id()` (mig 20261011070000), and the bucket lets a member sign
 * only a file shared with them. The app screen wraps these in its own
 * actions.
 */

// The pure part lives in member-model.ts (2026-10-14) so client screens can read it; kept here under its old names.
export { memberDocumentsFromRow, type MemberDocument }

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export async function loadMemberDocuments(): Promise<{ ok: true; documents: MemberDocument[] } | { ok: false; reason: string }> {
  const { data, error } = await (await client()).rpc('member_documents')
  if (error) return { ok: false, reason: error.code === '42501' ? error.message : 'Documentation could not be read. Please try again.' }
  return { ok: true, documents: memberDocumentsFromRow(data) }
}

/** The member opens one: it is seen (no longer New), its trail says so, and a short link opens it. */
export async function openMemberDocument(id: string, mode: 'view' | 'download' = 'view'): Promise<FileLink> {
  const supabase = await client()
  const { data, error } = await supabase.rpc('member_document_open', { p_id: id })
  if (error || !data) return { ok: false, reason: error?.code === '42501' ? 'That document is not shared with you.' : 'The document could not be opened. Please try again.' }
  const f = data as { path?: unknown; fileName?: unknown; contentType?: unknown }
  if (typeof f.path !== 'string') return { ok: false, reason: 'The document could not be opened. Please try again.' }
  const fileName = typeof f.fileName === 'string' ? f.fileName : ''
  const signed = await supabase.storage.from(DOC_BUCKET).createSignedUrl(f.path, 300, mode === 'download' ? { download: fileName || true } : undefined)
  if (signed.error || !signed.data) return { ok: false, reason: 'The document could not be opened. Please try again.' }
  return { ok: true, url: signed.data.signedUrl, fileName, contentType: typeof f.contentType === 'string' ? f.contentType : null }
}
