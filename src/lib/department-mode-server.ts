import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { toDepartmentModes, type DepartmentMode } from '@/lib/department-mode'

/**
 * Every department with its mode, what switching it would clear, and whether
 * the person signed in may switch it (`department_modes()`, 2026-09-30).
 * Names, modes and head-counts only — safe on any page.
 */
export async function loadDepartmentModes(): Promise<DepartmentMode[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('department_modes')
  if (error) throw new Error(`Could not read the department modes: ${error.message}`)
  return toDepartmentModes(data)
}

/**
 * One department's mode, for the switch on its own page. A page that shows the
 * switch as an aside must not fail because of it, so a failed read is logged
 * and answered with null (the page draws no switch).
 */
export async function loadDepartmentMode(segmentKey: string): Promise<DepartmentMode | null> {
  try {
    return (await loadDepartmentModes()).find((d) => d.segmentKey === segmentKey) ?? null
  } catch (e) {
    console.error('[department mode]', e)
    return null
  }
}
