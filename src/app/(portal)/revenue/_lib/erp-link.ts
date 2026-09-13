import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { secretConfigured } from '@/lib/erp-sync/auth'

/**
 * What the Comm Cal page shows about the ERP's feed key — everything about it
 * and never the key. Read here, rendered by _components/ErpLinkPanel.tsx.
 *
 * erp_links postdates database.types.ts — untyped-client convention, as for
 * erp_sync_events.
 */

export interface ErpLinkView {
  subDepartmentId: string
  /** A key has been pasted for this programme. */
  linked: boolean
  keyHint: string | null
  linkedAt: string | null
  linkedByName: string | null
  /** Where the ERP must send: this portal's receiver. */
  receiverUrl: string
  /** ERP_SYNC_SECRET is also set on the server — a second accepted key. */
  envSecretSet: boolean
}

export async function loadErpLinkView(supabase: SupabaseClient, subDepartmentId: string, receiverUrl: string): Promise<ErpLinkView> {
  const { data, error } = await supabase
    .from('erp_links')
    .select('key_hint, linked_at, linked_by_name')
    .eq('sub_department_id', subDepartmentId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the ERP link: ${error.message}`)
  const row = (data ?? null) as { key_hint: string; linked_at: string | null; linked_by_name: string | null } | null
  return {
    subDepartmentId,
    linked: row !== null,
    keyHint: row?.key_hint ?? null,
    linkedAt: row?.linked_at ?? null,
    linkedByName: row?.linked_by_name ?? null,
    receiverUrl,
    envSecretSet: secretConfigured(process.env.ERP_SYNC_SECRET),
  }
}

/** The Houzs ERP feed belongs to Fair; every link action checks it is talking about Fair. */
export async function assertErpSubDepartment(supabase: SupabaseClient, subDepartmentId: string): Promise<void> {
  const { data, error } = await supabase.rpc('erp_sync_sub_department')
  if (error) throw new Error(`Could not identify the ERP programme: ${error.message}`)
  if (data !== subDepartmentId) throw new Error('The Houzs ERP feed belongs to Fair.')
}

/** `https://venture-portal-chi.vercel.app/api/erp/v1/sales-orders` from the request's own host. */
export function receiverUrlFor(host: string | null | undefined): string {
  const h = (host ?? '').trim() || 'localhost:3000'
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h)
  return `${local ? 'http' : 'https'}://${h}/api/erp/v1/sales-orders`
}
