'use client'

import { useMemo } from 'react'
import type { User } from '@/types'
import { hrNavSections, visibleHrNav } from './hr-nav'
import ViewSidebar from './ViewSidebar'

// HR's sidebar (2026-10-10, the HR revamp handoff): the view sidebar with HR's
// six sections (hr-nav.ts). 212px since 2026-10-14 — the Finance revamp v2
// draws both views' sidebars that wide (its README: "sidebar 212px with
// hr-nav.ts sections").

export default function HrSidebar({
  user,
  revenueSub,
  initialCollapsed,
}: {
  user: User
  /** The Revenue sub-department Comm Cal / Sales Groups / Rules open (null = none yet). */
  revenueSub: string | null
  initialCollapsed: boolean
}) {
  const sections = useMemo(() => visibleHrNav(hrNavSections(revenueSub), user), [revenueSub, user])
  return (
    <ViewSidebar
      user={user}
      sections={sections}
      initialCollapsed={initialCollapsed}
      footerSub={user.actualRole ? 'Viewing as HR' : 'HR view'}
    />
  )
}
