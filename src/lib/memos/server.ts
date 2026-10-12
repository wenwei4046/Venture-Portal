import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { DOC_BUCKET, type FileLink } from '@/lib/documentation/server'
import { myMemosFromRow, NO_MEMOS, type MyMemos } from './model'

/**
 * One's own memos, on the server (2026-10-12, mig 20261012210000): read under
 * the signed-in login's own session — `my_memos()` answers for `auth.uid()`
 * only — and a memo's file signed for five minutes at the tap, never kept.
 * Nothing on a refusal: a shared login, or a portal viewing as somebody (the
 * read-only client), simply has no memos to show.
 */

const client = async () => (await createClient()) as unknown as SupabaseClient

export async function loadMyMemos(): Promise<MyMemos> {
  const { data, error } = await (await client()).rpc('my_memos')
  return error ? NO_MEMOS : myMemosFromRow(data)
}

/** A memo's file: inline to look at, or as a download under its own name. The database asks who may. */
export async function memoFileLink(id: string, mode: 'view' | 'download'): Promise<FileLink> {
  const supabase = await client()
  const { data, error } = await supabase.rpc('memo_attachment', { p_memo: id })
  if (error || !data) {
    return { ok: false, reason: error?.code === '22023' || error?.code === '42501' ? error.message : 'The file could not be opened. Please try again.' }
  }
  const f = data as { path?: unknown; fileName?: unknown; contentType?: unknown }
  if (typeof f.path !== 'string' || !f.path) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  const fileName = typeof f.fileName === 'string' ? f.fileName : ''
  const signed = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(f.path, 300, mode === 'download' ? { download: fileName || true } : undefined)
  if (signed.error || !signed.data) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  return { ok: true, url: signed.data.signedUrl, fileName, contentType: typeof f.contentType === 'string' ? f.contentType : null }
}
