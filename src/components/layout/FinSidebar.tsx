'use client'

import { useMemo, useState } from 'react'
import type { User } from '@/types'
import { finAccountMenu, finNavSections, visibleAccountMenu } from './fin-nav'
import { visibleHrNav } from './hr-nav'
import type { NavData } from './nav-config'
import ViewSidebar from './ViewSidebar'
import { AccountMenu, ChangePasswordDialog, EditProfileDialog, SignOutDialog, type AccountWindow } from './AccountMenu'

// The Finance view's sidebar (2026-10-14, the Finance revamp v2 — the design's
// D01 / D13): the view sidebar with Finance's four categories (fin-nav.ts),
// and its footer opening the account menu — Account, Admin, Sign out.

export default function FinSidebar({ user, navData, initialCollapsed }: { user: User; navData: NavData; initialCollapsed: boolean }) {
  const sections = useMemo(() => visibleHrNav(finNavSections(navData), user), [navData, user])
  const groups = useMemo(() => visibleAccountMenu(finAccountMenu(), user), [user])
  const [win, setWin] = useState<AccountWindow | null>(null)
  const close = () => setWin(null)
  return (
    <>
      <ViewSidebar
        user={user}
        sections={sections}
        initialCollapsed={initialCollapsed}
        fallbackName="Finance"
        footerSub="Finance · settings & admin"
        footerMenu={(menu) => <AccountMenu {...menu} groups={groups} onWindow={setWin} />}
      />
      <EditProfileDialog open={win === 'profile'} onClose={close} user={user} />
      <ChangePasswordDialog open={win === 'password'} onClose={close} />
      <SignOutDialog open={win === 'signout'} onClose={close} />
    </>
  )
}
