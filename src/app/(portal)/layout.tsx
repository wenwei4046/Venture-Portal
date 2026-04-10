import { requireAuth } from '@/lib/auth'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <Sidebar role={user.role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar user={user} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1280px] mx-auto px-8 py-10 page-enter">{children}</div>
        </main>
      </div>
    </div>
  )
}
