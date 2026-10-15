import type { createClient } from '@/lib/supabase/server'

// Settings › Departments' rows (2026-10-15, lifted out of the Settings page's
// read word for word so the Finance phone app reads the very same): the
// registry in its own order (created_at).

type Client = Awaited<ReturnType<typeof createClient>>

export interface DeptRow {
  id: string
  name: string
  is_internal: boolean
  created_at: string | null
  segment_key: string | null
  pool_gl_code: string | null
  billing_mode_key: string | null
  own_share_billback: boolean
}

/** The registry's rows, as the Settings page selects them. */
export function departmentRowsRead(supabase: Client) {
  // own_share_billback was read below but never selected (2026-09-29), so
  // every Bill back box drew unticked whatever the registry held.
  return supabase
    .from('departments')
    .select('id, name, is_internal, created_at, segment_key, pool_gl_code, billing_mode_key, own_share_billback')
    .order('created_at')
}

/** The rows, typed (a read that fails reads as none, as the page's). */
export async function readDepartmentRows(supabase: Client): Promise<DeptRow[]> {
  const { data } = await departmentRowsRead(supabase)
  return (data ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    is_internal: Boolean(d.is_internal),
    created_at: (d.created_at as string | null) ?? null,
    segment_key: ((d as { segment_key?: string | null }).segment_key as string | null) ?? null,
    pool_gl_code: ((d as { pool_gl_code?: string | null }).pool_gl_code as string | null) ?? null,
    billing_mode_key: ((d as { billing_mode_key?: string | null }).billing_mode_key as string | null) ?? null,
    own_share_billback: Boolean((d as { own_share_billback?: boolean }).own_share_billback),
  }))
}
