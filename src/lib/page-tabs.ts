/**
 * Which tabs open each portal page (2026-10-11, the HR revamp 8b — the user's
 * point 6: app gates go per tab). A page opens for whoever holds View on ANY
 * tab listed for it — a page in several views (Approvals, Dept Pool, the
 * reports) opens from each — and only ever ON TOP of the gate it already had:
 * every page asks `requirePage` as well as its own `requirePermission` /
 * `requireAction`, so a tab can close a page but never open one. The sidebars
 * ask the same (`opensPath`), so a link shows only where its page would open.
 *
 * Nobody's access moves on the day: an account's tabs are the ones its cells
 * and keys give (`userTabs`) until its template stores ticks, and
 * `page-tabs.test.ts` holds every login production has, and every template's
 * holders, to opening each page they open today.
 */

import type { Scope } from '@/lib/permission-matrix'
import { PERMISSION_TABS, TAB_ACTIONS, TAB_BY_ID, grantOf, hasBox, personTicks, tabsFromCells, type PersonBox } from '@/lib/permission-tabs'

const HR_COSTING = ['hr.hr_costing'] as const
const PAYROLL = ['hr.payroll'] as const
const DIRECTOR_SALARY = ['hr.director_salary'] as const
const DIRECTOR_POOL = ['hr.director_pool'] as const
const COMM_CAL = ['hr.comm_cal'] as const
const PEOPLE = ['hr.people'] as const
const PAYMENTS = ['fin.payments'] as const
const INVOICE = ['fin.invoice'] as const
const BILLING_ALLOCATOR = ['fin.billing_allocator'] as const
const STATEMENTS = ['fin.statements'] as const
const FUND_IN = ['fin.fund_in'] as const
const FUND_OUT = ['fin.fund_out'] as const
const INVOICE_FINANCING = ['fin.invoice_financing'] as const
const RECONCILIATION = ['fin.reconciliation'] as const
const JOURNAL = ['fin.journal_entries'] as const
// Company reports are Finance's and the Principal's; the department reports (P&L,
// Cash Flow, Receipt & Payment, Debtor Aging) are read company-wide too, and by a
// department for its own.
const REPORTS = ['fin.reports', 'pri.reports'] as const
const DEPT_REPORTS = ['fin.dept_reports', 'dept.reports', 'fin.reports', 'pri.reports'] as const
const DEPT_POOL = ['fin.dept_pool', 'pri.dept_pool', 'dept.dept_pool'] as const
// A contract is billing's (Invoice, Billing Allocator) and a department's own (My Billing · New Contract).
const CONTRACTS = ['fin.invoice', 'fin.billing_allocator', 'pri.my_billing', 'dept.my_billing'] as const

/**
 * Every page under `(portal)`, by its route as the folders spell it, and the
 * tabs any one of which opens it. `page-tabs.test.ts` holds this list to the
 * folders: a new page is either listed or in OPEN_PAGES.
 */
