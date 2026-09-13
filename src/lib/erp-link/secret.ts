import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'

/**
 * The ERP API key — in and out of Vault, and nowhere else.
 *
 * THE ADMIN CLIENT'S THIRD CALLER, and why. The key someone pastes on the
 * Comm Cal page lets the portal read every sales order in the ERP (and, if it
 * is the ERP's service key, a great deal more). Whatever a signed-in HR user's
 * server action can read with that user's session, that user's browser can
 * read too — the session client and PostgREST are the same door — so a key
 * kept behind an ordinary RLS policy would be one `supabase.rpc()` away from
 * any revenue-permission holder's dev tools. The three `erp_link_*_secret`
 * functions (migration 20260916090000) are therefore executable by the
 * service role ONLY, and this module is the one place that role is used for
 * them: after `requirePermission('revenue')`, for exactly these three calls,
 * never to read or write anything else.
 *
 * `'server-only'` above makes a client-component import a build error.
 */

function vault(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

export async function putErpLinkSecret(subDepartmentId: string, secret: string): Promise<void> {
  const { error } = await vault().rpc('erp_link_put_secret', { p_sub: subDepartmentId, p_secret: secret })
  if (error) throw new Error(`Could not store the ERP key: ${error.message}`)
}

export async function getErpLinkSecret(subDepartmentId: string): Promise<string | null> {
  const { data, error } = await vault().rpc('erp_link_get_secret', { p_sub: subDepartmentId })
  if (error) throw new Error(`Could not read the ERP key: ${error.message}`)
  return typeof data === 'string' && data !== '' ? data : null
}

export async function dropErpLinkSecret(subDepartmentId: string): Promise<void> {
  const { error } = await vault().rpc('erp_link_drop_secret', { p_sub: subDepartmentId })
  if (error) throw new Error(`Could not forget the ERP key: ${error.message}`)
}
