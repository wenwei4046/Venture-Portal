import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { primeDeptRegistryFromDb } from '@/lib/dept-registry'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// Dynamic departments (2026-08-24): the primed dept registry backs every
// segment/pool fallback deep in the report + settle libs. Priming here — the
// one chokepoint every server-side data path passes through — keeps all of
// them current without threading a registry through dozens of call chains.
// Throttled: departments changes rarely; 30s staleness only ever delays a
// just-provisioned dept, and the provision action re-primes immediately.
let lastPrimeAt = 0
const PRIME_INTERVAL_MS = 30_000

export async function createClient() {
  const cookieStore = await cookies()

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookie writes are a no-op here
          }
        },
      },
    }
  )

  if (Date.now() - lastPrimeAt > PRIME_INTERVAL_MS) {
    lastPrimeAt = Date.now()
    try {
      await primeDeptRegistryFromDb(client as never)
    } catch {
      // Priming is best-effort — an unprimed request just folds unknown
      // departments into Venture, exactly the pre-dynamic behaviour.
    }
  }

  return client
}