export const PAGE_TABS = {
  // ── HR view ──
  '/hr-costing': HR_COSTING,
  '/hr-costing/allocation': HR_COSTING,
  '/hr-costing/allocation/[period]': HR_COSTING,
  '/hr-costing/payroll': PAYROLL,
  '/hr-costing/payroll/[period]': PAYROLL,
  '/hr-costing/payroll/[period]/[staffId]/payslip': PAYROLL,
  '/hr-costing/payroll/[period]/import': PAYROLL,
  '/hr-costing/payment': ['hr.payment'],
  '/director-salary': DIRECTOR_SALARY,
  '/director-salary/[directorId]': DIRECTOR_SALARY,
  '/director-salary/[directorId]/print': DIRECTOR_SALARY,
  '/director-salary/import': DIRECTOR_SALARY,
  '/director-salary/payslip/[id]': DIRECTOR_SALARY,
  '/approvals/payroll-run/[id]/director-report': DIRECTOR_SALARY,
  '/director-pool': DIRECTOR_POOL,
  '/director-pool/import': DIRECTOR_POOL,
  // The Revenue index opens a sub-department's Comm Cal (or sets one up).
  '/revenue': ['hr.comm_cal', 'hr.sales_groups', 'hr.rules'],
  '/revenue/[sub]': COMM_CAL,
  '/revenue/[sub]/[period]': COMM_CAL,
  '/revenue/[sub]/[period]/import': COMM_CAL,
  '/revenue/[sub]/[period]/open-bill': COMM_CAL,
  '/revenue/[sub]/[period]/orders': COMM_CAL,
  '/revenue/[sub]/[period]/orders/[orderId]': COMM_CAL,
  '/revenue/[sub]/[period]/pay': COMM_CAL,
  '/revenue/[sub]/[period]/pay/[staffId]': COMM_CAL,
  '/revenue/[sub]/[period]/statement/[staffId]': COMM_CAL,
  '/revenue/[sub]/hierarchy': ['hr.sales_groups'],
  '/revenue/[sub]/rules': ['hr.rules'],
  // The Revenue Department's sub-departments are set up where Rules are.
  '/revenue/department': ['hr.rules'],
  // People Management holds the Permissions tab; a department reads its own people.
  '/team/people': ['hr.people', 'hr.permissions', 'dept.people'],
  '/team/people/[id]': ['hr.people', 'hr.permissions', 'dept.people'],
  '/team/people/[id]/edit': PEOPLE,
  '/team/people/new': PEOPLE,
  '/team/people/import': PEOPLE,
  '/team/accounts/[id]': ['hr.permissions'],
  '/team/hierarchy': ['hr.hierarchy', 'dept.people'],
  '/member-admin': ['hr.member_services'],
  // HR revamp round 2: People › Documentation.
  '/team/documentation': ['hr.documentation'],
  // Hiring (round 2, 2026-10-11): a request's own page opens from the same tab as the list.
  '/hiring/requests': ['hr.hiring_requests'],
  '/hiring/requests/[id]': ['hr.hiring_requests'],
  '/hiring/insights': ['hr.hiring_insights'],
  '/hiring/talent': ['hr.talent_bank'],
  '/hiring/talent/[id]': ['hr.talent_bank'],
  // HR › Attendance (2026-10-15): one tab a page.
  '/attendance/today': ['hr.att_today'],
  '/attendance/records': ['hr.att_records'],
  '/attendance/requests': ['hr.att_requests'],
  '/attendance/balances': ['hr.att_balances'],
  '/attendance/close': ['hr.att_close'],
  '/attendance/settings': ['hr.att_settings'],
  '/attendance/readiness': ['hr.att_ready'],
  // Changes: what it shows follows the reader's other boxes (each view's Audit Log).
  '/audit-log': ['hr.audit_log', 'fin.audit_log', 'pri.audit_log'],
  // Admin › Meeting Rooms (2026-10-11): every view books a room.
  '/admin/rooms': ['hr.meeting_rooms', 'fin.meeting_rooms', 'pri.meeting_rooms', 'dept.meeting_rooms'],
  // Admin › Guest Link (2026-10-11): HR's.
  '/admin/guest-link': ['hr.guest_link'],
  '/audit-log/access': ['pri.audit_log'],

  // ── Finance view ──
  // The queue's own, and whoever decides a domain's requests in it (Treasury, payroll runs, Director Salary).
  '/approvals': ['fin.approvals', 'pri.approvals', 'fin.payments', 'hr.payroll', 'hr.director_salary'],
  '/payments': PAYMENTS,
  // A payroll voucher opens from HR's Payment and Payroll pages too.
  '/payments/[id]': ['fin.payments', 'hr.payment', 'hr.payroll'],
  '/payments/[id]/edit': PAYMENTS,
  '/payments/new': PAYMENTS,
  '/payments/claim-requests': PAYMENTS,
  '/payments/dept-requests': PAYMENTS,
  '/payments/payroll-requests': PAYMENTS,
  '/invoice-pool': PAYMENTS,
  '/receipts': ['fin.receipt'],
  '/statements': INVOICE,
  '/invoices/[id]': INVOICE,
  '/billing/requests': ['fin.invoice', 'fin.billing_allocator'],
  '/billing/contracts/new': CONTRACTS,
  '/billing/contracts/[id]/edit': CONTRACTS,
  '/billing-allocator': BILLING_ALLOCATOR,
  '/billing-allocator/[id]': BILLING_ALLOCATOR,
  '/daily-bank': ['fin.daily_bank'],
  '/fund-in': FUND_IN,
  '/fund-in/[id]': FUND_IN,
  '/fund-in/[id]/edit': FUND_IN,
  '/fund-in/new': FUND_IN,
  '/fund-out': FUND_OUT,
  '/fund-out/[id]': FUND_OUT,
  '/fund-out/[id]/edit': FUND_OUT,
  '/fund-out/new': FUND_OUT,
  '/ba': INVOICE_FINANCING,
  '/ba/[id]': INVOICE_FINANCING,
  '/repayment-schedule': ['fin.repayment_schedule'],
  '/statements/[id]': STATEMENTS,
  '/statements/[id]/print': STATEMENTS,
  '/statements/monthly': STATEMENTS,
  // The reports index also lists HR Costing's.
  '/reports': ['fin.reports', 'pri.reports', 'fin.dept_reports', 'dept.reports', 'hr.hr_costing'],
  '/reports/balance-sheet': REPORTS,
  '/reports/base-rate': REPORTS,
  '/reports/company-statement': REPORTS,
  '/reports/fund-summary': REPORTS,
  '/reports/ledger': REPORTS,
  '/reports/loan-aging': REPORTS,
  '/reports/trial-balance': REPORTS,
  '/reports/cash-flow/layout': REPORTS,
  '/reports/monthly-pnl/layout': REPORTS,
  '/reports/claims': ['fin.reports', 'pri.reports', 'pri.claims', 'dept.claims'],
  '/reports/income-statement': DEPT_REPORTS,
  '/reports/cash-flow': DEPT_REPORTS,
  '/reports/receipt-payment': DEPT_REPORTS,
  '/reports/debtor-aging': DEPT_REPORTS,
  '/reports/monthly-pnl': DEPT_REPORTS,
  '/reports/monthly-cash-flow': DEPT_REPORTS,
  '/reports/monthly-receipt-payment': DEPT_REPORTS,
  '/reconciliation': RECONCILIATION,
  '/reconciliation/[sessionId]': RECONCILIATION,
  '/reconciliation/[sessionId]/report': RECONCILIATION,
  '/reconciliation/journal': JOURNAL,
  '/reconciliation/journal-entries': JOURNAL,
  '/reconciliation/journal-entries/[id]': JOURNAL,
  '/reconciliation/journal-entries/[id]/edit': JOURNAL,
  '/reconciliation/journal-entries/new': JOURNAL,
  '/claims': ['pri.claims', 'dept.claims', 'dept.my_claims'],
  '/dept-pool': DEPT_POOL,
  '/dept-pool/[slug]': DEPT_POOL,
  '/dept-pool/marketing': DEPT_POOL,
  '/dept-pool/submissions': DEPT_POOL,
  // A department contract is raised from Dept Pool, and by whoever raises contracts.
  '/dept-pool/contracts/new': [...DEPT_POOL, ...CONTRACTS],
  '/dept-pool/statements/[seg]': [...DEPT_POOL, ...REPORTS],
  '/venture-pool': ['fin.venture_pool', 'pri.venture_pool'],
  // Chart of Account and Departments are Finance's tabs of Settings; the rest the Principal's.
  '/settings': ['fin.chart_of_account', 'pri.settings'],

  // ── Principal and Department views ──
  '/opex': ['pri.opex', 'dept.opex'],
  '/my-billing': ['pri.my_billing', 'dept.my_billing'],
} as const satisfies Record<string, readonly string[]>

