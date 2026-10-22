// Lead View's sidebar (2026-10-22, the redesign v2 handoff `docs/design_handoff_lead_view_inbox` — the user: "照
// claude design 最新版本"; until then the view sidebar of 2026-10-16):
//
//   Inbox · Leads · Insight · Campaigns
//   REPLIES  Reply rules · Reply templates · Step library · AI Agent
//   FILES    General info · Data Center · AI corrections
//   ADMIN    Business hours · Audit log · Settings
//
// A row whose page is not built yet (`href: null`) is drawn greyed, *Soon* — the redesign builds them
// step by step (`.claude/rules/leads/lead-view.md` › REDESIGN V2). Reply templates are today's Automations page.
// Every built row asks its page's tab, as every view sidebar does (opensPath).

import { canAccessLeads } from '@/lib/roles'
import { opensPath } from '@/lib/page-tabs'
import type { NavViewer } from './nav-config'
import type { LeadIconName } from './lead-icons'

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/')

export interface LeadNavItem {
  key: string
  label: string
  icon: LeadIconName
  /** null = the page is not built yet. */
  href: string | null
  match: (pathname: string) => boolean
}

export interface LeadNavSection {
  /** null = the unlabelled first group. */
  label: string | null
  items: LeadNavItem[]
}

const link = (key: string, label: string, icon: LeadIconName, href: string, exact = false): LeadNavItem => ({
  key, label, icon, href, match: (p) => (exact ? p === href : under(p, href)),
})
const soon = (key: string, label: string, icon: LeadIconName): LeadNavItem => ({ key, label, icon, href: null, match: () => false })

export function leadNavSections(): LeadNavSection[] {
  return [
    {
      label: null,
      items: [
        link('leads-inbox', 'Inbox', 'inbox', '/leads', true),
        link('leads-list', 'Leads', 'users', '/leads/list'),
        link('leads-insight', 'Insight', 'chart', '/leads/insight'),
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
        link('leads-info', 'General info', 'bookOpen', '/leads/info'),
        link('leads-knowledge', 'Data Center', 'library', '/leads/knowledge'),
        link('leads-corrections', 'AI corrections', 'history', '/leads/corrections'),
      ],
    },
    {
      label: 'Admin',
      items: [
        link('leads-hours', 'Business hours', 'clock', '/leads/hours'),
        soon('leads-audit', 'Audit log', 'scroll'),
        link('leads-settings', 'Settings', 'settings', '/leads/settings'),
      ],
    },
  ]
}

/** The sections this viewer sees: a built row only where its page opens for them; a group with no row left goes. */
export function visibleLeadNav(sections: LeadNavSection[], viewer: NavViewer): LeadNavSection[] {
  if (!canAccessLeads(viewer)) return []
  return sections
    .map(sec => ({ ...sec, items: sec.items.filter(i => i.href === null || opensPath(viewer.tabs, i.href)) }))
    .filter(sec => sec.items.some(i => i.href !== null))
}

/** Is this path one of Lead View's pages? PortalFrame draws Lead View's shell on them. */
export function isLeadViewPath(pathname: string | null | undefined): boolean {
  return !!pathname && under(pathname, '/leads')
}
