'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { User } from '@/types'
import { dropSelectionsForPath } from '@/lib/selection-store'
import { logPageView } from '@/app/(portal)/activity-actions'
import { navRootPaths, type NavData } from './nav-config'
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
  navData,
  children,
}: {
  user: User
  /** The nav rows that come from the database — Revenue's sub-departments. */
  navData: NavData
  children: React.ReactNode
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  // Wide data reports (month-matrix P&L / Cash Flow) opt out of the 1280px
  // reading-width cap so the many month columns can use the full content area.
  const pathname = usePathname()
  const wide = pathname?.startsWith('/reports/monthly-') ?? false

  // A list's checkbox selection outlives the drill-down into a row's detail
  // page (it lives in lib/selection-store.ts, not in the unmounted list), so
  // this is the one place that can notice the reader has actually left for
  // another tab and expire it. The roots include the Revenue sub-departments,
  // so landing on /revenue/fair counts as leaving, exactly like /payments does.
  const roots = useMemo(() => navRootPaths(navData), [navData])
  useEffect(() => {
    if (pathname) dropSelectionsForPath(pathname, roots)
  }, [pathname, roots])

  // One access_log row per navigation, so a person's Activity tab can answer
  // "what were they in today". Fired after paint and never awaited: the trail
  // must not sit in front of the page. The ref keeps a re-render (or React's
  // development double-effect) from logging the same path twice.
  const loggedPath = useRef<string | null>(null)
  useEffect(() => {
    if (!pathname || loggedPath.current === pathname) return
    loggedPath.current = pathname
    void logPageView(pathname)
  }, [pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-paper print:h-auto print:overflow-visible">
      <div className="print:hidden contents">
        <Sidebar viewer={user} navData={navData} />
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
        viewer={user}
        moreOpen={moreOpen}
        onMoreClick={() => setMoreOpen((o) => !o)}
      />
      <MoreSheet
        user={user}
        navData={navData}
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
      />

      <BackToTop />
    </div>
  )
}
