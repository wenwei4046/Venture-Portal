// The Finance view (2026-10-09): the user's Claude Design handoff
// (`.design/finance-revamp`) redesigns every Finance page on the sheet, and
// its global rules — the blue "wait" tone, the navy table band without zebra
// rows, range filters, the phone's cream top bar and peach tab pill, an edge
// swipe back — apply to Finance's pages only (user: 只套 Finance 的页面).
// "Finance's pages" are the routes below as Finance or the Principal sees
// them; HR's and a department manager's pages keep the sheet as it was, and a
// route several roles share (the Overview, Dept Pool, Reports, Settings) only
// counts for those two roles.

import type { UserRole } from '@/types'

/** Route prefixes of the Finance view, in sidebar order. */
export const FINANCE_VIEW_PREFIXES = [
  '/dashboard',
  '/approvals',
  '/payments',
  '/receipts',
  '/statements',
  // An invoice's own page (2026-10-09).
  '/invoices',
  '/billing',
  '/billing-allocator',
  '/daily-bank',
  '/fund-in',
  '/fund-out',
  '/ba',
  '/repayment-schedule',
  '/dept-pool',
  '/venture-pool',
  '/reports',
  '/reconciliation',
  '/settings',
] as const

const FINANCE_ROLES: ReadonlySet<string> = new Set(['finance', 'principal'])

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/** Is this page, for this role, on the Finance view? */
export function isFinanceView(pathname: string | null | undefined, role: UserRole | string): boolean {
  if (!pathname || !FINANCE_ROLES.has(role)) return false
  return FINANCE_VIEW_PREFIXES.some((p) => under(pathname, p))
}

/** Who the shell is drawn for: the kind it is drawn as, and the account's keys. */
export type ShellViewer = { role: UserRole | string; permissions?: readonly string[] } | null | undefined

/**
 * The Principal's own view (2026-10-17 — the user: "revamp the principle
 * desktop view, take the same totally view with finance. no need show hr,
 * cause can switch view to hr"): the Principal kind, in its own view, on an
 * account that may switch views — HR's pages are one switch away. One that
 * may not (the template *Full access · no view switching*) keeps the portal's
 * own sidebar, which still lists them.
 */
export function isPrincipalView(viewer: ShellViewer): boolean {
  return !!viewer && viewer.role === 'principal' && (viewer.permissions ?? []).includes('view_switch')
}

/**
 * Does the portal wear Finance's own shell (2026-10-14, the Finance revamp v2 —
 * `.design/fin-r2/handoff`): HR's square sidebar and greeting bar with
 * Finance's categories. The finance kind (finance@, a Finance template's
 * holder), the Principal's Finance lens — and since 2026-10-17 the
 * Principal's own view (`isPrincipalView`), with its own few rows added.
 */
export function isFinanceShell(viewer: ShellViewer): boolean {
  return !!viewer && (viewer.role === 'finance' || isPrincipalView(viewer))
}

/**
 * The account as it is drawn: on Finance's view (its shell, its Overview) —
 * which view a page is drawn in, never what it may do (the cells decide that).
 */
export function onFinanceView(viewer: ShellViewer): boolean {
  return isFinanceShell(viewer)
}

/** The name the views greet with (the prototypes' `acct.first`): its first word. */
export function firstName(name: string | null | undefined, fallback = ''): string {
  const n = (name ?? '').trim()
  return n ? n.split(/\s+/)[0] : fallback
}

// A row's own page under a list: `/payments/<id>`, `/fund-in/<id>`, … — what
// "← Back to …" returns from with the list's scroll put back, and what an
// edge swipe on a phone leaves. The second segment names the row unless it is
// one of the list's own sub-pages (a form, an export, a report).
const DETAIL_ROOTS: Record<string, readonly string[]> = {
  '/payments': ['new', 'export', 'voucher-doc', 'payroll-requests'],
  '/receipts': ['new', 'export'],
  '/fund-in': ['new'],
  '/fund-out': ['new'],
  '/statements': ['monthly', 'export'],
  '/invoices': [],
  '/approvals': [],
  '/billing-allocator': [],
  '/ba': [],
  '/dept-pool': ['submissions'],
  '/reconciliation': ['journal', 'journal-entries'],
}
const JOURNAL_ROOT = '/reconciliation/journal-entries'

export function isFinanceDetailRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (under(pathname, JOURNAL_ROOT)) {
    const id = pathname.slice(JOURNAL_ROOT.length + 1).split('/')[0]
    return !!id && id !== 'new'
  }
  for (const [root, reserved] of Object.entries(DETAIL_ROOTS)) {
    if (!under(pathname, root) || pathname === root) continue
    const rest = pathname.slice(root.length + 1).split('/')
    const id = rest[0]
    if (!id || reserved.includes(id)) return false
    // A department's pool page is a detail; its own sub-pages are not.
    if (root === '/dept-pool' && rest.length > 1) return false
    return true
  }
  return false
}

// What the phone's top bar calls the page — the sidebar's word for it; a
// row's page is named by its list.
const TITLES: Array<[prefix: string, title: string, exact?: boolean]> = [
  ['/dashboard', 'Overview'],
  ['/approvals', 'Approvals'],
  ['/payments', 'Payments'],
  ['/receipts', 'Receipt'],
  ['/statements', 'Invoice', true],
  ['/statements/monthly', 'Statements'],
  ['/statements', 'Statements'],
  ['/invoices', 'Invoice'],
  ['/billing-allocator', 'Billing Allocator'],
  ['/billing', 'Invoice'],
  ['/daily-bank', 'Daily Bank'],
  ['/fund-in', 'Fund IN'],
  ['/fund-out', 'Fund OUT'],
  ['/ba', 'Invoice Financing'],
  ['/repayment-schedule', 'Repayment Schedule'],
  ['/dept-pool', 'Dept Pool'],
  ['/venture-pool', 'Venture Pool'],
  ['/reports/ledger', 'General Ledger'],
  ['/reports', 'Reports'],
  ['/reconciliation/journal-entries', 'Journal Entries'],
  ['/reconciliation', 'Reconciliation'],
  ['/settings', 'Settings'],
]

export function financePageTitle(pathname: string | null | undefined): string {
  if (!pathname) return ''
  for (const [prefix, title, exact] of TITLES) {
    if (exact ? pathname === prefix : under(pathname, prefix)) return title
  }
  return ''
}
