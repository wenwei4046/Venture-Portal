'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Record that somebody opened a page.
 *
 * The portal shell calls this once per navigation (see PortalFrame). It writes
 * through the same `log_data_access` RPC that has recorded privileged reads
 * since Phase 1, with `resource_type = 'page'` — one table, so a person's
 * Activity tab can show "opened Payments" and "viewed the staff directory" in
 * one list.
 *
 * Deliberately not awaited by the caller and deliberately silent on failure:
 * an audit trail that breaks navigation would be worse than a gap in the
 * trail. The RPC is SECURITY DEFINER and returns immediately when there is no
 * session, so an unauthenticated call writes nothing.
 */
export async function logPageView(pathname: string): Promise<void> {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return

  try {
    const supabase = await createClient()
    await supabase.rpc('log_data_access', {
      p_resource_type: 'page',
      p_resource_id: pathname.slice(0, 300),
      p_action: 'view',
    })
  } catch {
    // Swallowed on purpose — see above.
  }
}
