// HR's sidebar (2026-10-10, the HR revamp handoff): sections of icon tiles,
// each section in its own tone. The order is the user's (2026-10-12) —
//
//   Overview
//   I.   HIRING         Requests · Insights · Talent Bank
//   II.  HR & PAYROLL   HR Costing · Payroll · Payment
//   III. REVENUE        Comm Cal · Sales Groups · Rules
//   IV.  PEOPLE         People Management · Hierarchy · Member Services · Documentation
//   V.   ADMIN          Meeting Rooms · Guest Link · Audit Log · Change password (a personal login's)
//   VI.  DIRECTORS      Director Salary · Director Pool
//
// Claims and the Revenue Department page left HR's sidebar (their pages are
// still there), and Fair | IR left it altogether: a Revenue page picks its
// sub-department with the switcher on its own head, and these three links
// open the one last picked.

import { can } from '@/lib/permissions'
import { opensPath } from '@/lib/page-tabs'
import { revenuePath } from '@/lib/revenue'
import {
  canAccessDirectorPool,
  canAccessDirectorSalary,
  canAccessDocumentation,
  canAccessRevenue,
  canAccessTeam,
  canAccessHiring,
  canOpenPeople,
  canSeeAuditChanges,
  canAccessMeetingRooms,
  canAccessGuestLink,
  canChangePassword,
  canSeeMyDocuments,
} from '@/lib/roles'
import type { HrIconName } from '@/components/hrv/icons'
import type { NavViewer } from './nav-config'

export type HrNavTone = 'walnut' | 'clay' | 'gold' | 'slate' | 'olive'

export interface HrNavItem {
  key: string
  label: string
  icon: HrIconName
  href: string
  /** Is this the page being read? The query is handed in for a link into a tab (`/settings?tab=accounts`). */
  match: (pathname: string, search?: URLSearchParams | null) => boolean
  visible: (viewer: NavViewer) => boolean
  /** The permission tabs any one of which shows the link, where its page's own list is not the answer — Settings' tabs share one page. */
  permissionTabs?: readonly string[]
}

export interface HrNavSection {
  /** null = the unlabelled first row (Overview). */
  label: string | null
  tone: HrNavTone
  items: HrNavItem[]
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/')

/** Which of Revenue's three a `/revenue/<sub>/…` path is; null off Revenue (or on its reserved pages). */
export function revenueView(pathname: string): 'cc' | 'sg' | 'rules' | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'revenue') return null
  if (parts.length === 1) return 'cc'
  if (parts[1] === 'department' || parts[1] === 'products') return null
  if (parts[2] === 'hierarchy') return 'sg'
  if (parts[2] === 'rules') return 'rules'
  return 'cc'
}

const seesHrCosting = (v: NavViewer) => canAccessTeam(v)
const seesRevenue = (sub: string | null) => (v: NavViewer) => sub !== null && canAccessRevenue(v)
const seesMemberServices = (v: NavViewer) => can(v, 'member_requests_manage') || can(v, 'member_memos_manage')

