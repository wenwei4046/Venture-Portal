import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
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

/** What /t/<code> draws — null: the link is closed (a wrong code, a cancelled project, never sent). */
export async function readPicPage(code: string): Promise<PicPage | null> {
  if (!isPicCode(code)) return null
  const { data, error } = await picClient().rpc('mkt_pic_page', { p_code: code })
  return error ? null : picPageFromRow(data)
}
