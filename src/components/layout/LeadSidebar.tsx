'use client'

import { useMemo } from 'react'
import type { User } from '@/types'
import { visibleHrNav } from './hr-nav'
import { leadNavSections } from './lead-nav'
import ViewSidebar from './ViewSidebar'

// Lead View's sidebar (2026-10-16): the view sidebar with Lead View's pages (lead-nav.ts).

export default function LeadSidebar({ user, initialCollapsed }: { user: User; initialCollapsed: boolean }) {
  const sections = useMemo(() => visibleHrNav(leadNavSections(), user), [user])
  return <ViewSidebar user={user} sections={sections} initialCollapsed={initialCollapsed} fallbackName="Lead View" footerSub="Lead View · customer service" />
}
