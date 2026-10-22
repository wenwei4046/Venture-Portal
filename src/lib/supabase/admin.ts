import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { withFileStorage } from '@/lib/storage/server'
import type { Database } from './database.types'

// Service role client — bypasses RLS. Use only in server-side machine paths
// (today: the ERP live feed receiver under app/api/erp). The 'server-only'
// import above causes Next.js to error at build time if any client component
// accidentally imports from this file.
//
// Built on FIRST USE, never at import time. `next build` evaluates every route
// module while collecting page data, and a build without runtime env vars
// (Vercel Preview has no Supabase keys) would otherwise die right there with
// "supabaseUrl is required" — which is exactly how the first preview build of
// the receiver failed on 2026-09-05.
let client: SupabaseClient<Database> | null = null

export function adminClient(): SupabaseClient<Database> {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service-role client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
  // Its `.storage` reaches the buckets moved to R2 too (2026-10-23 — the hourly
  // sweeps remove files through it), passing every policy as with Storage.
  client = withFileStorage(createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }))
  return client
}
