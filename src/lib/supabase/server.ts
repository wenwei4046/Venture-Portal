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
//
// Off the critical path (2026-10-08): only an instance's FIRST prime is
// awaited (its registry is empty until then) — by every request that arrives
// while it is out, not only the one that started it. After that a due refresh
// runs beside the request instead of in front of it — on prod it had been
// adding 40–60 ms to about a third of all requests, and the registry it
// replaces is never older than the 30 s the throttle already allowed.
//
// Signed-in requests only (2026-10-08): RLS shows `departments` to a session
// alone, so a request without one — the sign-in action builds its client
// BEFORE the session exists — read none and primed an EMPTY registry for every
// request on the instance for 30 s (primeDeptRegistryFromDb now refuses an
// empty read too). A read that lands nothing counts as not primed: the next
// signed-in request reads again.
let lastPrimeAt = 0
let primedOnce = false
let firstPrime: Promise<void> | null = null
const PRIME_INTERVAL_MS = 30_000

/** The Supabase session cookie — `sb-<project>-auth-token`, or its `.0`, `.1`
 *  chunks — not the PKCE `…-auth-token-code-verifier`. */
const SESSION_COOKIE = /^sb-[^.]+-auth-token(\.\d+)?$/

export function hasSessionCookie(names: readonly string[]): boolean {
  return names.some((name) => SESSION_COOKIE.test(name))
}

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

  if (
    Date.now() - lastPrimeAt > PRIME_INTERVAL_MS &&
    hasSessionCookie(cookieStore.getAll().map((c) => c.name))
  ) {
    lastPrimeAt = Date.now()
    // Priming is best-effort — an unprimed request just folds unknown
    // departments into Venture, exactly the pre-dynamic behaviour.
    const prime = primeDeptRegistryFromDb(client as never)
      .then((rows) => {
        if (rows.length > 0) primedOnce = true
        else lastPrimeAt = 0
      })
      .catch(() => {})
    if (!primedOnce) firstPrime = prime
  }
  if (!primedOnce && firstPrime) await firstPrime

  return client
}