export type PageRoute = keyof typeof PAGE_TABS

/**
 * Pages no tab closes: the Overview, where every refused gate lands; a request's
 * own approval pages, opened by whoever it involves; the old addresses that
 * only send on to a page that asks for itself; and Admin › Change password,
 * every personal login's own (2026-10-12 — it asks for that itself), and its
 * neighbour Admin › My documents (2026-10-14, the same).
 */
export const OPEN_PAGES: ReadonlySet<string> = new Set([
  '/dashboard',
  '/admin/documents',
  '/admin/password',
  '/approvals/[id]',
  '/approvals/payroll-run/[id]',
  '/billing',
  '/reports/monthly-cash-flow/layout',
  '/revenue/products',
  '/team/people/invite',
  '/team/permissions',
  '/team/roles',
])

const ROUTES = Object.keys(PAGE_TABS) as PageRoute[]
const SPLIT = new Map(ROUTES.map(r => [r, r.split('/').filter(Boolean)]))

/** The registry's route for a path (`/fund-in/9f2c…/edit` → `/fund-in/[id]/edit`), the most specific one; null when none. */
export function routeOf(pathname: string): PageRoute | null {
  const parts = pathname.split('?')[0].split('/').filter(Boolean)
  let best: PageRoute | null = null
  let bestScore = -1
  for (const route of ROUTES) {
    const segs = SPLIT.get(route)!
    if (segs.length !== parts.length) continue
    let score = 0
    let ok = true
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].startsWith('[')) continue
      if (segs[i] !== parts[i]) { ok = false; break }
      score++
    }
    if (ok && score > bestScore) { best = route; bestScore = score }
  }
  return best
}

