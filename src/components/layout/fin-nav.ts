// The Finance view's sidebar (2026-10-14, the Finance revamp v2 — the Claude
// Design handoff `.design/fin-r2/handoff`, `Finance Desktop.dc.html`): HR's
// sidebar, drawn with Finance's categories —
//
//   Overview
//   I.   DAILY        Payments · Receipt · Invoice · Billing Allocator · Daily Bank · Reconciliation · Journal Entries
//   II.  FUND         Fund IN · Fund OUT · Invoice Financing · Repayment · Statements
//   III. REPORT       General Ledger · P&L · Cash Flow · Receipt & Payment · Balance Sheet · Trial Balance ·
//                     Debtor Aging · Loan Aging · Company Statement · Chart of Account · Base Rate History
//   IV.  DEPARTMENT   Dept Pool · each department · Venture Pool
//
// and Admin is no category: Audit Log, Departments and Meeting Rooms sit in the
// footer's account menu with Edit profile and Change password (finAccountMenu).
// The user's calls (2026-10-14): Approvals and Claims, which the design leaves
// out, show to whoever holds them — Approvals first in Daily, Claims last in
// Department; Overdue, which the design lists under Fund, stays gone (its page
// went the same day).

import { opensPath } from '@/lib/page-tabs'
import { statementDepts, statementPath } from '@/lib/dept-statements'
import {
  canAccessCategories,
  canAccessClaims,
  canAccessDeptPool,
  canAccessDeptReports,
  canAccessMeetingRooms,
  canAccessReports,
  canAccessTreasury,
  canAccessVenturePool,
  canApprove,
  canChangePassword,
  canSeeAuditChanges,
} from '@/lib/roles'
import type { HrIconName } from '@/components/hrv/icons'
import { readsDeptStatements, type NavData, type NavViewer } from './nav-config'
import type { HrNavItem, HrNavSection } from './hr-nav'

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/')
const receiptForm = (pathname: string, search?: URLSearchParams | null) =>
  under(pathname, '/payments/new') && search?.get('mode') === 'receipt'

/** The departments' glyphs, as the design draws its five; one added since takes the pool's. */
const DEPT_ICON: Readonly<Record<string, HrIconName>> = {
  venture: 'director',
  marketing: 'people',
  finance: 'payroll',
  hr: 'staff',
  'director-office': 'director',
}

const link = (
  key: string,
  label: string,
  icon: HrIconName,
  href: string,
  visible: (v: NavViewer) => boolean,
  match: HrNavItem['match'] = (p) => under(p, href.split('?')[0]),
  more: Partial<HrNavItem> = {},
): HrNavItem => ({ key, label, icon, href, visible, match, ...more })

