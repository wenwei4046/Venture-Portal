import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { readAdSpend } from './ad-spend-server'

/**
 * Read [from, to]'s spend from Meta and keep it under the caller's own session (`lead_save_ad_spend`, Lead View · Manage).
 * Overview's page calls it when the kept days are stale (a reader somebody with Manage opens), Refresh from Meta always.
 */
export async function keepAdSpend(from: string, to: string): Promise<{ ok: true; data: { accounts: number; refused: string[] } } | { ok: false; reason: string }> {
  const read = await readAdSpend(from, to, process.env.META_SYSTEM_USER_TOKEN?.trim())
  if (!read.ok) return read
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.rpc('lead_save_ad_spend', { p_accounts: read.accounts, p_rows: read.rows })
  if (error) return { ok: false, reason: error.code === '42501' ? 'Ad spend needs Lead View · Manage.' : 'What Meta said was not kept.' }
  return { ok: true, data: { accounts: read.accounts.length, refused: read.refused } }
}
