// HR's sidebar (2026-10-10, the HR revamp handoff): five sections of icon
// tiles, each section in its own tone, in the prototype's order —
//
//   Overview
//   I.   HR & PAYROLL   HR Costing · Payroll · Payment
//   II.  DIRECTORS      Director Salary · Director Pool
//   III. REVENUE        Comm Cal · Sales Groups · Rules
//   IV.  PEOPLE         People Management · Hierarchy · Member Services
//   V.   ADMIN          Audit Log
//
// Claims and the Revenue Department page left HR's sidebar (their pages are
// still there), and Fair | IR left it altogether: a Revenue page picks its
// sub-department with the switcher on its own head, and these three links
// open the one last picked.

import { can } from '@/lib/permissions'
import { revenuePath } from '@/lib/revenue'
import {
  canAccessDirectorPool,
  canAccessDirectorSalary,
  canAccessRevenue,
  canAccessTeam,
  canOpenPeople,
  canSeeAuditChanges,
} from '@/lib/roles'
import type { NavIconName } from '@/components/hrv/icons'
import type { NavViewer } from './nav-config'

export type HrNavTone = 'walnut' | 'clay' | 'gold' | 'slate' | 'olive'

export interface HrNavItem {
  key: string
  label: string
  icon: NavIconName
  href: string
  /** Is this the page being read? */
  match: (pathname: string) => boolean
  visible: (viewer: NavViewer) => boolean
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
      label: 'Directors',
      tone: 'gold',
      items: [
        { key: 'dsal', label: 'Director Salary', icon: 'director', href: '/director-salary', match: p => under(p, '/director-salary'), visible: canAccessDirectorSalary },
        { key: 'dpool', label: 'Director Pool', icon: 'in', href: '/director-pool', match: p => under(p, '/director-pool'), visible: canAccessDirectorPool },
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
      ],
    },
    {
      label: 'Admin',
      tone: 'walnut',
      items: [{ key: 'audit', label: 'Audit Log', icon: 'report', href: '/audit-log', match: p => under(p, '/audit-log'), visible: canSeeAuditChanges }],
    },
  ]
}

/** The sections this viewer sees: empty sections drop out, and the roman numerals count only what is left. */
export function visibleHrNav(sections: HrNavSection[], viewer: NavViewer): Array<HrNavSection & { roman: string | null }> {
  const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.']
  let n = 0
  const out: Array<HrNavSection & { roman: string | null }> = []
  for (const section of sections) {
    const items = section.items.filter(item => item.visible(viewer))
    if (items.length === 0) continue
    out.push({ ...section, items, roman: section.label ? ROMAN[n++] : null })
  }
  return out
}

/** The item the path belongs to, if any. */
export function activeHrNavKey(sections: HrNavSection[], pathname: string): string | null {
  for (const section of sections) {
    for (const item of section.items) if (item.match(pathname)) return item.key
  }
  return null
}