/** Does someone with these tabs open this page? An account with no tabs worked out (a value built before 8b) is not asked. */
export function opensPage(tabs: readonly string[] | undefined, route: PageRoute): boolean {
  if (!tabs) return true
  return PAGE_TABS[route].some(t => tabs.includes(`${t}.view`))
}

/** One box of theirs (`hr.permissions`, `edit`) — for a part of a page a tab of its own opens. Not asked without tabs. */
export function hasTab(tabs: readonly string[] | undefined, tabId: string, action: 'view' | 'create' | 'edit' | 'approve' = 'view'): boolean {
  return !tabs || tabs.includes(`${tabId}.${action}`)
}

/** opensPage for a link: its path's page, or any of the tabs it names itself. A path no page is listed for is not asked. */
export function opensPath(tabs: readonly string[] | undefined, href: string, own?: readonly string[]): boolean {
  if (!tabs) return true
  if (own) return own.some(t => tabs.includes(`${t}.view`))
  const route = routeOf(href)
  return route === null || opensPage(tabs, route)
}

/** What `current_tabs()` hands back for a templated account; null for one with no template. */
export interface StoredTabs {
  ticks: string[] | null
  boxes: PersonBox[]
  /** Cells of their own from before tabs, and no boxes yet. */
  cells: boolean
}

/**
 * An account's tabs, as its pages and sidebar ask them:
 * - its template's stored ticks, with their own boxes over them;
 * - else what its cells and keys give (`tabsFromCells`) — every untemplated
 *   account, a template with no ticks stored yet (their own boxes still laid
 *   over it, so a box held back from a tab whose cells another shares is), and
 *   somebody whose own cells predate tabs.
 */
export function userTabs(stored: StoredTabs | null, actions: Record<string, Scope> | undefined, keys: readonly string[]): string[] {
  const derived = () => tabsFromCells(new Map(Object.entries(actions ?? {})), new Set(keys))
  if (!stored || (stored.boxes.length === 0 && stored.cells)) return [...derived()].sort()
  const base = stored.ticks ? new Set(stored.ticks) : derived()
  return [...personTicks(base, stored.boxes)].sort()
}

/** Every box there is, `view.tab.action`: each tab's View and the actions it has. */
const ALL_BOXES: readonly string[] = PERMISSION_TABS.flatMap(t => TAB_ACTIONS.filter(a => hasBox(t, a)).map(a => grantOf(t.id, a)))

