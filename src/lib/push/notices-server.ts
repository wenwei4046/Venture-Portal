import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { noticesFromRow, type Notices } from './notices'

/** The signed-in account's own notifications (mig 20261011180000), for the Revenue app's bell. Nothing on a refusal. */
export async function loadMyNotices(): Promise<Notices> {
  const db = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await db.rpc('notifications_mine', { p_limit: 50 })
  return error ? { unread: 0, items: [] } : noticesFromRow(data)
}
