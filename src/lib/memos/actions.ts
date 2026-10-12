'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { FileLink } from '@/lib/documentation/server'

/**
 * One's own memos, written (2026-10-12, mig 20261012210000): opened, or
 * acknowledged — the LOGIN's receipt, so whichever face it is pressed in (the
 * portal in any view, the HR app, the Revenue app) every other face shows it
 * done — and a memo's file opened. The account's own, not a module's: no
 * permission cell is asked, only a signed-in, active login; the database asks
 * whether the memo is addressed to their People record. While the portal is
 * viewing as somebody the server client is read-only and says so.
 *
 * Imported by client components (the portal's bell), so nothing here pulls in a
 * `server-only` module — the bucket's name is written out, as upload.ts does.
 */

export type MemoMarkOutcome = { ok: true; readAt: string | null; acknowledgedAt: string | null } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Documentation's private bucket (lib/documentation/server.ts DOC_BUCKET). */
const BUCKET = 'hr-documents'

const client = async () => (await createClient()) as unknown as SupabaseClient

async function signedIn(): Promise<boolean> {
  const user = await getUser()
  return !!user?.is_active
}

/** Opened (`ack` false) or acknowledged. */
export async function markMyMemo(id: string, ack: boolean): Promise<MemoMarkOutcome> {
  if (!(await signedIn())) return { ok: false, reason: 'Sign in with an active work account.' }
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, reason: 'That memo is not there.' }
  const { data, error } = await (await client()).rpc('my_memo_mark', { p_memo: id, p_ack: ack === true })
  if (error) {
    return { ok: false, reason: error.code === '42501' || error.code === 'VIEW_AS' ? error.message : 'It could not be recorded. Please try again.' }
  }
  // The faces that read memos on the server: the HR app, the Revenue app.
  revalidatePath('/hr-app')
  revalidatePath('/member', 'layout')
  const r = (data ?? {}) as { readAt?: unknown; acknowledgedAt?: unknown }
  return {
    ok: true,
    readAt: typeof r.readAt === 'string' ? r.readAt : null,
    acknowledgedAt: typeof r.acknowledgedAt === 'string' ? r.acknowledgedAt : null,
  }
}

/**
 * A memo's file — to its person, or to Documentation · View (Publish › Preview): inline to look at, or as a
 * download under its own name, signed for five minutes at the press and never kept. The database asks who may
 * (`memo_attachment`), and the bucket's read policy asks again before it signs.
 */
export async function openMemoFile(id: string, mode: 'view' | 'download' = 'view'): Promise<FileLink> {
  if (!(await signedIn())) return { ok: false, reason: 'Sign in with an active work account.' }
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, reason: 'That memo is not there.' }
  const supabase = await client()
  const { data, error } = await supabase.rpc('memo_attachment', { p_memo: id })
  if (error || !data) {
    return { ok: false, reason: error?.code === '22023' || error?.code === '42501' ? error.message : 'The file could not be opened. Please try again.' }
  }
  const f = data as { path?: unknown; fileName?: unknown; contentType?: unknown }
  if (typeof f.path !== 'string' || !f.path) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  const fileName = typeof f.fileName === 'string' ? f.fileName : ''
  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(f.path, 300, mode === 'download' ? { download: fileName || true } : undefined)
  if (signed.error || !signed.data) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  return { ok: true, url: signed.data.signedUrl, fileName, contentType: typeof f.contentType === 'string' ? f.contentType : null }
}
