'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isCostModel, type CostModel } from '@/lib/department-mode'

// ─── Switch a department between cost center and centralized (2026-09-30) ────
//
// The user: the highest authority flips it — on Settings › Departments and on
// the department's own page, from HR's or Finance's view as well. So the gate
// is the DATABASE's `has_perm('department_mode')`, which asks about the person
// signed in; `requirePermission` would ask about the view they are looking
// through and refuse the Principal in HR view. A refusal comes back as words
// (production hides a thrown message behind a digest).

export type SetDepartmentModeResult =
  | { ok: true; changed: boolean; clearedPeople: number }
  | { ok: false; reason: string }

/** Every page that shows a department's mode, or the people it lists. */
const PAGES_THAT_SHOW_THE_MODE = ['/settings', '/hr-costing', '/statements', '/director-pool', '/revenue', '/dept-pool']

export async function setDepartmentCostModel(
  departmentId: string,
  costModel: CostModel,
): Promise<SetDepartmentModeResult> {
  await requireAuth()
  if (!departmentId) return { ok: false, reason: 'Pick a department first' }
  if (!isCostModel(costModel)) return { ok: false, reason: 'A department is a cost center or centralized' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('department_set_cost_model', {
    p_department_id: departmentId,
    p_cost_model: costModel,
  })
  if (error) return { ok: false, reason: error.message }

  const result = (data ?? {}) as { changed?: boolean; cleared_people?: number }
  for (const path of PAGES_THAT_SHOW_THE_MODE) revalidatePath(path, 'layout')
  return { ok: true, changed: result.changed === true, clearedPeople: Number(result.cleared_people ?? 0) }
}