/** HR's sections, with Revenue's links on `revenueSub` (null = none set up yet). */
export function hrNavSections(revenueSub: string | null): HrNavSection[] {
  const rev = (view?: 'hierarchy' | 'rules') => (revenueSub ? (view ? revenuePath(revenueSub, view) : revenuePath(revenueSub)) : '/revenue')
  return [
    {
      label: null,
      tone: 'walnut',
      items: [{ key: 'overview', label: 'Overview', icon: 'home', href: '/dashboard', match: p => under(p, '/dashboard'), visible: () => true }],
    },
    // Round 2 (2026-10-11, README §3): HIRING, clay — first since 2026-10-12 (user).
    {
      label: 'Hiring',
      tone: 'clay',
      items: [
        { key: 'hire', label: 'Requests', icon: 'hire', href: '/hiring/requests', match: p => under(p, '/hiring/requests'), visible: canAccessHiring },
        { key: 'hireIns', label: 'Insights', icon: 'report', href: '/hiring/insights', match: p => under(p, '/hiring/insights'), visible: canAccessHiring },
        { key: 'talent', label: 'Talent Bank', icon: 'staff', href: '/hiring/talent', match: p => under(p, '/hiring/talent'), visible: canAccessHiring },
      ],
    },
    {
      label: 'HR & Payroll',
      tone: 'clay',
      items: [
        {
          key: 'hrc',
          label: 'HR Costing',
          icon: 'report',
          href: '/hr-costing',
          match: p => under(p, '/hr-costing') && !under(p, '/hr-costing/payroll') && !under(p, '/hr-costing/payment'),
          visible: seesHrCosting,
        },
        { key: 'pay', label: 'Payroll', icon: 'payroll', href: '/hr-costing/payroll', match: p => under(p, '/hr-costing/payroll'), visible: seesHrCosting },
        { key: 'pmt', label: 'Payment', icon: 'out', href: '/hr-costing/payment', match: p => under(p, '/hr-costing/payment'), visible: seesHrCosting },
      ],
    },
    {
      label: 'Revenue',
      tone: 'slate',
      items: [
        { key: 'cc', label: 'Comm Cal', icon: 'in', href: rev(), match: p => revenueView(p) === 'cc', visible: seesRevenue(revenueSub) },
        { key: 'sg', label: 'Sales Groups', icon: 'tree', href: rev('hierarchy'), match: p => revenueView(p) === 'sg', visible: seesRevenue(revenueSub) },
        { key: 'rules', label: 'Rules', icon: 'invoice', href: rev('rules'), match: p => revenueView(p) === 'rules', visible: seesRevenue(revenueSub) },
      ],
    },
    {
      label: 'People',
      tone: 'olive',
      items: [
        { key: 'ppl', label: 'People Management', icon: 'staff', href: '/team/people', match: p => under(p, '/team/people') || under(p, '/team/accounts') || under(p, '/team/permissions'), visible: canOpenPeople },
        { key: 'hier', label: 'Hierarchy', icon: 'org', href: '/team/hierarchy', match: p => under(p, '/team/hierarchy') || under(p, '/team/roles'), visible: canOpenPeople },
        { key: 'mem', label: 'Member Services', icon: 'approve', href: '/member-admin', match: p => under(p, '/member-admin'), visible: seesMemberServices },
        { key: 'docs', label: 'Documentation', icon: 'doc', href: '/team/documentation', match: p => under(p, '/team/documentation'), visible: canAccessDocumentation },
      ],
    },
    {
      label: 'Admin',
      tone: 'walnut',
      items: [
        // Round 2 (2026-10-11): every view books a room.
        { key: 'rooms', label: 'Meeting Rooms', icon: 'room', href: '/admin/rooms', match: p => under(p, '/admin/rooms'), visible: canAccessMeetingRooms },
        { key: 'guestlink', label: 'Guest Link', icon: 'link', href: '/admin/guest-link', match: p => under(p, '/admin/guest-link'), visible: canAccessGuestLink },
        { key: 'audit', label: 'Audit Log', icon: 'report', href: '/audit-log', match: p => under(p, '/audit-log'), visible: canSeeAuditChanges },
        // My documents (2026-10-14): one's own — Company and Personal — for a login of one's own, as Change password.
        { key: 'mydocs', label: 'My documents', icon: 'doc', href: '/admin/documents', match: p => under(p, '/admin/documents'), visible: canSeeMyDocuments },
        // Change password (2026-10-12): a person's own login only — never a shared one (principal@, hr@ …).
        { key: 'password', label: 'Change password', icon: 'lock', href: '/admin/password', match: p => under(p, '/admin/password'), visible: canChangePassword },
      ],
    },
    {
      label: 'Directors',
      tone: 'gold',
      items: [
        { key: 'dsal', label: 'Director Salary', icon: 'director', href: '/director-salary', match: p => under(p, '/director-salary'), visible: canAccessDirectorSalary },
        { key: 'dpool', label: 'Director Pool', icon: 'in', href: '/director-pool', match: p => under(p, '/director-pool'), visible: canAccessDirectorPool },
      ],
    },
  ]
}

/** The sections this viewer sees: empty sections drop out, and the roman numerals count only what is left. */
export function visibleHrNav(sections: HrNavSection[], viewer: NavViewer): Array<HrNavSection & { roman: string | null }> {
  const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.']
  let n = 0
  const out: Array<HrNavSection & { roman: string | null }> = []
  for (const section of sections) {
    // A link also asks its page's tabs (2026-10-11, 8b): it shows only where its page would open.
    const items = section.items.filter(item => item.visible(viewer) && opensPath(viewer.tabs, item.href, item.permissionTabs))
    if (items.length === 0) continue
    out.push({ ...section, items, roman: section.label ? ROMAN[n++] : null })
  }
  return out
}

/** The item the path belongs to, if any. */
export function activeHrNavKey(sections: HrNavSection[], pathname: string, search?: URLSearchParams | null): string | null {
  for (const section of sections) {
    for (const item of section.items) if (item.match(pathname, search)) return item.key
  }
  return null
}
