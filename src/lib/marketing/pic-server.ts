import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withFileStorage } from '@/lib/storage/server'
import { isPicCode, picPageFromRow, type PicPage } from './pic'

/**
 * The PIC's link reads and writes as a stranger (⑤-1, mig 20261024003000): the publishable key and NO session — a
 * signed-in portal user is the same stranger there — so the database answers only the two mkt_pic_* functions granted
 * to anon by name, each checking the link's code. Never the service role (the guest link's way, lib/guest/client.ts).
 */
export function picClient(): SupabaseClient {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  }) as unknown as SupabaseClient
}

/**
 * A file of the work on the PIC's link (②b-2e, mig 20261025113000): the same stranger, carrying the link's code in
 * `x-link-code` — the bucket's anon policy reads it (mkt_pic_may_read) before anything is signed, as a Library share
 * link's (share-server.ts). The database answers it mkt_pic_file, granted to anon by name, checking the code.
 */
export function picFileClient(code: string): SupabaseClient {
  return withFileStorage(createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
    global: { headers: { 'x-link-code': code } },
  })) as unknown as SupabaseClient
}

/** What /t/<code> draws — null: the link is closed (a wrong code, a cancelled project, never sent). */
export async function readPicPage(code: string): Promise<PicPage | null> {
  if (!isPicCode(code)) return null
  const { data, error } = await picClient().rpc('mkt_pic_page', { p_code: code })
  return error ? null : picPageFromRow(data)
}
