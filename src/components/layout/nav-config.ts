// Shared navigation model for the portal shell.
//
// Extracted from Sidebar.tsx (2026-08-31) when the mobile shell moved from a
// hamburger drawer to a bottom tab bar. Three consumers now read this same
// list — the desktop Sidebar, the mobile BottomTabBar (which promotes four
// entries per role), and the MoreSheet (which renders everything else) — so
// the definition has to live in one place or the three drift apart.

import type { UserRole } from '@/types'
import {
  canAccessTreasury,
  canAccessDeptPool,
  canAccessDirectorSalary,
  canAccessDirectorPool,
  canAccessVenturePool,
  canAccessClaims,
  canAccessReports,
  canAccessDeptReports,
  canAccessSettings,
  canAccessCategories,
  canApprove,
} from '@/lib/roles'

export interface NavItem {
  href: string
  label: string
  section?: string
  // Match the path exactly. Use for parent-overview links whose href is a
  // strict prefix of sibling child hrefs (e.g. HR Costing > Overview).
  exact?: boolean
  // Active only when ?tab= equals this value (for links into tabbed pages,
  // e.g. /settings?tab=accounts). The href should carry the same query.
  tab?: string
  // Active only when ?tab= is NOT one of these (the default-tab sibling of a
  // `tab` link, e.g. Settings default vs ?tab=accounts).
  notTab?: string[]
  // Active only when ?basis= equals this value. Dept Pool's Cash/Accrual split
  // uses ?basis= (not ?tab=) — the page reads searchParams.basis.
  basis?: string
  // Active only when ?basis= is NOT one of these (the Cash sibling of Accrual).
  notBasis?: string[]
  // Never active on these path prefixes (a sibling entry owns them,
  // e.g. Payments must not light up on /payments/new — that's Receipt's).
  notPaths?: string[]
  visible: (role: UserRole) => boolean
}

// Shared active-state test for items and group children.
export function itemActive(
  item: NavItem,
  pathname: string,
  tabParam: string | null,
  basisParam: string | null,
): boolean {
  const path = item.href.split('?')[0]
  const pathMatch = item.exact
    ? pathname === path
    : pathname === path || pathname.startsWith(path + '/')
  if (!pathMatch) return false
  if (item.notPaths?.some((p) => pathname === p || pathname.startsWith(p + '/'))) return false
  if (item.tab !== undefined && tabParam !== item.tab) return false
  if (item.notTab && item.notTab.includes(tabParam ?? '')) return false
  if (item.basis !== undefined && basisParam !== item.basis) return false
  if (item.notBasis && item.notBasis.includes(basisParam ?? '')) return false
  return true
}

export interface NavGroup {
  label: string
  section?: string
  visible: (role: UserRole) => boolean
  children: NavItem[]
}

export type NavEntry = NavItem | NavGroup

export function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

const isHR = (role: UserRole) => role === 'hr'
const isHRorPrincipal = (role: UserRole) => role === 'hr' || role === 'principal'

