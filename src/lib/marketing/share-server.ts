import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withFileStorage } from '@/lib/storage/server'
import { isShareCode, sharedFromRow, type SharedPage } from './share'

/**
 * A Library share link reads as a stranger (⑥-3, mig 20261024007300): the publishable key and NO session — a signed-in
 * portal user is the same stranger there — carrying the link's code in `x-link-code`, which the bucket's anon policy
 * reads (mkt_lib_share_may_read) before anything is signed. The database answers it only mkt_lib_shared and
 * mkt_lib_shared_file, granted to anon by name, each checking the code. Never the service role (the guest link's way,
 * lib/guest/client.ts; the PIC's, pic-server.ts).
 */
export function shareClient(code: string): SupabaseClient {
  return withFileStorage(createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
    global: { headers: { 'x-link-code': code } },
  })) as unknown as SupabaseClient
}

/** What /l/<code> draws — null: the link is closed (a wrong code, stopped, past its expiry, binned, gone). */
export async function readShared(code: string): Promise<SharedPage | null> {
  if (!isShareCode(code)) return null
  const { data, error } = await shareClient(code).rpc('mkt_lib_shared', { p_code: code })
  return error ? null : sharedFromRow(data)
}
