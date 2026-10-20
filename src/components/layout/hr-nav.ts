// HR's sidebar (2026-10-10, the HR revamp handoff): sections of icon tiles,
// each section in its own tone. The order is the Attendance handoff's
// (2026-10-15, "Attendance Prototype Design" README › Sidebar, final order) —
//
//   Overview
//   I.    HIRING             Requests · Insights · Talent Bank
//   II.   ATTENDANCE         Today · Records · Requests · Leave balances · Month close · Settings · Readiness
//   III.  HR & PAYROLL       HR Costing · Payroll · Allocation · Payment
//   IV.   REVENUE            Comm Cal · Sales chart · Members · Waiting list · Replacement list · Rules ·
//                            Requests · Brand weeks · Transport claim · Food claim
//   V.    PEOPLE MANAGEMENT  People · Permissions · Org chart · People & roles · Levels
//   VI.   DOCUMENTATION      Documents · Data center · Letters · Publish
//   VII.  ADMIN              Room schedule · Rooms · Guest Link · Audit Log · Change password
//   VIII. DIRECTORS          Director Salary · Director Pool
//
// A page with tabs is opened on its tab (`?tab=`): Sales Groups' four tabs,
// Member Services' four (dissolved into Revenue — "Request reviews" became
// Requests), People Management's two, Hierarchy's three (merged into People
// Management), Documentation's four and Meeting Rooms' two are each a row.
// Claims and the Revenue Department page left HR's sidebar (their pages are
// still there), and Fair | IR left it altogether: a Revenue page picks its
// sub-department with the switcher on its own head, and its links open the one
// last picked. Admin's My documents left it (the handoff: "Company docs /
// Personal docs removed"); the page stays.

