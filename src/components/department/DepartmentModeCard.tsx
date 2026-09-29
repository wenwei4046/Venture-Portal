import { hasMode } from '@/lib/department-mode'
import { loadDepartmentMode } from '@/lib/department-mode-server'
import DepartmentModeSwitch from './DepartmentModeSwitch'

/**
 * A department's mode switch on its own page (user 2026-09-30: HR on HR
 * Costing, Finance on Service Billing, Director on Director Pool, Revenue on
 * Revenue › Department; Marketing once it has a view). Found by segment key;
 * draws nothing when the department cannot be read, so the page never fails
 * because of it.
 */
export default async function DepartmentModeCard({ segmentKey }: { segmentKey: string }) {
  const department = await loadDepartmentMode(segmentKey)
  if (!department || !hasMode(department)) return null
  return <DepartmentModeSwitch department={department} variant="panel" />
}
