import { hasMode, type DepartmentMode } from '@/lib/department-mode'
import { loadDepartmentMode } from '@/lib/department-mode-server'
import DepartmentModeSwitch from './DepartmentModeSwitch'

/**
 * A department's mode switch on its own page (user 2026-09-30: HR on HR
 * Costing, Finance on Service Billing, Director on Director Pool, Revenue on
 * Revenue › Department; Marketing once it has a view). Found by segment key;
 * draws nothing when the department cannot be read, so the page never fails
 * because of it.
 *
 * `department` is the same read (`loadDepartmentMode(segmentKey)`) already
 * started by the page beside its own (2026-10-08): the card renders only once
 * the page has every figure, so reading here begins one more round trip then.
 */
export default async function DepartmentModeCard({
  segmentKey,
  department: started,
}: {
  segmentKey: string
  department?: Promise<DepartmentMode | null>
}) {
  const department = await (started ?? loadDepartmentMode(segmentKey))
  if (!department || !hasMode(department)) return null
  return <DepartmentModeSwitch department={department} variant="panel" />
}
