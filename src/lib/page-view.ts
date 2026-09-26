import { createClient } from '@/lib/supabase/client'

/**
 * Record that somebody opened a page — one access_log row per navigation, so a
 * person's Activity tab can answer "what were they in today". PortalFrame calls
 * this once per pathname. It writes through the same `log_data_access` RPC that
 * has recorded privileged reads since Phase 1, with `resource_type = 'page'`.
 *
 * Straight from the browser, NOT a Server Action (2026-09-26). This used to be
 * `logPageView` in `app/(portal)/activity-actions.ts`, and Next queues every
 * Server Action on the router: a navigation that starts while one is in flight
 * discards it and REFRESHES the page it lands on afterwards — a second full
 * server render, which also empties the router cache and every page warmed on
 * hover. This fired on every navigation, so clicking on within the few hundred
 * milliseconds it took was enough; and a button pressed right after arriving
 * waited behind it. The RPC is SECURITY DEFINER, granted to `authenticated`, and
 * takes the reader from the JWT (`auth.uid()`), so the browser session is
 * exactly as trustworthy for it as the server's was.
 *
 * Fire-and-forget and silent on failure: an audit trail that broke navigation
 * would be worse than a gap in it. Without a session the RPC writes nothing.
 */
export function logPageView(pathname: string): void {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return

  try {
    createClient()
      .rpc('log_data_access', {
        p_resource_type: 'page',
        p_resource_id: pathname.slice(0, 300),
        p_action: 'view',
      })
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    // Swallowed on purpose — see above.
  }
}
