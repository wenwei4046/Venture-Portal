import { requireAuth } from '@/lib/auth'
import PortalFrame from '@/components/layout/PortalFrame'
import { emptyNavData, readsDeptStatements, type NavData } from '@/components/layout/nav-config'
import { canAccessRevenue } from '@/lib/roles'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts } from '@/lib/dept-statements'
import { listSubDepartments } from './revenue/_lib/sub-departments'
import { redirect } from 'next/navigation'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  if (user.role === 'revenue_member') redirect('/member')

  // Almost all of the nav is a constant, but the Revenue group lists the
  // Revenue Department's sub-departments — Fair today, more when they are
  // created — so those rows have to be read per request. Only for the two
  // roles that can see the group; nobody else pays for the query.
  let navData: NavData = emptyNavData
  if (canAccessRevenue(user)) {
    navData = { ...navData, revenueSubDepts: await listSubDepartments() }
  }
  // Dept Pool lists each department for whoever reads them all (2026-10-09);
  // the ones added since — IT, Revenue Department — come from the registry
  // this request has already primed (signing in builds the server client),
  // so no read is made for them here.
  if (readsDeptStatements(user)) {
    navData = { ...navData, deptPoolDepts: statementDepts(primedRegistryRows()) }
  }

  return (
    <PortalFrame user={user} navData={navData}>
      {children}
    </PortalFrame>
  )
}
