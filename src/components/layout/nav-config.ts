// Shared navigation model for the portal shell.
//
// Extracted from Sidebar.tsx (2026-08-31) when the mobile shell moved from a
// hamburger drawer to a bottom tab bar. Three consumers now read this same
// list — the desktop Sidebar, the mobile BottomTabBar (which promotes four
// entries per role), and the MoreSheet (which renders everything else) — so
// the definition has to live in one place or the three drift apart.

import type { UserRole } from '@/types'
import { can, type PermissionHolder } from '@/lib/permissions'
import { PRODUCT_LIST_PATH, REVENUE_DEPARTMENT_PATH, revenuePath } from '@/lib/revenue'
import {
  canAccessAuditLog,
  canAccessCategories,
  canAccessClaims,
  canAccessDeptPool,
  canAccessDeptReports,
  canAccessDirectorPool,
  canAccessDirectorSalary,
  canAccessMyBilling,
  canAccessOpex,
  canAccessProductList,
  canAccessReconciliation,
  canAccessReports,
  canAccessRevenue,
  canAccessSettings,
  canAccessTeam,
  canAccessTreasury,
  canAccessVenturePool,
  canApprove,
} from '@/lib/roles'

/**
 * Who the nav is being built for.
 *
 * Permissions decide what shows; `role` survives only for the two entries that
 * are about somebody having ONE department of their own, which no permission
 * expresses.
 */
export type NavViewer = PermissionHolder & { role: UserRole }

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
  // Also active on these path prefixes — pages reached from this entry's
  // in-page toggle (P&L ↔ Monthly P&L) rather than from the sidebar.
  alsoPaths?: string[]
  visible: (viewer: NavViewer) => boolean
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
  const aliasMatch = item.alsoPaths?.some((p) => pathname === p || pathname.startsWith(p + '/')) ?? false
  if (!pathMatch && !aliasMatch) return false
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
  /** A group's own landing page, when it has one.
   *
   *  Most groups are pure headers — "HR Costing" is a label over four links and
   *  nothing else. A sub-department is not: `/revenue/fair` is a real page, so
   *  its header is a link and only the chevron collapses it. One click still
   *  lands on the Commission Calculation it always did. */
  href?: string
  visible: (viewer: NavViewer) => boolean
  /** `NavEntry`, not `NavItem` — a group may hold a group. The Revenue
   *  Department runs three levels: Revenue › Fair › Comm Cal. */
  children: NavEntry[]
}

export type NavEntry = NavItem | NavGroup

export function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

/** Is anything inside this group the page being read? Recurses, so a Revenue
 *  group knows it is active when Fair's Rules page is open two levels down. */
export function groupActive(
  group: NavGroup,
  pathname: string,
  tabParam: string | null,
  basisParam: string | null,
): boolean {
  return group.children.some((child) =>
    isGroup(child)
      ? groupActive(child, pathname, tabParam, basisParam)
      : itemActive(child, pathname, tabParam, basisParam),
  )
}

const isHR = (v: NavViewer) => v.role === 'hr'
const isHRorPrincipal = (v: NavViewer) => canAccessTeam(v)

/**
 * The parts of the nav that cannot be written down ahead of time.
 *
 * Everything else here is a constant, but the Revenue group's children are
 * rows in `comm_sub_departments` — Fair today, IR when it is created — so the
 * portal layout reads them and hands them in. An empty list is normal (before
 * the department is set up, and for every role that cannot see it).
 */
export interface NavData {
  revenueSubDepts: Array<{ slug: string; name: string }>
}

export const emptyNavData: NavData = { revenueSubDepts: [] }

