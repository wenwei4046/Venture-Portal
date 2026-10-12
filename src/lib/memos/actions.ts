'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { FileLink } from '@/lib/documentation/server'
import { memoFileLink } from './server'

/**
 * One's own memos, written (2026-10-12, mig 20261012210000): opened, or
 * acknowledged — the LOGIN's receipt, so whichever face it is pressed in (the
 * portal in any view, the HR app, the Revenue app) every other face shows it
 * done — and a memo's file opened. The account's own, not a module's: no
 * permission cell is asked, only a signed-in, active login; the database asks
 * whether the memo is addressed to their People record. While the portal is
 * viewing as somebody the server client is read-only and says so.
 */

export type MemoMarkOutcome = { ok: true; readAt: string | null; acknowledgedAt: string | null } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

/** A memo's file — to its person, or to Documentation · View (Publish › Preview). */
export async function openMemoFile(id: string, mode: 'view' | 'download' = 'view'): Promise<FileLink> {
  if (!(await signedIn())) return { ok: false, reason: 'Sign in with an active work account.' }
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, reason: 'That memo is not there.' }
  return memoFileLink(id, mode === 'download' ? 'download' : 'view')
}
