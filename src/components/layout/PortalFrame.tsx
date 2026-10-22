'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { User } from '@/types'
import { dropSelectionsForPath } from '@/lib/selection-store'
import { logPageView } from '@/lib/page-view'
import { isSheetRoute } from '@/lib/sheet-routes'
import { isFinanceDetailRoute, isFinanceShell, isFinanceView, isPrincipalView } from '@/lib/finance-view'
import { FinViewProvider } from './fin-view'
import FinSwipeBack from './FinSwipeBack'
import FinScrollMemory from './FinScrollMemory'
import { useViewAsSync } from './useViewAsSync'
import { navRootPaths, revenueSubsOf, withPathRevenueSub, type NavData } from './nav-config'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import MoreSheet from './MoreSheet'
import BackToTop from '@/components/BackToTop'
import RouteFreshener from './RouteFreshener'
import HrSidebar from './HrSidebar'
import HrTopBar from './HrTopBar'
import FinSidebar from './FinSidebar'
import LeadSidebar from './LeadSidebar'
import { isLeadViewPath } from './lead-nav'
import ViewingAsBanner from './ViewingAsBanner'
import { isHrView } from '@/lib/hr-view'
import { lensNav } from '@/lib/view-as'
import { ToastHost } from '@/components/hrv/toast'
import { FinToastHost } from '@/components/finv/Toast'
import PortalPushAsk from '@/components/pwa/PortalPushAsk'

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
  phone = false,
  children,
}: {
  user: User
  /** The nav rows that come from the database — Revenue's sub-departments. */
  navData: NavData
  /** HR's (or Finance's) sidebar folded to its 64px rail (a cookie, so it draws folded). */
  hrNavCollapsed?: boolean
  /** A phone, by its browser's own words (lib/one-app.ts): Finance's view keeps the portal's phone shell there. */
  phone?: boolean
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
  // Lead View (2026-10-16): its pages draw its own shell, whatever view the account is in.
  const lead = isLeadViewPath(pathname)
  const hr = isHrView(user.role) && !lead
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
  // Finance's own shell (2026-10-14, the Finance revamp v2): HR's square
  // sidebar and greeting bar, drawn with Finance's categories — for the
  // finance kind, the Principal's Finance lens and, since 2026-10-17, the
  // Principal's own view (its few rows added), on a computer (a phone opens
  // the Finance app — the layout sends it there).
  const finShell = !hr && !lead && isFinanceShell(user) && !phone
  const principalShell = finShell && isPrincipalView(user)
  const mainRef = useRef<HTMLElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  // This phone's notifications (2026-10-16 — the user's iPhone opened here and was never asked): the first open's
  // question and More's switch, on a phone, never while viewing as a person (read-only).
  const push = phone && !user.viewingAs

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
  // Not while a person is viewed: their portal is drawn from its own cookie.
  useViewAsSync(user.role, user.canSwitchView === true && !user.viewingAs)
  // The menus of HR's / Finance's view list that view's tabs (2026-10-11): the
  // view is a lens over the account's own power, which still opens every page.
  const navUser = useMemo(() => lensNav(user), [user])

  if (hr || finShell || lead) {
    // HR's shell — and Finance's since 2026-10-14: the square sidebar, the
    // white greeting bar, and the sheet as the scroller inside a 10px frame —
    // the frame is where drawers, windows and HR's toast are drawn, so they
    // cover the sheet and nothing else. Finance's pages keep `.fin-view` on the
    // frame (the first revamp's rules) and their list's place on Back; its
    // toast is the design's pill at the window's foot.
    const finPage = finShell && fin
    return (
      <FinViewProvider value={finPage}>
        <div className={`hrv-shell${finShell ? ' fin-shell' : ''} flex h-screen overflow-hidden print:h-auto print:overflow-visible`}>
          <div className="print:hidden contents">
            {lead ? (
              <LeadSidebar user={user} initialCollapsed={hrNavCollapsed} />
            ) : finShell ? (
              <FinSidebar user={navUser} navData={navData} initialCollapsed={hrNavCollapsed} principal={principalShell} />
            ) : (
              <HrSidebar user={navUser} revenueSub={revenueSubsOf(navData)} initialCollapsed={hrNavCollapsed} />
            )}
          </div>
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:overflow-visible">
            <div className="print:hidden contents">
              {user.viewingAs ? <ViewingAsBanner name={user.viewingAs.name} /> : null}
              <HrTopBar user={user} viewLabel={lead ? 'Lead View' : principalShell ? 'Principal view' : finShell ? 'Finance view' : 'HR view'} viewValue={lead ? 'lead' : undefined} />
              <div className="md:hidden">
                <TopBar user={user} fin={finPage} />
              </div>
            </div>
            <div className={`hrv-frame${finPage ? ' fin-view' : ''}`} data-hrv-overlay="">
              <main ref={mainRef} className={`sheet-theme sheet hrv-sheet${finShell ? ' fin-sheet' : ''} route-surface page-enter print:p-0`}>
                {finShell ? <div ref={surfaceRef}>{children}</div> : children}
              </main>
              {finShell ? null : <ToastHost />}
            </div>
          </div>
          {finPage ? <FinScrollMemory root={surfaceRef} view={pathname ?? ''} /> : null}
          <BottomTabBar
            role={user.role}
            viewer={navUser}
            moreOpen={moreOpen}
            onMoreClick={() => setMoreOpen((o) => !o)}
            fin={finPage}
          />
          <MoreSheet user={navUser} navData={navData} open={moreOpen} onClose={() => setMoreOpen(false)} push={push} />
          {finShell ? <FinToastHost /> : null}
          {push ? <PortalPushAsk /> : null}
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
          {user.viewingAs ? <ViewingAsBanner name={user.viewingAs.name} /> : null}
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
        push={push}
      />
      {push ? <PortalPushAsk /> : null}

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
