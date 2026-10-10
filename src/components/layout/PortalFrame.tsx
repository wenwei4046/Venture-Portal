'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { User } from '@/types'
import { dropSelectionsForPath } from '@/lib/selection-store'
import { logPageView } from '@/lib/page-view'
import { isSheetRoute } from '@/lib/sheet-routes'
import { isFinanceDetailRoute, isFinanceView } from '@/lib/finance-view'
import { FinViewProvider } from './fin-view'
import FinSwipeBack from './FinSwipeBack'
import FinScrollMemory from './FinScrollMemory'
import { useViewAsSync } from './useViewAsSync'
import { navRootPaths, withPathRevenueSub, type NavData } from './nav-config'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import MoreSheet from './MoreSheet'
import BackToTop from '@/components/BackToTop'
import RouteFreshener from './RouteFreshener'
import HrSidebar from './HrSidebar'
import HrTopBar from './HrTopBar'
import { isHrView } from '@/lib/hr-view'
import { lensNav } from '@/lib/view-as'
import { ToastHost } from '@/components/hrv/toast'

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
  navData: layoutNav,
  hrNavCollapsed = false,
  children,
}: {
  user: User
  /** The nav rows that come from the database — Revenue's sub-departments. */
  navData: NavData
  /** HR's sidebar folded to its 64px rail (a cookie, so it draws folded). */
  hrNavCollapsed?: boolean
  children: React.ReactNode
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  // Wide data reports (month-matrix P&L / Cash Flow) opt out of the 1280px
  // reading-width cap so the many month columns can use the full content area.
  const pathname = usePathname()
  // A Revenue page's own sub-department is the one its links open (the
  // switcher on its head picks it; the layout's cookie covers every other page).
  const navData = useMemo(() => withPathRevenueSub(layoutNav, pathname ?? ''), [layoutNav, pathname])
  // HR's view (2026-10-10, the HR revamp handoff): its own shell.
  const hr = isHrView(user.role)
  const wide = pathname?.startsWith('/reports/monthly-') ?? false
  // The white sheet (DESIGN.md › "Sheet theme"): HR's pages sit on one rounded
  // panel in the Comm Cal month's tone, the shell around it unchanged. Drawn
  // here rather than by each page, so it stays put while one of these pages
  // replaces another and the loading skeleton lands on it too.
  const sheet = isSheetRoute(pathname)
  // The Finance view (2026-10-09, the user's Claude Design handoff): Finance's
  // pages as Finance or the Principal sees them take the revamp — the shared
  // components read it through FinViewProvider, the CSS through `.fin-view`.
  const fin = isFinanceView(pathname, user.role)
  const mainRef = useRef<HTMLElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

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
  // development double-effect) from logging the same path twice. From the
  // browser, not a Server Action — see lib/page-view.ts for why.
  const loggedPath = useRef<string | null>(null)
  useEffect(() => {
    if (!pathname || loggedPath.current === pathname) return
    loggedPath.current = pathname
    void logPageView(pathname)
  }, [pathname])

  // View-as switched in another tab → this shell is drawn in the old view.
  useViewAsSync(user.role, user.canSwitchView === true)
  // The menus of HR's / Finance's view list that view's tabs (2026-10-11): the
  // view is a lens over the account's own power, which still opens every page.
  const navUser = useMemo(() => lensNav(user), [user])

  if (hr) {
    // HR's shell: the square sidebar, the white greeting bar, and the sheet as
    // the scroller inside a 10px frame — the frame is where drawers, windows
    // and the toast are drawn, so they cover the sheet and nothing else.
    return (
      <FinViewProvider value={false}>
        <div className="hrv-shell flex h-screen overflow-hidden print:h-auto print:overflow-visible">
          <div className="print:hidden contents">
            <HrSidebar user={navUser} revenueSub={navData.revenueSub ?? null} initialCollapsed={hrNavCollapsed} />
          </div>
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:overflow-visible">
            <div className="print:hidden contents">
              <HrTopBar user={user} />
              <div className="md:hidden">
                <TopBar user={user} />
              </div>
            </div>
            <div className="hrv-frame" data-hrv-overlay="">
              <main ref={mainRef} className="sheet-theme sheet hrv-sheet route-surface page-enter print:p-0">
                {children}
              </main>
              <ToastHost />
            </div>
          </div>
          <BottomTabBar
            role={user.role}
            viewer={navUser}
            moreOpen={moreOpen}
            onMoreClick={() => setMoreOpen((o) => !o)}
            fin={false}
          />
          <MoreSheet user={navUser} navData={navData} open={moreOpen} onClose={() => setMoreOpen(false)} />
          <Suspense fallback={null}>
            <RouteFreshener />
          </Suspense>
        </div>
      </FinViewProvider>
    )
  }

  return (
    <FinViewProvider value={fin}>
    <div className="flex h-screen overflow-hidden bg-paper print:h-auto print:overflow-visible">
      <div className="print:hidden contents">
        <Sidebar viewer={navUser} navData={navData} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:overflow-visible">
        <div className="print:hidden contents">
          <TopBar user={user} fin={fin} />
        </div>
        <main ref={mainRef} className="flex-1 overflow-y-auto print:overflow-visible">
          {/* pb on mobile clears the 54px tab bar + the home-indicator inset,
              so the last row of a ledger is never parked under the chrome.
              `route-surface`: every page (or the skeleton standing in for it)
              inserted here settles in — see "Navigation feedback" in
              docs/DESIGN.md. */}
          <div
            ref={surfaceRef}
            className={sheet
              ? `route-surface sheet-frame page-enter print:p-0${fin ? ' fin-view' : ''}`
              : `route-surface ${wide ? 'max-w-none' : 'max-w-[1280px]'} mx-auto px-4 md:px-8 py-6 md:py-10 pb-[calc(54px+24px+var(--safe-bottom))] md:pb-10 page-enter print:max-w-none print:p-0 print:pb-0`}
          >
            {sheet ? <div className="sheet-theme sheet">{children}</div> : children}
          </div>
          {fin ? <FinScrollMemory root={surfaceRef} view={pathname ?? ''} /> : null}
          {fin && isFinanceDetailRoute(pathname) ? <FinSwipeBack main={mainRef} sheet={surfaceRef} /> : null}
        </main>
      </div>

      <BottomTabBar
        role={user.role}
        viewer={navUser}
        moreOpen={moreOpen}
        onMoreClick={() => setMoreOpen((o) => !o)}
        fin={fin}
      />
      <MoreSheet
        user={navUser}
        navData={navData}
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
      />

      <BackToTop />
      {/* The revamped pages flash a line after a save wherever they are opened. */}
      <ToastHost fixed />
      {/* A page answered from the router's memory is read again behind itself (2026-10-08). */}
      <Suspense fallback={null}>
        <RouteFreshener />
      </Suspense>
    </div>
    </FinViewProvider>
  )
}