/**
 * The boxes somebody unticked for them (2026-10-11) — what a page's writes
 * (`actionsOnPage`) and the Revenue app's pages (`lib/member/app-pages.ts`)
 * close by. A template saved on tabs closes every box its ticks, with their
 * own boxes over them, leave out; over a template not saved on tabs yet, only
 * the boxes their own were unticked (and the rest of a tab whose View was).
 * Ticks worked out from cells close nothing: they can leave a box unticked
 * whose cells the account still holds (Finance's Void, without Approve), and
 * closing by them would take it away.
 */
export function closedBoxes(stored: StoredTabs | null): string[] {
  if (!stored || (stored.boxes.length === 0 && stored.cells)) return []
  if (stored.ticks) {
    const ticked: ReadonlySet<string> = personTicks(new Set(stored.ticks), stored.boxes)
    return ALL_BOXES.filter(b => !ticked.has(b))
  }
  const heldBack = new Set<string>(stored.boxes.filter(b => !b.granted).map(b => grantOf(b.tab, b.action)))
  return ALL_BOXES.filter(b => heldBack.has(b) || heldBack.has(`${b.slice(0, b.lastIndexOf('.'))}.view`))
}

/** The actions a write asks for — what a tab's Create, Edit and Approve stand for. View and Export never narrow. */
const WRITES = new Set(['create', 'edit', 'approve', 'void', 'manage'])

/**
 * What they may DO on one page (2026-10-11, the user: writes "separate by
 * tab"): a write a tab of this page stands for counts only while one of those
 * tabs' boxes for it is still open (`closedBoxes`) — Receipt's Create creates a
 * receipt, Payments' does not. A write none of the page's tabs stands for, and
 * every View and Export, stays as held. Only ever narrows.
 */
export function actionsOnPage(actions: Readonly<Record<string, Scope>>, closed: readonly string[], route: PageRoute): Record<string, Scope> {
  const shut = new Set(closed)
  const out: Record<string, Scope> = {}
  for (const [cell, scope] of Object.entries(actions)) {
    const action = cell.slice(cell.indexOf('.') + 1)
    if (WRITES.has(action)) {
      const boxes = PAGE_TABS[route].flatMap(id => {
        const tab = TAB_BY_ID.get(id)
        return tab ? TAB_ACTIONS.filter(a => (tab.opens[a] ?? []).includes(cell as never)).map(a => `${id}.${a}`) : []
      })
      if (boxes.length > 0 && boxes.every(b => shut.has(b))) continue
    }
    out[cell] = scope
  }
  return out
}

/**
 * A write whose buttons are on several pages (2026-10-11, plan C — Payments' detail
 * page is Finance's and HR's Payment tab's too): what it may do from ANY of them.
 * Each page narrows on its own (`actionsOnPage`); a write one of them keeps counts.
 */
export function actionsOnPages(actions: Readonly<Record<string, Scope>>, closed: readonly string[], routes: readonly PageRoute[]): Record<string, Scope> {
  const out: Record<string, Scope> = {}
  for (const route of routes) Object.assign(out, actionsOnPage(actions, closed, route))
  return out
}

/** `current_tabs()`'s answer, read defensively (it postdates database.types.ts). */
export function storedTabsFrom(raw: unknown): StoredTabs | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { ticks?: unknown; boxes?: unknown; cells?: unknown }
  const ticks = Array.isArray(r.ticks) ? r.ticks.filter((t): t is string => typeof t === 'string') : null
  const boxes = Array.isArray(r.boxes)
    ? r.boxes.flatMap(b => {
        const x = b as { tab?: unknown; action?: unknown; granted?: unknown }
        return typeof x.tab === 'string' && typeof x.action === 'string' && typeof x.granted === 'boolean'
          ? [{ tab: x.tab, action: x.action as PersonBox['action'], granted: x.granted }]
          : []
      })
    : []
  return { ticks: ticks && ticks.length ? ticks : null, boxes, cells: r.cells === true }
}
