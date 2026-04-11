import { requireAuth } from '@/lib/auth'
import PortalFrame from '@/components/layout/PortalFrame'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  return <PortalFrame user={user}>{children}</PortalFrame>
}
