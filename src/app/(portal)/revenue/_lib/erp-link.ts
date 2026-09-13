import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPeriodMonth } from '@/lib/utils'
import { DEFAULT_ERP_BASE_URL, erpHostLabel } from '@/lib/erp-link/url'
import type { PullStats } from '@/lib/erp-link/pull'

/**
 * What the Comm Cal page shows about the ERP link — everything about it and
 * never the key. Read here, rendered by _components/ErpLinkPanel.tsx.
 *
 * erp_links / erp_pull_docs postdate database.types.ts — untyped-client
 * convention, as for erp_sync_events.
 */

export interface ErpLinkIdentity {
  id: number
  name: string
  role: string | null
  /** The ERP's shared service key rather than a person's 7-day sign-in. */
  service: boolean
}

export interface ErpLinkView {
  subDepartmentId: string
  linked: boolean
  baseUrl: string
  host: string
  companyId: number
  keyHint: string | null
  identity: ErpLinkIdentity | null
  linkedAt: string | null
  linkedByName: string | null
  lastCheckAt: string | null
  lastCheckOk: boolean | null
  lastCheckNote: string | null
  lastPullAt: string | null
  lastPullPeriod: string | null
  lastPullNote: string | null
  lastPullStats: PullStats | null
  /** Documents a pull has remembered, across every month. */
  tracked: number
  /** The month the Sync control opens on. */
  defaultPeriod: string
}

interface LinkRow {
  sub_department_id: string
  base_url: string
  company_id: number
  key_hint: string
  identity: Partial<ErpLinkIdentity> | null
  linked_at: string | null
  linked_by_name: string | null
  last_check_at: string | null
  last_check_ok: boolean | null
  last_check_note: string | null
  last_pull_at: string | null
  last_pull_period: string | null
  last_pull_note: string | null
  last_pull_stats: PullStats | null
}

const LINK_COLUMNS =
  'sub_department_id, base_url, company_id, key_hint, identity, linked_at, linked_by_name, last_check_at, last_check_ok, last_check_note, last_pull_at, last_pull_period, last_pull_note, last_pull_stats'

function identityOf(raw: Partial<ErpLinkIdentity> | null): ErpLinkIdentity | null {
  if (!raw || typeof raw !== 'object') return null
  const id = Number(raw.id)
  return {
    id: Number.isFinite(id) ? id : -1,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : 'Unknown',
    role: typeof raw.role === 'string' ? raw.role : null,
    service: raw.service === true,
  }
}

export async function loadErpLinkView(supabase: SupabaseClient, subDepartmentId: string): Promise<ErpLinkView> {
  const [{ data: row, error }, { count }] = await Promise.all([
    supabase.from('erp_links').select(LINK_COLUMNS).eq('sub_department_id', subDepartmentId).maybeSingle(),
    supabase.from('erp_pull_docs').select('doc_no', { count: 'exact', head: true }).eq('sub_department_id', subDepartmentId),
  ])
  if (error) throw new Error(`Could not read the ERP link: ${error.message}`)

  const link = (row ?? null) as LinkRow | null
  const defaultPeriod = getPeriodMonth()

  if (!link) {
    return {
      subDepartmentId,
      linked: false,
      baseUrl: DEFAULT_ERP_BASE_URL,
      host: erpHostLabel(DEFAULT_ERP_BASE_URL),
      companyId: 1,
      keyHint: null,
      identity: null,
      linkedAt: null,
      linkedByName: null,
      lastCheckAt: null,
      lastCheckOk: null,
      lastCheckNote: null,
      lastPullAt: null,
      lastPullPeriod: null,
      lastPullNote: null,
      lastPullStats: null,
      tracked: 0,
      defaultPeriod,
    }
  }

  return {
    subDepartmentId,
    linked: true,
    baseUrl: link.base_url,
    host: erpHostLabel(link.base_url),
    companyId: Number(link.company_id) || 1,
    keyHint: link.key_hint,
    identity: identityOf(link.identity),
    linkedAt: link.linked_at,
    linkedByName: link.linked_by_name,
    lastCheckAt: link.last_check_at,
    lastCheckOk: link.last_check_ok,
    lastCheckNote: link.last_check_note,
    lastPullAt: link.last_pull_at,
    lastPullPeriod: link.last_pull_period,
    lastPullNote: link.last_pull_note,
    lastPullStats: link.last_pull_stats,
    tracked: count ?? 0,
    defaultPeriod: link.last_pull_period && link.last_pull_period > defaultPeriod ? link.last_pull_period : defaultPeriod,
  }
}

/** The link's address and company, for a server action about to call the ERP. Throws when there is none. */
export async function requireErpLink(
  supabase: SupabaseClient,
  subDepartmentId: string,
): Promise<{ baseUrl: string; companyId: number }> {
  const { data, error } = await supabase
    .from('erp_links')
    .select('base_url, company_id')
    .eq('sub_department_id', subDepartmentId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the ERP link: ${error.message}`)
  if (!data) throw new Error('The ERP is not linked. Paste its API key first.')
  const row = data as { base_url: string; company_id: number }
  return { baseUrl: row.base_url, companyId: Number(row.company_id) || 1 }
}

/** The Houzs ERP feed belongs to Fair; every link action checks it is talking about Fair. */
export async function assertErpSubDepartment(supabase: SupabaseClient, subDepartmentId: string): Promise<void> {
  const { data, error } = await supabase.rpc('erp_sync_sub_department')
  if (error) throw new Error(`Could not identify the ERP programme: ${error.message}`)
  if (data !== subDepartmentId) throw new Error('The Houzs ERP feed belongs to Fair.')
}