/** Finance's sections, with Dept Pool's departments from the registry (the five when none is handed in). */
export function finNavSections(data: NavData): HrNavSection[] {
  const depts = data.deptPoolDepts ?? statementDepts([])
  return [
    {
      label: null,
      tone: 'walnut',
      items: [link('overview', 'Overview', 'home', '/dashboard', () => true)],
    },
    {
      label: 'Daily',
      tone: 'clay',
      items: [
        link('approvals', 'Approvals', 'approve', '/approvals', canApprove),
        // A receipt's form is Receipt's; a receipt's own page names Receipt itself (NavOwner).
        link('payments', 'Payments', 'out', '/payments', canAccessTreasury, (p, q) => under(p, '/payments') && !receiptForm(p, q)),
        link('receipts', 'Receipt', 'in', '/receipts', canAccessTreasury, (p, q) => under(p, '/receipts') || receiptForm(p, q)),
        // /statements is the Invoices landing; an invoice's own page and the billing forms are Invoice's.
        link('invoices', 'Invoice', 'invoice', '/statements', canAccessTreasury, (p) => p === '/statements' || under(p, '/invoices') || under(p, '/billing')),
        link('billing', 'Billing Allocator', 'people', '/billing-allocator', canAccessTreasury),
        link('daily-bank', 'Daily Bank', 'calendar', '/daily-bank', canAccessTreasury),
        link('recon', 'Reconciliation', 'approve', '/reconciliation', canAccessTreasury, (p) => under(p, '/reconciliation') && !under(p, '/reconciliation/journal-entries')),
        link('journal', 'Journal Entries', 'doc', '/reconciliation/journal-entries', canAccessTreasury),
      ],
    },
    {
      label: 'Fund',
      tone: 'olive',
      items: [
        link('fund-in', 'Fund IN', 'in', '/fund-in', canAccessTreasury),
        link('fund-out', 'Fund OUT', 'out', '/fund-out', canAccessTreasury),
        link('ba', 'Invoice Financing', 'percent', '/ba', canAccessTreasury),
        link('repayment', 'Repayment', 'calendar', '/repayment-schedule', canAccessTreasury),
        // The month's statements and a statement's own page (/statements/<id>).
        link('statements', 'Statements', 'receipt', '/statements/monthly', canAccessTreasury, (p) => p.startsWith('/statements/') && !under(p, '/statements/export')),
      ],
    },
    {
      label: 'Report',
      tone: 'slate',
      items: [
        link('ledger', 'General Ledger', 'doc', '/reports/ledger', canAccessReports),
        // Month by month for whoever reads the reports company-wide; a department's own reader keeps the single month.
        link('pnl', 'P&L', 'report', '/reports/monthly-pnl', canAccessReports, (p) => under(p, '/reports/monthly-pnl') || under(p, '/reports/income-statement')),
        link('pnl-month', 'P&L', 'report', '/reports/income-statement', (v) => canAccessDeptReports(v) && !canAccessReports(v), (p) => under(p, '/reports/income-statement') || under(p, '/reports/monthly-pnl')),
        link('cf', 'Cash Flow', 'in', '/reports/cash-flow', canAccessDeptReports, (p) => under(p, '/reports/cash-flow') || under(p, '/reports/monthly-cash-flow')),
        link('rp', 'Receipt & Payment', 'receipt', '/reports/receipt-payment', canAccessDeptReports, (p) => under(p, '/reports/receipt-payment') || under(p, '/reports/monthly-receipt-payment')),
        link('bs', 'Balance Sheet', 'tree', '/reports/balance-sheet', canAccessReports),
        link('tb', 'Trial Balance', 'approve', '/reports/trial-balance', canAccessReports),
        link('debtor', 'Debtor Aging', 'people', '/reports/debtor-aging', canAccessDeptReports),
        link('loan', 'Loan Aging', 'percent', '/reports/loan-aging', canAccessReports),
        link('stmt', 'Company Statement', 'invoice', '/reports/company-statement', canAccessReports),
        link('coa', 'Chart of Account', 'tree', '/settings?tab=accounts', canAccessCategories, (p, q) => p === '/settings' && q?.get('tab') === 'accounts', {
          permissionTabs: ['fin.chart_of_account'],
        }),
        link('base-rate', 'Base Rate History', 'percent', '/reports/base-rate', canAccessReports),
      ],
    },
    {
      label: 'Department',
      tone: 'gold',
      items: [
        link('dp', 'Dept Pool', 'org', '/dept-pool', canAccessDeptPool, (p) => p === '/dept-pool' || under(p, '/dept-pool/submissions') || under(p, '/dept-pool/contracts')),
        ...depts.map((d) =>
          link(`dp-${d.slug}`, d.label, DEPT_ICON[d.slug] ?? 'org', statementPath(d.slug), readsDeptStatements, (p) =>
            under(p, `/dept-pool/statements/${d.slug}`) || (d.poolPath !== undefined && under(p, d.poolPath)),
          ),
        ),
        link('venture-pool', 'Venture Pool', 'in', '/venture-pool', canAccessVenturePool),
        link('claims', 'Claims', 'receipt', '/claims', canAccessClaims),
      ],
    },
  ]
}

/** A row of the footer's account menu: a page to open, or one of the two windows. */
export interface AccountMenuItem {
  key: string
  label: string
  icon: HrIconName
  href?: string
  window?: 'profile' | 'password'
  permissionTabs?: readonly string[]
  visible: (viewer: NavViewer) => boolean
}

export interface AccountMenuGroup {
  title: string
  items: AccountMenuItem[]
}

/** The footer's menu (the design's D13): Account — a login of one's own only, as Change password —, then Admin. */
export function finAccountMenu(): AccountMenuGroup[] {
  return [
    {
      title: 'Account',
      items: [
        { key: 'profile', label: 'Edit profile', icon: 'staff', window: 'profile', visible: canChangePassword },
        { key: 'password', label: 'Change password', icon: 'lock', window: 'password', visible: canChangePassword },
      ],
    },
    {
      title: 'Admin',
      items: [
        { key: 'audit', label: 'Audit Log', icon: 'report', href: '/audit-log', visible: canSeeAuditChanges },
        // Settings › Departments is Finance's (the Chart of Account's tab).
        { key: 'depts', label: 'Departments', icon: 'org', href: '/settings?tab=departments', permissionTabs: ['fin.chart_of_account'], visible: canAccessCategories },
        { key: 'rooms', label: 'Meeting Rooms', icon: 'room', href: '/admin/rooms', visible: canAccessMeetingRooms },
      ],
    },
  ]
}

/** The menu this viewer sees: a group with nothing left drops out. */
export function visibleAccountMenu(groups: AccountMenuGroup[], viewer: NavViewer): AccountMenuGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.visible(viewer) && (i.href === undefined || opensPath(viewer.tabs, i.href, i.permissionTabs))),
    }))
    .filter((g) => g.items.length > 0)
}

/** The page a menu row opens is the page being read (Departments on /settings?tab=departments). */
export function accountMenuActive(groups: AccountMenuGroup[], pathname: string, search?: URLSearchParams | null): string | null {
  for (const g of groups) {
    for (const i of g.items) {
      if (!i.href) continue
      const [path, query] = i.href.split('?')
      if (!under(pathname, path)) continue
      const tab = query ? new URLSearchParams(query).get('tab') : null
      if (tab === null || search?.get('tab') === tab) return i.key
    }
  }
  return null
}
