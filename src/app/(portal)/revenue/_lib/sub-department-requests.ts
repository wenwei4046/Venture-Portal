import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { SubDeptRequest } from '@/lib/commission/sales-group-requests'

/**
 * Sales Groups' Waiting list and Replacement list (2026-10-10, the HR
 * revamp): one sub-department's waiting-list and replacement requests, read
 * under the viewer's own session with the page — `member_sub_department_requests`
 * asks `member_is_manager('member_requests_manage')`, the gate Member services
 * always asked (mig 20261010130000). A refusal comes back as words, never a
 * throw: the chart and the members still draw.
 */
export type RequestsRead = { ok: true; rows: SubDeptRequest[] } | { ok: false; reason: string }

export async function loadSubDepartmentRequests(subDepartmentId: string): Promise<RequestsRead> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('member_sub_department_requests', { p_sub: subDepartmentId })
  if (error) {
    return {
      ok: false,
      reason: error.code === '42501' ? 'The waiting list needs HR request management access.' : 'The requests could not be read. Please try again.',
    }
  }
  return { ok: true, rows: Array.isArray(data) ? (data as SubDeptRequest[]) : [] }
}
