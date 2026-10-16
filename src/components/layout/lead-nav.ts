// Lead View's sidebar (2026-10-16, the user's design canvas "Lead View" — approved "1，2，3（中英）"): the view
// sidebar HR's and Finance's views draw, with Lead View's own pages —
//
//   Inbox · Leads · Insight
//   I. SET UP   Settings
//
// The canvas's other boards (Campaigns, AI Agent, Data Center, Flows) are later phases; their rows join here
// with their pages. Every row asks its page's tab, as every view sidebar does (visibleHrNav → opensPath).

import { canAccessLeads } from '@/lib/roles'
import type { HrIconName } from '@/components/hrv/icons'
import type { NavViewer } from './nav-config'
import type { HrNavItem, HrNavSection } from './hr-nav'

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/')

const link = (key: string, label: string, icon: HrIconName, href: string, match: HrNavItem['match']): HrNavItem => ({
  key, label, icon, href, match, visible: (v: NavViewer) => canAccessLeads(v),
})

export function leadNavSections(): HrNavSection[] {
  return [
    {
      label: null,
      tone: 'walnut',
      items: [
        link('leads-inbox', 'Inbox', 'in', '/leads', (p) => p === '/leads'),
        link('leads-list', 'Leads', 'people', '/leads/list', (p) => under(p, '/leads/list')),
        link('leads-insight', 'Insight', 'report', '/leads/insight', (p) => under(p, '/leads/insight')),
      ],
    },
    {
      label: 'Set up',
      tone: 'clay',
      items: [link('leads-settings', 'Settings', 'doc', '/leads/settings', (p) => under(p, '/leads/settings'))],
    },
  ]
}

/** Is this path one of Lead View's pages? PortalFrame draws Lead View's shell on them. */
export function isLeadViewPath(pathname: string | null | undefined): boolean {
  return !!pathname && under(pathname, '/leads')
}
