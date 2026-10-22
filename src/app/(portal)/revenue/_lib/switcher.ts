import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { canDo } from '@/lib/permission-actions'
import type { User } from '@/types'
import { listSubDepartments, type RevenuePageArea, type SubDepartment } from './sub-departments'
import { subsInReach } from '@/lib/sub-department-reach'

/**
 * What the sub-department switcher on a Revenue page's head needs
 * (2026-10-10, the HR revamp: Fair | IR left the sidebar for this switcher):
 * every sub-department the viewer reaches on that page (2026-10-16), and — for whoever may create one (Revenue · Manage,
 * the gate `createSubDepartment` asks) — the departments a new one can sit in.
 */
export interface SwitcherData {
  current: { slug: string; name: string; schemeId: string | null; departmentId: string }
  subs: Array<{ slug: string; name: string }>
  canCreate: boolean
  departments: Array<{ id: string; name: string }>
}

export async function loadSwitcherData(user: User, current: SubDepartment, area: RevenuePageArea): Promise<SwitcherData> {
  const subs = subsInReach(await listSubDepartments(), user.reach, area)
  const canCreate = canDo(user, 'revenue', 'manage')
  let departments: Array<{ id: string; name: string }> = []
  if (canCreate) {
    const supabase = (await createClient()) as unknown as SupabaseClient
    const { data } = await supabase.from('departments').select('id, name').eq('payroll_source', 'commission').order('name')
    departments = (data ?? []) as Array<{ id: string; name: string }>
  }
  return {
    current: { slug: current.slug, name: current.name, schemeId: current.schemeId, departmentId: current.departmentId },
    subs: subs.map(s => ({ slug: s.slug, name: s.name })),
    canCreate,
    departments,
  }
}
