'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import type { User } from '@/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import MoreSheet from './MoreSheet'
import BackToTop from '@/components/BackToTop'

// Portal shell.
//
// Desktop (md+): the hover-expanding Sidebar rail on the left, TopBar above
// the scrolling content — unchanged.
//
// Mobile (<md): the rail is not rendered. Navigation is a fixed BottomTabBar
// (four role-specific destinations + More) with the rest of the portal in a
// MoreSheet. Replaced the hamburger + off-canvas drawer on 2026-08-31 at the
// user's request — thumb-reachable, and it stops stealing the greeting's width
// in the header.
export default function PortalFrame({
  user,
  children,
}: {
  user: User
  children: React.ReactNode
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  // Wide data reports (month-matrix P&L / Cash Flow) opt out of the 1280px
  // reading-width cap so the many month columns can use the full content area.
  const pathname = usePathname()
  const wide = pathname?.startsWith('/reports/monthly-') ?? false

  return (
    <div className="flex h-screen overflow-hidden bg-paper print:h-auto print:overflow-visible">
      <div className="print:hidden contents">
        <Sidebar role={user.role} />
      </div>

      <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible">
        <div className="print:hidden contents">
          <TopBar user={user} />
        </div>
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          {/* pb on mobile clears the 54px tab bar + the home-indicator inset,
              so the last row of a ledger is never parked under the chrome. */}
          <div
            className={`${wide ? 'max-w-none' : 'max-w-[1280px]'} mx-auto px-4 md:px-8 py-6 md:py-10 pb-[calc(54px+24px+env(safe-area-inset-bottom))] md:pb-10 page-enter print:max-w-none print:p-0 print:pb-0`}
          >
            {children}
          </div>
        </main>
      </div>

      <BottomTabBar
        role={user.role}
        moreOpen={moreOpen}
        onMoreClick={() => setMoreOpen((o) => !o)}
      />
      <MoreSheet user={user} open={moreOpen} onClose={() => setMoreOpen(false)} />

      <BackToTop />
    </div>
  )
}
