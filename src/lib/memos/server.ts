import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { myMemosFromRow, NO_MEMOS, type MyMemos } from './model'

/**
 * One's own memos, read on the server (2026-10-12, mig 20261012210000) — the
 * HR app's loader, the Revenue app's layout — under the signed-in login's own
 * session: `my_memos()` answers for `auth.uid()` only. Nothing on a refusal: a
 * shared login, or a portal viewing as somebody (the read-only client), simply
 * has no memos to show. Their writes and a memo's file: ./actions.ts.
 */

const client = async () => (await createClient()) as unknown as SupabaseClient

export async function loadMyMemos(): Promise<MyMemos> {
  const { data, error } = await (await client()).rpc('my_memos')
  return error ? NO_MEMOS : myMemosFromRow(data)
}
