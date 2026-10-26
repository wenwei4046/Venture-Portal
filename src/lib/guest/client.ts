import 'server-only'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withFileStorage } from '@/lib/storage/server'

/**
 * The guest page's client (2026-10-11, mig 20261011091000): the publishable
 * key and NO session — every guest, signed in to the portal or not, is the
 * same stranger to the database, which answers only the four guest_link_*
 * functions granted to anon by name, each checking the link's code. Never
 * the service role.
 */
export function guestClient(): SupabaseClient {
  // `.storage` reaches the buckets moved to R2 as the same stranger (lib/storage/server.ts, 2026-10-23).
  return withFileStorage(createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  })) as unknown as SupabaseClient
}