import { can } from '@/lib/permissions'
import { opensPath } from '@/lib/page-tabs'
import { revenuePath } from '@/lib/revenue'
import {
  canAccessAttendance,
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
/** On `prefix`, on the tab `tab` (`fallback` when the query names none or another the page does not know). */
const onTab = (pathname: string, search: URLSearchParams | null | undefined, prefix: string, tab: string, tabs: readonly string[], fallback: string) => {
  if (!under(pathname, prefix)) return false
  const raw = search?.get('tab') ?? ''
  return (tabs.includes(raw) ? raw : fallback) === tab
}

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

/** Revenue's three pages and the sub-department each opens (2026-10-16 — the viewer's reach, per page). */
export type HrRevenueSubs = Readonly<Record<'cc' | 'sg' | 'rules', string | null>>
const seesMemberServices = (v: NavViewer) => can(v, 'member_requests_manage') || can(v, 'member_memos_manage')

const SG_TABS = ['chart', 'members', 'waiting', 'replacement'] as const
const MEM_TABS = ['requests', 'weeks', 'claims', 'food'] as const
const HIER_TABS = ['chart', 'roles', 'levels'] as const
const DOC_TABS = ['documents', 'data-center', 'letters', 'publish'] as const
const ROOM_TABS = ['schedule', 'rooms'] as const

/**
 * HR's sections, with Revenue's links on `revenueSub` (null = none set up yet) —
 * or, per page, on the sub-department each opens for this viewer (2026-10-16:
 * what they reach there; null leaves that page's links out).
 */
export function hrNavSections(revenueSub: string | null | HrRevenueSubs): HrNavSection[] {
  const subs: HrRevenueSubs = typeof revenueSub === 'object' && revenueSub !== null ? revenueSub : { cc: revenueSub, sg: revenueSub, rules: revenueSub }
  const rev = (view?: 'hierarchy' | 'rules') => {
    const sub = view === 'hierarchy' ? subs.sg : view === 'rules' ? subs.rules : subs.cc
    return sub ? (view ? revenuePath(sub, view) : revenuePath(sub)) : '/revenue'
  }
  const sg = (tab: (typeof SG_TABS)[number]) => (tab === 'chart' ? rev('hierarchy') : `${rev('hierarchy')}?tab=${tab}`)
  const sgOn = (tab: string) => (p: string, s?: URLSearchParams | null) => revenueView(p) === 'sg' && (SG_TABS.includes((s?.get('tab') ?? '') as never) ? s?.get('tab') : 'chart') === tab
  const mem = (tab: (typeof MEM_TABS)[number]) => (tab === 'requests' ? '/member-admin' : `/member-admin?tab=${tab}`)
  const memOn = (tab: string) => (p: string, s?: URLSearchParams | null) => onTab(p, s, '/member-admin', tab, MEM_TABS, 'requests')
  const hier = (tab: (typeof HIER_TABS)[number]) => (tab === 'chart' ? '/team/hierarchy' : `/team/hierarchy?tab=${tab}`)
  const hierOn = (tab: string) => (p: string, s?: URLSearchParams | null) =>
    under(p, '/team/roles') ? tab === 'roles' : onTab(p, s, '/team/hierarchy', tab, [...HIER_TABS, 'table'], 'chart') || (tab === 'roles' && under(p, '/team/hierarchy') && s?.get('tab') === 'table')
  const doc = (tab: (typeof DOC_TABS)[number]) => (tab === 'documents' ? '/team/documentation' : `/team/documentation?tab=${tab}`)
  const docOn = (tab: string) => (p: string, s?: URLSearchParams | null) => onTab(p, s, '/team/documentation', tab, DOC_TABS, 'documents')
  const roomOn = (tab: string) => (p: string, s?: URLSearchParams | null) => onTab(p, s, '/admin/rooms', tab, ROOM_TABS, 'schedule')
  const att = (path: string) => (p: string) => under(p, path)
  return [
    {
      label: null,
      tone: 'walnut',
      items: [{ key: 'overview', label: 'Overview', icon: 'home', href: '/dashboard', match: p => under(p, '/dashboard'), visible: () => true }],
    },
    {
      label: 'Hiring',
      tone: 'clay',
      items: [
        { key: 'hire', label: 'Requests', icon: 'hire', href: '/hiring/requests', match: p => under(p, '/hiring/requests'), visible: canAccessHiring },
        { key: 'hireIns', label: 'Insights', icon: 'report', href: '/hiring/insights', match: p => under(p, '/hiring/insights'), visible: canAccessHiring },
        { key: 'talent', label: 'Talent Bank', icon: 'staff', href: '/hiring/talent', match: p => under(p, '/hiring/talent'), visible: canAccessHiring },
      ],
    },
    // HR › Attendance (2026-10-15, the Attendance handoff): olive, after Hiring.
    {
      label: 'Attendance',
      tone: 'olive',
      items: [
        { key: 'today', label: 'Today', icon: 'in', href: '/attendance/today', match: att('/attendance/today'), visible: canAccessAttendance },
        { key: 'records', label: 'Records', icon: 'report', href: '/attendance/records', match: att('/attendance/records'), visible: canAccessAttendance },
        { key: 'requests', label: 'Requests', icon: 'approve', href: '/attendance/requests', match: att('/attendance/requests'), visible: canAccessAttendance },
        { key: 'balances', label: 'Leave balances', icon: 'calendar', href: '/attendance/balances', match: att('/attendance/balances'), visible: canAccessAttendance },
        { key: 'close', label: 'Month close', icon: 'lock', href: '/attendance/close', match: att('/attendance/close'), visible: canAccessAttendance },
        { key: 'settings', label: 'Settings', icon: 'org', href: '/attendance/settings', match: att('/attendance/settings'), visible: canAccessAttendance },
        { key: 'ready', label: 'Readiness', icon: 'fileAlert', href: '/attendance/readiness', match: att('/attendance/readiness'), visible: canAccessAttendance },
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
          match: p => under(p, '/hr-costing') && !under(p, '/hr-costing/payroll') && !under(p, '/hr-costing/payment') && !under(p, '/hr-costing/allocation'),
          visible: seesHrCosting,
        },
        { key: 'pay', label: 'Payroll', icon: 'payroll', href: '/hr-costing/payroll', match: p => under(p, '/hr-costing/payroll'), visible: seesHrCosting },
        { key: 'payAlloc', label: 'Allocation', icon: 'percent', href: '/hr-costing/allocation', match: p => under(p, '/hr-costing/allocation'), visible: seesHrCosting },
        { key: 'pmt', label: 'Payment', icon: 'out', href: '/hr-costing/payment', match: p => under(p, '/hr-costing/payment'), visible: seesHrCosting },
      ],
    },
    {
      label: 'Revenue',
      tone: 'slate',
      items: [
        { key: 'cc', label: 'Comm Cal', icon: 'in', href: rev(), match: p => revenueView(p) === 'cc', visible: seesRevenue(subs.cc) },
        { key: 'sgChart', label: 'Sales chart', icon: 'tree', href: sg('chart'), match: sgOn('chart'), visible: seesRevenue(subs.sg) },
        { key: 'sgMembers', label: 'Members', icon: 'people', href: sg('members'), match: sgOn('members'), visible: seesRevenue(subs.sg) },
        { key: 'sgWait', label: 'Waiting list', icon: 'calendar', href: sg('waiting'), match: sgOn('waiting'), visible: seesRevenue(subs.sg) },
        { key: 'sgRepl', label: 'Replacement list', icon: 'staff', href: sg('replacement'), match: sgOn('replacement'), visible: seesRevenue(subs.sg) },
        { key: 'rules', label: 'Rules', icon: 'invoice', href: rev('rules'), match: p => revenueView(p) === 'rules', visible: seesRevenue(subs.rules) },
        // Member Services dissolved into Revenue (the handoff): its four tabs, "Request reviews" → Requests.
        { key: 'memReq', label: 'Requests', icon: 'approve', href: mem('requests'), match: memOn('requests'), visible: seesMemberServices },
        { key: 'memWeeks', label: 'Brand weeks', icon: 'calendar', href: mem('weeks'), match: memOn('weeks'), visible: seesMemberServices },
        { key: 'memClaims', label: 'Transport claim', icon: 'receipt', href: mem('claims'), match: memOn('claims'), visible: seesMemberServices },
        { key: 'memFood', label: 'Food claim', icon: 'receipt', href: mem('food'), match: memOn('food'), visible: seesMemberServices },
      ],
    },
    {
      label: 'People Management',
      tone: 'olive',
      items: [
        { key: 'pplPeople', label: 'People', icon: 'staff', href: '/team/people', match: (p, s) => (under(p, '/team/people') && s?.get('tab') !== 'permissions') || under(p, '/team/accounts'), visible: canOpenPeople },
        {
          key: 'pplPerm',
          label: 'Permissions',
          icon: 'lock',
          href: '/team/people?tab=permissions',
          match: (p, s) => (under(p, '/team/people') && s?.get('tab') === 'permissions') || under(p, '/team/permissions'),
          // The tab People Management draws for its full readers (the directory's readers have none).
          visible: canAccessTeam,
        },
        // Hierarchy merged into People Management (the handoff): its three tabs.
        { key: 'hierChart', label: 'Org chart', icon: 'org', href: hier('chart'), match: hierOn('chart'), visible: canOpenPeople },
        { key: 'hierRoles', label: 'People & roles', icon: 'people', href: hier('roles'), match: hierOn('roles'), visible: canOpenPeople },
        { key: 'hierLevels', label: 'Levels', icon: 'tree', href: hier('levels'), match: hierOn('levels'), visible: canOpenPeople },
      ],
    },
    {
      label: 'Documentation',
      tone: 'olive',
      items: [
        { key: 'docDocs', label: 'Documents', icon: 'doc', href: doc('documents'), match: docOn('documents'), visible: canAccessDocumentation },
        { key: 'docData', label: 'Data center', icon: 'fileAlert', href: doc('data-center'), match: docOn('data-center'), visible: canAccessDocumentation },
        { key: 'docLetters', label: 'Letters', icon: 'doc', href: doc('letters'), match: docOn('letters'), visible: canAccessDocumentation },
        { key: 'docPublish', label: 'Publish', icon: 'out', href: doc('publish'), match: docOn('publish'), visible: canAccessDocumentation },
      ],
    },
    {
      label: 'Admin',
      tone: 'walnut',
      items: [
        // Every view books a room (2026-10-11); its two tabs are rows here.
        { key: 'roomSched', label: 'Room schedule', icon: 'room', href: '/admin/rooms', match: roomOn('schedule'), visible: canAccessMeetingRooms },
        { key: 'roomRooms', label: 'Rooms', icon: 'room', href: '/admin/rooms?tab=rooms', match: roomOn('rooms'), visible: canAccessMeetingRooms },
        { key: 'guestlink', label: 'Guest Link', icon: 'link', href: '/admin/guest-link', match: p => under(p, '/admin/guest-link'), visible: canAccessGuestLink },
        { key: 'audit', label: 'Audit Log', icon: 'report', href: '/audit-log', match: p => under(p, '/audit-log'), visible: canSeeAuditChanges },
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
  const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.', 'VIII.', 'IX.']
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
