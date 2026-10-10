import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { refuseWhileViewingAs } from '@/lib/view-as-person'

/**
 * The ERP's feed key — in and out of Vault, and nowhere else.
 *
 * THE ADMIN CLIENT'S THIRD CALLER, and why. The key the ERP generates and
 * somebody pastes on the Comm Cal page is what the receiver checks every
 * delivery against. Whatever a signed-in HR user's server action can read with
 * that user's session, that user's browser can read too — the session client
 * and PostgREST are the same door — so a key kept behind an ordinary RLS policy
 * would be one `supabase.rpc()` away from any revenue-permission holder's dev
 * tools. The four `erp_link_*` / `erp_feed_secret` functions (migration
 * 20260916100000) are therefore executable by the service role ONLY, and this
 * module is the one place that role is used for them: the link actions after
 * `requirePermission('revenue')`, and the receiver, which has no session.
 *
 * `'server-only'` above makes a client-component import a build error.
 */

function vault(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

/** The key the receiver accepts, or null when none has been pasted. */
export async function getFeedSecret(): Promise<string | null> {
  const { data, error } = await vault().rpc('erp_feed_secret')
  if (error) throw new Error(`Could not read the ERP feed key: ${error.message}`)
  return typeof data === 'string' && data !== '' ? data : null
}

export async function putFeedKey(subDepartmentId: string, key: string): Promise<void> {
  // The service role goes around the read-only session: refuse while viewing as somebody (2026-10-11).
  await refuseWhileViewingAs()
  const { error } = await vault().rpc('erp_link_put_secret', { p_sub: subDepartmentId, p_secret: key })
  if (error) throw new Error(`Could not store the ERP feed key: ${error.message}`)
}

export async function dropFeedKey(subDepartmentId: string): Promise<void> {
  await refuseWhileViewingAs()
  const { error } = await vault().rpc('erp_link_drop_secret', { p_sub: subDepartmentId })
  if (error) throw new Error(`Could not forget the ERP feed key: ${error.message}`)
}
