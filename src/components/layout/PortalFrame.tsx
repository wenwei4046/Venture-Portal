'use client'

import { useState } from 'react'
import type { User } from '@/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

// Portal shell — hosts the mobile nav state that both Sidebar and TopBar
// need to coordinate on. On mobile (<md), Sidebar hides off-canvas and
// TopBar shows a hamburger button. On desktop (md+), Sidebar is always
// visible and the hamburger stays hidden — same layout as before the
// mobile work.
export default function PortalFrame({
  user,
  children,
}: {
  user: User
  children: React.ReactNode
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-paper print:h-auto print:overflow-visible">
      <div className="print:hidden contents">
        <Sidebar
          role={user.role}
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />
      </div>

      {/* Backdrop — mobile only, click-to-dismiss */}
      {mobileNavOpen ? (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 bg-ink/40 z-40 md:hidden print:hidden"
          aria-label="Close navigation"
        />
      ) : null}

      <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible">
        <div className="print:hidden contents">
          <TopBar user={user} onMenuClick={() => setMobileNavOpen(true)} />
        </div>
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-10 page-enter print:max-w-none print:p-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