// Layout per user spec 2026-06-10 (re-grouped from the original phase layout).
export const navEntries: NavEntry[] = [
  { href: '/dashboard', label: 'Overview', visible: () => true },

  // ── Daily Operations ──
  { href: '/approvals', label: 'Approvals', section: 'Daily Operations', visible: canApprove },
  // /payments/new is Receipt's own entry below — keep Payments off it.
  { href: '/payments', label: 'Payments', section: 'Daily Operations', notPaths: ['/payments/new'], visible: canAccessTreasury },
  // Receive-money form (settle invoice / record loan repayment / open an OR)
  // lives at /payments/new?mode=receipt — Finance + Principal.
  // Receipt ledger (2026-06-12): credit vouchers (HV-OR-*) only, same
  // tabs/filters as Payments; its Create receipt button opens the
  // credit-locked form at /payments/new?mode=receipt.
  { href: '/receipts', label: 'Receipt', section: 'Daily Operations', visible: canAccessTreasury },
  // /statements IS the invoices landing (Phase 7 Step 11 merge); the monthly
  // statements list lives at /statements/monthly (inside Fund In / Out below).
  { href: '/statements', label: 'Invoice', section: 'Daily Operations', exact: true, visible: canAccessTreasury },
  // Shared-expense allocator (port of the user's Apps Script, 2026-08-01):
  // HV-paid costs → headcount/percentage/equal/custom split → draft invoices.
  { href: '/billing-allocator', label: 'Billing Allocator', section: 'Daily Operations', visible: canAccessTreasury },
  // HR Costing group covers all monthly sub-pages. HR's daily workspace;
  // Principal gets the same group since the unified portal (2026-07-16) —
  // replaces the old flat /hr-costing link under Departments.
  {
    label: 'HR Costing',
    section: 'Daily Operations',
    visible: isHRorPrincipal,
    children: [
      { href: '/hr-costing', label: 'Overview', exact: true, visible: isHRorPrincipal },
      { href: '/hr-costing/payroll', label: 'Payroll', visible: isHRorPrincipal },
      { href: '/hr-costing/payment', label: 'Payment', visible: isHRorPrincipal },
      { href: '/hr-costing/staff', label: 'Staff', visible: isHRorPrincipal },
    ],
  },
  // HR reaches Director Salary here; Principal reaches it via the Director
  // group under Departments.
  { href: '/director-salary', label: 'Director Salary', section: 'Daily Operations', visible: isHR },
  // ── Fund In / Out (its own section, flat — user 2026-06-10) ──
  { href: '/daily-bank', label: 'Daily Bank', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/fund-in', label: 'Fund IN', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/fund-out', label: 'Fund OUT', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/ba', label: 'Bank BA', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/overdue', label: 'Overdue', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/repayment-schedule', label: 'Repayment Schedule', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/statements/monthly', label: 'Statements', section: 'Fund In / Out', visible: canAccessTreasury },

  // ── Departments ──
  {
    label: 'Dept Pool',
    section: 'Departments',
    visible: canAccessDeptPool,
    children: [
      { href: '/dept-pool', label: 'Cash', notBasis: ['accrual'], visible: canAccessDeptPool },
      { href: '/dept-pool?basis=accrual', label: 'Accrual P&L', basis: 'accrual', visible: canAccessDeptPool },
    ],
  },
  // Venture Pool = HV holding-company cash ledger (5 txn types). Sits next to
  // Dept Pool because users navigate between "department view" and "HV view"
  // when reasoning about money flow. Not under Treasury — Loo grouped it here.
  { href: '/venture-pool', label: 'Venture Pool', section: 'Departments', visible: canAccessVenturePool },
  // OPEX shows a department's payroll breakdown (per-employee Basic / KPI /
  // Allowance / ER statutory). Dept Manager sees own dept only; Principal
  // picks any dept via the in-page switcher.
  { href: '/opex', label: 'OPEX', section: 'Departments', visible: (r) => r === 'dept_manager' || r === 'principal' },
  // Dept-manager billing workbench (2026-08-20): own-segment invoices with
  // 回款 status, 开单 (draft-only), contract tracking with expiry.
  { href: '/my-billing', label: 'My Billing', section: 'Departments', visible: (r) => r === 'dept_manager' },
  // Marketing dept_manager can create service contracts for their dept
  // (mig 207 RLS). The page self-gates on Marketing dept — other dept_managers
  // clicking this would hit notFound().
  { href: '/billing/contracts/new', label: 'New Contract', section: 'Departments', visible: (r) => r === 'dept_manager' },
  {
    label: 'Director',
    section: 'Departments',
    // Group shows when any child is visible: Principal + HR (Director Pool v2
    // dropped Finance's access, so Finance no longer sees the group at all).
    visible: (r) => canAccessDirectorSalary(r) || canAccessDirectorPool(r),
    children: [
      { href: '/director-salary', label: 'Director Salary', visible: canAccessDirectorSalary },
      { href: '/director-pool', label: 'Director Pool', visible: canAccessDirectorPool },
    ],
  },
  { href: '/claims', label: 'Claims', section: 'Departments', visible: canAccessClaims },

  // ── Reports & Admin ──
  { href: '/reports/ledger', label: 'General Ledger', section: 'Reports & Admin', visible: canAccessReports },
  {
    label: 'Reports',
    section: 'Reports & Admin',
    // dept_manager sees the group for their own-department reports (P&L / Cash
    // Flow / Debtor Aging); the whole-company reports below stay principal/finance.
    visible: canAccessDeptReports,
    children: [
      { href: '/reports/income-statement', label: 'P&L', visible: canAccessDeptReports },
      { href: '/reports/monthly-pnl', label: 'Monthly P&L', visible: canAccessDeptReports },
      { href: '/reports/cash-flow', label: 'Cash Flow', visible: canAccessDeptReports },
      { href: '/reports/monthly-cash-flow', label: 'Monthly Cash Flow', visible: canAccessDeptReports },
      { href: '/reports/receipt-payment', label: 'Receipt & Payment', visible: canAccessDeptReports },
      { href: '/reports/monthly-receipt-payment', label: 'Monthly R&P', visible: canAccessDeptReports },
      { href: '/reports/balance-sheet', label: 'Balance Sheet', visible: canAccessReports },
      { href: '/reports/trial-balance', label: 'Trial Balance', visible: canAccessReports },
      { href: '/reports/fund-summary', label: 'Fund Summary', visible: canAccessReports },
      { href: '/reports/claims', label: 'Claims Report', visible: canAccessReports },
      { href: '/reports/debtor-aging', label: 'Debtor Aging', visible: canAccessDeptReports },
      { href: '/reports/loan-aging', label: 'Loan Monitor', visible: canAccessReports },
      { href: '/reports/company-statement', label: 'Company Statement', visible: canAccessReports },
    ],
  },
  { href: '/reconciliation', label: 'Reconciliation', section: 'Reports & Admin', notPaths: ['/reconciliation/journal-entries'], visible: canAccessTreasury },
  { href: '/reconciliation/journal-entries', label: 'Journal Entries', section: 'Reports & Admin', visible: canAccessTreasury },
  { href: '/audit-log', label: 'Audit Log', section: 'Reports & Admin', visible: canAccessSettings },
  // Settings tabs flattened into the group (user 2026-06-10). Finance only
  // gets Chart of Account (the categories tab they can edit) + Base Rate
  // History; the other tabs are Principal-only.
  {
    label: 'Settings',
    section: 'Reports & Admin',
    visible: canAccessCategories,
    children: [
      { href: '/settings?tab=accounts', label: 'Chart of Account', tab: 'accounts', visible: canAccessCategories },
      // Departments management (2026-08-24): add + 转正 provision — Finance too.
      { href: '/settings?tab=departments', label: 'Departments', tab: 'departments', visible: canAccessCategories },
      { href: '/reports/base-rate', label: 'Base Rate History', visible: canAccessReports },
      { href: '/settings?tab=treasury', label: 'Treasury', tab: 'treasury', visible: canAccessSettings },
      { href: '/settings?tab=overdue', label: 'Overdue Config', tab: 'overdue', visible: canAccessSettings },
      { href: '/settings?tab=splits', label: 'Splits', tab: 'splits', visible: canAccessSettings },
      { href: '/settings?tab=directors', label: 'Directors', tab: 'directors', visible: canAccessSettings },
      { href: '/settings?tab=companies', label: 'Companies', tab: 'companies', visible: canAccessSettings },
      { href: '/settings?tab=banks', label: 'Bank Accounts', tab: 'banks', visible: canAccessSettings },
      { href: '/settings?tab=periods', label: 'Periods', tab: 'periods', visible: canAccessSettings },
      { href: '/settings?tab=simulator', label: 'Simulator', tab: 'simulator', visible: canAccessSettings },
    ],
  },
]

