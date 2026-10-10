import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { capacityFromRow, type SubDepartmentCapacity } from '@/lib/commission/capacity'

/**
 * Rules › Capacity's figures for one sub-department (2026-10-10, the HR
 * revamp), read under the viewer's own session with the page itself:
 * `member_capacity_of` asks `member_is_manager('member_requests_manage')`, the
 * gate Member services always asked (mig 20261010120000). A refusal comes back
 * as words, never a throw — the rest of Rules still draws.
 */
export type CapacityRead = { ok: true; data: SubDepartmentCapacity } | { ok: false; reason: string }

export async function loadSubDepartmentCapacity(subDepartmentId: string): Promise<CapacityRead> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('member_capacity_of', { p_sub: subDepartmentId })
  if (error) {
    return { ok: false, reason: error.code === '42501' ? 'Capacity needs HR request management access.' : 'The capacity could not be read. Please try again.' }
  }
  const figures = capacityFromRow(data)
  return figures ? { ok: true, data: figures } : { ok: false, reason: 'This sub-department is not open to members.' }
}
