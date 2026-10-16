import { redirect } from 'next/navigation'
import { requirePermission, requirePage } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { listReachedSubDepartments, listSubDepartments } from './_lib/sub-departments'
import { loadCommissionSettings } from './_components/config/load'
import FirstSubDepartment from './_components/FirstSubDepartment'

/**
 * `/revenue` has no page of its own — the department is only ever looked at
 * one sub-department at a time, and the sidebar links straight to them. It
 * exists for the two cases that have no slug to go to: an old
 * `/hr-costing/commission/*` link (redirected here by next.config.ts), and a
 * portal where nobody has created a sub-department yet.
 */
export default async function RevenueIndexPage() {
  await requirePage('/revenue')
  await requirePermission('revenue')

  const subs = await listSubDepartments()
  if (subs.length > 0) {
    // The first one the viewer reaches in Comm Cal (2026-10-16); none at all → their Overview.
    const reached = await listReachedSubDepartments('comm_cal')
    redirect(reached.length > 0 ? revenuePath(reached[0].slug) : '/dashboard')
  }

  // Nothing to redirect to. The department cannot compute anything until it
  // has a sub-department carrying a scheme, so offer to make the first one.
  const data = await loadCommissionSettings(null)
  return <FirstSubDepartment data={data} />
}