// ── Mobile bottom tab bar ────────────────────────────────────────────────
//
// A tab bar holds five slots and no more; the portal has ~50 destinations for
// a Principal. Four are promoted per role and the fifth is always More, which
// opens the full nav as a sheet. The four are chosen by what someone actually
// does on a phone: check a balance, clear approvals, look up a payment.

export interface TabDef {
  href: string
  label: string
  /** Icon key resolved by BottomTabBar's local icon map. */
  icon: 'home' | 'approve' | 'out' | 'in' | 'invoice' | 'payroll' | 'staff' | 'director' | 'billing' | 'report'
  /** Active on this path and its children unless `exact`. */
  exact?: boolean
  /** Never active on these prefixes (a sibling tab owns them). */
  notPaths?: string[]
  /** Show the pending-approvals count badge. */
  badge?: boolean
}

const TABS_BY_ROLE: Record<UserRole, TabDef[]> = {
  // The daily money loop. Invoice / Fund In-Out / reports / settings are all
  // one tap away under More.
  principal: [
    { href: '/dashboard', label: '总览', icon: 'home' },
    { href: '/approvals', label: '审批', icon: 'approve', badge: true },
    { href: '/payments', label: '付款', icon: 'out', notPaths: ['/payments/new'] },
    { href: '/receipts', label: '收款', icon: 'in' },
  ],
  // Finance cannot approve, so the freed slot goes to Invoice — the thing
  // they open next after posting a payment or receipt.
  finance: [
    { href: '/dashboard', label: '总览', icon: 'home' },
    { href: '/payments', label: '付款', icon: 'out', notPaths: ['/payments/new'] },
    { href: '/receipts', label: '收款', icon: 'in' },
    { href: '/statements', label: '发票', icon: 'invoice', exact: true },
  ],
  // HR never touches the treasury ledgers; their loop is payroll → staff →
  // director salary.
  hr: [
    { href: '/dashboard', label: '总览', icon: 'home' },
    { href: '/hr-costing/payroll', label: '薪资', icon: 'payroll' },
    { href: '/hr-costing/staff', label: '员工', icon: 'staff' },
    { href: '/director-salary', label: '董事', icon: 'director' },
  ],
  // Dept managers see one department. Billing and OPEX are the two pages they
  // live in; reports is their read-only rollup.
  dept_manager: [
    { href: '/dashboard', label: '总览', icon: 'home' },
    { href: '/my-billing', label: '账单', icon: 'billing' },
    { href: '/opex', label: 'OPEX', icon: 'staff' },
    { href: '/reports/income-statement', label: '报表', icon: 'report' },
  ],
}

export function tabsForRole(role: UserRole): TabDef[] {
  return TABS_BY_ROLE[role] ?? TABS_BY_ROLE.dept_manager
}

/** Path prefixes already reachable from the tab bar — the More sheet dims
 *  them so the sheet reads as "everything else" rather than a duplicate. */
export function tabHrefs(role: UserRole): Set<string> {
  return new Set(tabsForRole(role).map((t) => t.href))
}
