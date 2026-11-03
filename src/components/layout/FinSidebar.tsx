'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { waitingRequestCount } from '@/app/(portal)/payments/requests/waiting-count'
import type { User } from '@/types'
import { finAccountMenu, finNavSections, visibleAccountMenu } from './fin-nav'
import { visibleHrNav } from './hr-nav'
import type { NavData } from './nav-config'
import ViewSidebar from './ViewSidebar'
import { AccountMenu, ChangePasswordDialog, SignOutDialog, type AccountWindow } from './AccountMenu'

// The Finance view's sidebar (2026-10-14, the Finance revamp v2 — the design's
// D01 / D13): the view sidebar with Finance's four categories (fin-nav.ts),
// and its footer opening the account menu — Account, Admin, Sign out. The
// Principal's own view wears it too (2026-10-17), its own rows added
// (`principal` — OPEX, Access log, Settings).
//
// Payment request carries how many requests wait for Finance's voucher
// (2026-11-03, the user: "直到我开pv"): asked after the sidebar is drawn and
// again on each page, so a voucher made drains it; only where the row shows.

/** What waits for Finance's voucher on Payment request, or null: not asked, not answered, or nothing to say. */
function useWaitingRequests(asks: boolean): number | null {
  const pathname = usePathname()
  const [waiting, setWaiting] = useState<number | null>(null)
  useEffect(() => {
    if (!asks) return
    let live = true
    waitingRequestCount().then(
      (n) => {
        if (live) setWaiting(n)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [asks, pathname])
  return waiting
}

export default function FinSidebar({
  user,
  navData,
  initialCollapsed,
  principal = false,
}: {
  user: User
  navData: NavData
  initialCollapsed: boolean
  /** The Principal's own view: its rows added, its name on the footer. */
  principal?: boolean
}) {
  const sections = useMemo(() => visibleHrNav(finNavSections(navData, { principal }), user), [navData, user, principal])
  const groups = useMemo(() => visibleAccountMenu(finAccountMenu({ principal }), user), [user, principal])
  const showsRequests = sections.some((s) => s.items.some((i) => i.key === 'payment-requests'))
  const waiting = useWaitingRequests(showsRequests)
  const [win, setWin] = useState<AccountWindow | null>(null)
  const close = () => setWin(null)
  return (
    <>
      <ViewSidebar
        user={user}
        sections={sections}
        initialCollapsed={initialCollapsed}
        fallbackName={principal ? 'Principal' : 'Finance'}
        footerSub={principal ? 'Principal · settings & admin' : 'Finance · settings & admin'}
        footerMenu={(menu) => <AccountMenu {...menu} groups={groups} onWindow={setWin} />}
        counts={waiting ? { 'payment-requests': waiting } : undefined}
      />
      <ChangePasswordDialog open={win === 'password'} onClose={close} />
      <SignOutDialog open={win === 'signout'} onClose={close} view={principal ? 'the Principal view' : 'the Finance view'} />
    </>
  )
}
