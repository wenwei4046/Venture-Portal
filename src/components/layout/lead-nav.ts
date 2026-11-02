// Lead View's rail (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2` — `NAV` in `Lead View App.dc.html`,
// names and Lucide icons as drawn; the user: "名称（完全跟claude design 画的）"):
//
//   Inbox · Leads · Insight · Campaigns
//   │ Reply rules · Reply templates · Step library · AI Agent
//   │ General info · Data Center · AI corrections
//   │ Working hours · Audit log · Settings
//
// `│` is a 1px divider; the groups carry no label on the rail (their kicker names them in the code only).
// Every row asks its page's tab, as every view sidebar does (opensPath).

import { canAccessLeads } from '@/lib/roles'
import { opensPath } from '@/lib/page-tabs'
import type { NavViewer } from './nav-config'
import type { LeadIconName } from './lead-icons'

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/')

export interface LeadNavItem {
  key: string
  label: string
  icon: LeadIconName
  href: string
  match: (pathname: string) => boolean
}

export interface LeadNavSection {
  /** The group's kicker (README §5) — null for the first group. */
  label: string | null
  items: LeadNavItem[]
}

const link = (key: string, label: string, icon: LeadIconName, href: string, exact = false): LeadNavItem => ({
  key, label, icon, href, match: (p) => (exact ? p === href : under(p, href)),
})

export function leadNavSections(): LeadNavSection[] {
  return [
    {
      label: null,
      items: [
        link('leads-inbox', 'Inbox', 'inbox', '/leads', true),
        link('leads-list', 'Leads', 'users', '/leads/list'),
        link('leads-insight', 'Insight', 'chart-column', '/leads/insight'),
        link('leads-campaigns', 'Campaigns', 'megaphone', '/leads/campaigns'),
      ],
    },
    {
      label: 'Replies',
      items: [
        link('leads-rules', 'Reply rules', 'split', '/leads/rules'),
        link('leads-flows', 'Reply templates', 'workflow', '/leads/flows'),
        link('leads-steps', 'Step library', 'blocks', '/leads/library'),
        link('leads-ai', 'AI Agent', 'sparkles', '/leads/ai'),
      ],
    },
    {
      label: 'Files',
      items: [
        link('leads-info', 'General info', 'book-open', '/leads/info'),
        link('leads-knowledge', 'Data Center', 'library', '/leads/knowledge'),
        link('leads-corrections', 'AI corrections', 'history', '/leads/corrections'),
      ],
    },
    {
      label: 'Admin',
      items: [
        link('leads-hours', 'Working hours', 'clock', '/leads/hours'),
        link('leads-audit', 'Audit log', 'scroll-text', '/leads/audit'),
        link('leads-settings', 'Settings', 'settings', '/leads/settings'),
      ],
    },
  ]
}

/** The sections this viewer sees: a row only where its page opens for them; a group with no row left goes. */
export function visibleLeadNav(sections: LeadNavSection[], viewer: NavViewer): LeadNavSection[] {
  if (!canAccessLeads(viewer)) return []
  return sections
    .map(sec => ({ ...sec, items: sec.items.filter(i => opensPath(viewer.tabs, i.href)) }))
    .filter(sec => sec.items.length > 0)
}

/** The header's title: the rail row whose page this is (the prototype's `cur.label`), else "Lead View". */
export function leadPageTitle(pathname: string): string {
  for (const sec of leadNavSections()) for (const item of sec.items) if (item.match(pathname)) return item.label
  return 'Lead View'
}

/** The header's search is drawn on Inbox and Leads only (the prototype's `showSearch`). */
export function showsLeadSearch(pathname: string): boolean {
  return pathname === '/leads' || under(pathname, '/leads/list')
}

/** Is this path one of Lead View's pages? PortalFrame draws Lead View's shell on them. */
export function isLeadViewPath(pathname: string | null | undefined): boolean {
  return !!pathname && under(pathname, '/leads')
}