// Layout per user spec 2026-06-10 (re-grouped from the original phase layout).
export function buildNavEntries(data: NavData): NavEntry[] {
  return [
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
        // Commission used to sit here. It moved to the Revenue group under
        // Departments on 2026-09-01 (user: "它其实是 Revenue Department") — it is
        // a department with its own teams, not one of HR's monthly chores. The
        // run still feeds hr_monthly_payroll.commission_amount either way.
        { href: '/hr-costing/payment', label: 'Payment', visible: isHRorPrincipal },
        // Staff left this group on 2026-09-01 — it is now People > People
        // Management, because the directory answers "who works here", not
        // "what did they cost this month".
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
    { href: '/opex', label: 'OPEX', section: 'Departments', visible: canAccessOpex },
    // Dept-manager billing workbench (2026-08-20): own-segment invoices with
    // 回款 status, 开单 (draft-only), contract tracking with expiry.
    { href: '/my-billing', label: 'My Billing', section: 'Departments', visible: canAccessMyBilling },
    // Marketing dept_manager can create service contracts for their dept
    // (mig 207 RLS). The page self-gates on Marketing dept — other dept_managers
    // clicking this would hit notFound().
    { href: '/billing/contracts/new', label: 'New Contract', section: 'Departments', visible: canAccessMyBilling },
    {
      label: 'Director',
      section: 'Departments',
      // Group shows when any child is visible: Principal + HR (Director Pool v2
      // dropped Finance's access, so Finance no longer sees the group at all).
      visible: (v) => canAccessDirectorSalary(v) || canAccessDirectorPool(v),
      children: [
        { href: '/director-salary', label: 'Director Salary', visible: canAccessDirectorSalary },
        { href: '/director-pool', label: 'Director Pool', visible: canAccessDirectorPool },
      ],
    },
    // Revenue Department — the commission-paid sales teams (moved out of HR
    // Costing 2026-09-01). Its children are SUB-DEPARTMENTS, read from the
    // database: Fair, the roadshow team, is the first and more follow.
    //
    // Each sub-department is itself a group of three, because each one
    // calculates differently and the three views are three different questions
    // about it. They used to be a tab rail on the page; the user moved them
    // here on 2026-09-01 ("这个其实是进去 subtab 的选择,而不是在这个里面") —
    // choosing which view of Fair to open is navigation, and navigation lives
    // in the sidebar. Fair itself stays a link, so one click still lands on
    // Commission Calculation the way it did before.
    //
    // The Product List and Venues are the two department-wide children:
    // `comm_products`, `comm_venues` and `comm_organisers` carry no scheme, so
    // one of each serves every sub-department. What a product costs stays with
    // the Principal; the venue register is HR's, because naming the organiser
    // of a fair is part of reading the month.
    {
      label: 'Revenue',
      section: 'Departments',
      visible: canAccessRevenue,
      children: [
        ...data.revenueSubDepts.map((s) => ({
          label: s.name,
          href: revenuePath(s.slug),
          visible: canAccessRevenue,
          children: [
            {
              href: revenuePath(s.slug),
              // "Comm Cal", not "Commission Calculation" (user 2026-09-01):
              // three levels in, the full name is wider than the 220px rail and
              // ellipsised to "Commission Calcu…", which reads worse than the
              // short form. The page it opens still says Commission Calculation
              // in full.
              label: 'Comm Cal',
              // A month opened from the calculation list — /revenue/fair/
              // 2026-08-01 and the import, open-bill and statement pages under
              // it — is still Calculation, so no `exact` here. Only the two
              // siblings own a subtree of their own.
              notPaths: [revenuePath(s.slug, 'hierarchy'), revenuePath(s.slug, 'rules')],
              visible: canAccessRevenue,
            },
            { href: revenuePath(s.slug, 'hierarchy'), label: 'Staff Hierarchy', visible: canAccessRevenue },
            { href: revenuePath(s.slug, 'rules'), label: 'Rules', visible: canAccessRevenue },
          ],
        })),
        { href: PRODUCT_LIST_PATH, label: 'Product List', visible: canAccessProductList },
        // Venues went on 2026-09-27: the ERP names every bill's fair — venue,
        // organiser and days — so nothing about a fair is typed here any more.
        // The department as a whole (2026-09-30): its mode, cost center or
        // centralized — later its pool.
        { href: REVENUE_DEPARTMENT_PATH, label: 'Department', visible: canAccessRevenue },
      ],
    },
    { href: '/claims', label: 'Claims', section: 'Departments', visible: canAccessClaims },

    // ── People ──
    // Who works here, under which title, reporting to whom, with which account.
    // A category of its own since 2026-09-01, sitting one below Departments
    // (user: "它属于另外一个 category, 就好像 departments 和 daily operations
    // 这样"). It spent a day as a "Team" group inside Departments, which filed
    // the roster alongside Marketing and Revenue — but people are not one more
    // department, they are who every department is made of.
    //
    // Flat, not a group: four pages, one section header, no chevron to open
    // first. The sidebar is also the only way between them — the tab rail that
    // used to sit on all of them came out with this move, the same way the
    // Revenue sub-department views did.
    //
    // Roles and Permissions were one page ("Role & Permission") until
    // 2026-09-03, when the user asked for them apart: Roles is what a title IS
    // (its department), Permissions is what it may DO. The ladder (Levels)
    // sat on Roles for two days and moved to Hierarchy on 2026-09-05, as a
    // second tab beside the chart that obeys it.
    { href: '/team/people', label: 'People Management', section: 'People', visible: isHRorPrincipal },
    { href: '/member-admin', label: 'Member Services', section: 'People', visible: v => v.role === 'principal' || can(v, 'member_requests_manage') || can(v, 'member_memos_manage') },
    { href: '/team/hierarchy', label: 'Hierarchy', section: 'People', visible: isHRorPrincipal },
    { href: '/team/roles', label: 'Roles', section: 'People', visible: isHRorPrincipal },
    { href: '/team/permissions', label: 'Permissions', section: 'People', visible: isHRorPrincipal },

    // ── Reports & Admin ──
    { href: '/reports/ledger', label: 'General Ledger', section: 'Reports & Admin', visible: canAccessReports },
    {
      label: 'Reports',
      section: 'Reports & Admin',
      // dept_manager sees the group for their own-department reports (P&L / Cash
      // Flow / Debtor Aging); the whole-company reports below stay principal/finance.
      visible: canAccessDeptReports,
      children: [
        // Each statement page carries a 单月 ｜ 逐月 toggle to its monthly
        // matrix twin (ReportViewToggle, 2026-09-15), so the Monthly * entries
        // no longer need their own sidebar rows.
        { href: '/reports/income-statement', label: 'P&L', alsoPaths: ['/reports/monthly-pnl'], visible: canAccessDeptReports },
        { href: '/reports/cash-flow', label: 'Cash Flow', alsoPaths: ['/reports/monthly-cash-flow'], visible: canAccessDeptReports },
        { href: '/reports/receipt-payment', label: 'Receipt & Payment', alsoPaths: ['/reports/monthly-receipt-payment'], visible: canAccessDeptReports },
        { href: '/reports/balance-sheet', label: 'Balance Sheet', visible: canAccessReports },
        { href: '/reports/trial-balance', label: 'Trial Balance', visible: canAccessReports },
        // Fund Summary + Claims Report dropped from the menu (user 2026-09-15
        // "remove 掉"); routes still exist for direct links.
        { href: '/reports/debtor-aging', label: 'Debtor Aging', visible: canAccessDeptReports },
        { href: '/reports/loan-aging', label: 'Loan Aging', visible: canAccessReports },
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
}

/** Every nav destination's path, query stripped — the portal's "tabs".
 *  Role visibility is irrelevant here: a path is a destination no matter who
 *  can see the link. lib/selection-store.ts reads this to tell a tab switch
 *  (forget the row selection) from a drill-down into a detail page (keep it).
 *
 *  Takes the same `NavData` as `buildNavEntries` (2026-09-01) because one group
 *  is now data-driven: `/revenue/fair` is as much a tab as `/payments` is, and
 *  a static list could not know its name. Pass `emptyNavData` where only the
 *  constant destinations matter. */
export function navRootPaths(data: NavData): ReadonlySet<string> {
  return new Set(navHrefs(buildNavEntries(data)).map((href) => href.split('?')[0]))
}

/** Every href in the tree, at any depth — a group's own landing page included.
 *  Recursive since 2026-09-01: a sub-department's three views are nav entries
 *  two levels down, and each of them is a destination in its own right. */
function navHrefs(entries: NavEntry[]): string[] {
  return entries.flatMap((entry) =>
    isGroup(entry)
      ? [...(entry.href ? [entry.href] : []), ...navHrefs(entry.children)]
      : [entry.href],
  )
}

/** Destination path → the label the sidebar gives it. The activity log reads
 *  this to turn a logged pathname back into the name somebody clicked. Takes
 *  `NavData` for the same reason navRootPaths does. */
export function navLabelByPath(data: NavData): ReadonlyMap<string, string> {
  return new Map(
    // First writer wins: /settings appears once per tab and the group label is
    // the same for all of them, and a sub-department shares its href with its
    // own Comm Cal child — "Revenue · Fair" is the better of those two.
    navLabelPairs(buildNavEntries(data), []).reverse(),
  )
}

/** `[path, label]` for every destination, the label being the chain of names
 *  down to it — "Revenue · Fair · Rules". Recursive since the nav runs three
 *  levels; a group contributes its own href too, when it has one. */
function navLabelPairs(
  entries: NavEntry[],
  trail: string[],
): Array<readonly [string, string]> {
  return entries.flatMap((entry) => {
    const chain = [...trail, entry.label]
    const name = chain.join(' · ')
    return isGroup(entry)
      ? [
          ...(entry.href ? [[entry.href.split('?')[0], name] as const] : []),
          ...navLabelPairs(entry.children, chain),
        ]
      : [[entry.href.split('?')[0], name] as const]
  })
}

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
  revenue_member: [
    { href: '/member', label: 'My account', icon: 'home' },
  ],
  // The daily money loop. Invoice / Fund In-Out / reports / settings are all
  // one tap away under More.
  principal: [
    { href: '/dashboard', label: 'Overview', icon: 'home' },
    { href: '/approvals', label: 'Approvals', icon: 'approve', badge: true },
    { href: '/payments', label: 'Payments', icon: 'out', notPaths: ['/payments/new'] },
    { href: '/receipts', label: 'Receipts', icon: 'in' },
  ],
  // Finance cannot approve, so the freed slot goes to Invoice — the thing
  // they open next after posting a payment or receipt.
  finance: [
    { href: '/dashboard', label: 'Overview', icon: 'home' },
    { href: '/payments', label: 'Payments', icon: 'out', notPaths: ['/payments/new'] },
    { href: '/receipts', label: 'Receipts', icon: 'in' },
    { href: '/statements', label: 'Invoices', icon: 'invoice', exact: true },
  ],
  // HR never touches the treasury ledgers; their loop is payroll → staff →
  // director salary.
  hr: [
    { href: '/dashboard', label: '总览', icon: 'home' },
    { href: '/hr-costing/payroll', label: '薪资', icon: 'payroll' },
    { href: '/team/people', label: '员工', icon: 'staff' },
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

/** The fifth tab's label. Finance's and the Principal's bar reads in English
 *  (2026-10-07, user: "下面还是华语字体"); HR's and a department manager's as it was. */
export function moreTabLabel(role: UserRole): string {
  return role === 'finance' || role === 'principal' ? 'More' : '更多'
}

/** Path prefixes already reachable from the tab bar — the More sheet dims
 *  them so the sheet reads as "everything else" rather than a duplicate. */
export function tabHrefs(role: UserRole): Set<string> {
  return new Set(tabsForRole(role).map((t) => t.href))
}
