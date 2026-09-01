import { requireAuth } from '@/lib/auth'
import PortalFrame from '@/components/layout/PortalFrame'
import { emptyNavData, type NavData } from '@/components/layout/nav-config'
import { canAccessRevenue } from '@/lib/roles'
import { listSubDepartments } from './revenue/_lib/sub-departments'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  // Almost all of the nav is a constant, but the Revenue group lists the
  // Revenue Department's sub-departments — Fair today, more when they are
  // created — so those rows have to be read per request. Only for the two
  // roles that can see the group; nobody else pays for the query.
  let navData: NavData = emptyNavData
  if (canAccessRevenue(user.role)) {
    navData = { revenueSubDepts: await listSubDepartments() }
  }

  return (
    <PortalFrame user={user} navData={navData}>
      {children}
    </PortalFrame>
  )
}
