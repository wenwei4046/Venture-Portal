/**
 * Permissions by VIEW › TAB › action (2026-10-11 — the HR revamp's People ›
 * Permissions, user's choice B). A title's template ticks, in each view, which
 * tabs its holders may View, Create, Edit or Approve; one person may be raised
 * or lowered on a box. Four actions only — a function's Export rides with its
 * View, Void with its Approve, Manage with the Edit of the tab where it is
 * done. No reach to pick: the Department view reaches the holder's own
 * department, the Revenue app their own records, every other view the whole
 * company — save where a tab says otherwise (My claims, the CRM's team view,
 * the Product List), because today's cells need it.
 *
 * The database still asks for FUNCTION cells (`current_actions()`, every
 * guard since PR3 — point 6 of the user's choice): a template's cells are
 * DERIVED from its ticks (`cellsFromTabs`), and a template is moved onto tabs
 * from its cells by the opposite rule (`tabsFromCells`), which never ticks a
 * box whose cells it does not hold — so moving loses nothing, and what a save
 * adds is only the user's own merges (export with view, void with approve,
 * manage with edit), listed by `gainsOf`.
 *
 * Pure, and the twin of the seed in mig 20261011010000.
 */

import type { FunctionKey } from '@/lib/permission-actions'
import {
  MEMBER_APP_KEYS,
  effectiveGrants,
  keyHeldCode,
  openedKeys,
  type Action,
  type CellKey,
  type Grants,
  type HeldCode,
  type PersonCells,
  type Scope,
  type SensitiveField,
} from '@/lib/permission-matrix'

export type TabView = 'hr' | 'fin' | 'pri' | 'dept' | 'rev' | 'lead'
export type TabAction = 'view' | 'create' | 'edit' | 'approve'
/** `fn.action` — a cell of the function matrix. */
export type FnAction = `${FunctionKey}.${Action}`

export const TAB_ACTIONS: readonly TabAction[] = ['view', 'create', 'edit', 'approve']
export const TAB_ACTION_LABEL: Readonly<Record<TabAction, string>> = { view: 'View', create: 'Create', edit: 'Edit', approve: 'Approve' }

export const TAB_VIEWS: ReadonlyArray<{ id: TabView; label: string; reach: Scope }> = [
  { id: 'hr', label: 'HR view', reach: 'all' },
  { id: 'fin', label: 'Finance view', reach: 'all' },
  { id: 'pri', label: 'Principal view', reach: 'all' },
  { id: 'dept', label: 'Department view', reach: 'dept' },
  { id: 'rev', label: 'Revenue app', reach: 'own' },
  // Lead View (2026-10-16): Customer Service's inbox — every brand's enquiries are the company's.
  { id: 'lead', label: 'Lead View', reach: 'all' },
]

export interface PermissionTab {
  /** `hr.payroll` — the view, a dot, the tab. */
  id: string
  view: TabView
  label: string
  /** How far its cells reach — the view's, unless the tab says otherwise. */
  reach: Scope
  /** The module keys its page opens on today (any) — the page before tabs, for the move. Empty = every signed-in account. */
  keys: readonly string[]
  /** What each box stands for underneath: the cells it opens. The first is the box's own; the rest ride with it. */
  opens: Readonly<Partial<Record<TabAction, readonly FnAction[]>>>
  /** One page listed in several views (Approvals, Reports …): a template is put in the views it lives in, not all of them. */
  page?: string
  /** Its page opens with its own View cell, not a module key (the CRM's Control panel: CRM · View at All) — never "not open yet". */
  cellGated?: boolean
}

type Opens = PermissionTab['opens']

// The function families, box by box (the user's merges: export with view, void with approve, manage with edit).
const OVERVIEW: Opens = { view: ['dashboard.view'] }
const TREASURY: Opens = { view: ['treasury.view', 'treasury.export'], create: ['treasury.create'], edit: ['treasury.edit'], approve: ['treasury.approve', 'treasury.void'] }
const BILLING: Opens = { view: ['billing.view', 'billing.export'], create: ['billing.create'], edit: ['billing.edit'], approve: ['billing.void'] }
const HR_COSTING: Opens = { view: ['hr_costing.view', 'hr_costing.export'], create: ['hr_costing.create'], edit: ['hr_costing.edit'], approve: ['hr_costing.approve'] }
const REVENUE: Opens = { view: ['revenue.view', 'revenue.export'], create: ['revenue.create'], edit: ['revenue.edit'], approve: ['revenue.approve'] }
const RECONCILIATION: Opens = { view: ['reconciliation.view'], create: ['reconciliation.create'], edit: ['reconciliation.edit'], approve: ['reconciliation.approve'] }
const APPROVALS: Opens = { view: ['approvals.view'], approve: ['approvals.approve'] }
const DEPT_POOL: Opens = { view: ['dept_pool.view', 'dept_pool.export'] }
const VENTURE_POOL: Opens = { view: ['venture_pool.view', 'venture_pool.export'], create: ['venture_pool.create'], edit: ['venture_pool.edit'] }
const REPORTS: Opens = { view: ['reports.view', 'reports.export'] }
const DEPT_REPORTS: Opens = { view: ['dept_reports.view', 'dept_reports.export'] }
const OPEX: Opens = { view: ['opex.view', 'opex.export'] }
const MY_BILLING: Opens = { view: ['my_billing.view'], create: ['my_billing.create'] }
const REVENUE_APP: Opens = { view: ['revenue_app.view'] }
const REVENUE_APP_SENDS: Opens = { view: ['revenue_app.view'], create: ['revenue_app.create'] }
// HR revamp round 2 (mig 20261011060000).
const HIRING: Opens = { view: ['hiring.view'], create: ['hiring.create'], edit: ['hiring.edit'], approve: ['hiring.approve'] }
const ROOMS: Opens = { view: ['rooms.view'], create: ['rooms.create'], edit: ['rooms.edit'] }
const ROOMS_KEYS = ['meeting_rooms', 'meeting_rooms_manage']
const LEADS_KEYS = ['leads']

// The Overview is the company's in every view (the dashboard has no narrower reach).
const tab = (view: TabView, id: string, label: string, keys: readonly string[], opens: Opens, reach?: Scope): PermissionTab => ({
  id: `${view}.${id}`, view, label, reach: reach ?? (id === 'overview' ? 'all' : TAB_VIEWS.find(v => v.id === view)!.reach), keys, opens,
})

/** The same page in several views. */
const shared = (page: string, t: PermissionTab): PermissionTab => ({ ...t, page })

const TREASURY_KEYS = ['treasury']
const AUDIT_CHANGES_KEYS = ['audit_log', 'treasury', 'reports', 'approvals', 'billing', 'venture_pool', 'categories', 'reconciliation', 'settings', 'hr_costing', 'payroll_payouts', 'claims_approve', 'documentation']

/**
 * Every view's tabs, in the order its sidebar lists them — the handoff's
 * (`PERM_VIEWS`), with the pages it left out (the user's point 1: the
 * Department view, the Product List, the CRM, and what each view already
 * opens today).
 */
export const PERMISSION_TABS: readonly PermissionTab[] = [
  // ── HR view ──
  tab('hr', 'overview', 'Overview', [], OVERVIEW),
  tab('hr', 'hr_costing', 'HR Costing', ['hr_costing'], HR_COSTING),
  tab('hr', 'payroll', 'Payroll', ['hr_costing'], HR_COSTING),
  tab('hr', 'payment', 'Payment', ['hr_costing'], HR_COSTING),
  tab('hr', 'director_salary', 'Director Salary', ['director_salary'], { view: ['director_salary.view'], edit: ['director_salary.edit'], approve: ['director_salary.approve'] }),
  tab('hr', 'director_pool', 'Director Pool', ['director_pool'], { view: ['director_pool.view'], edit: ['director_pool.edit'] }),
  tab('hr', 'comm_cal', 'Comm Cal', ['revenue'], REVENUE),
  tab('hr', 'sales_groups', 'Sales Groups', ['revenue'], REVENUE),
  // Rules is where a sub-department and its capacity are managed.
  tab('hr', 'rules', 'Rules', ['revenue'], { ...REVENUE, edit: ['revenue.edit', 'revenue.manage'] }),
  tab('hr', 'people', 'People Management', ['team', 'team_directory'], { view: ['team.view'], create: ['team.create'], edit: ['team.edit'] }),
  // Logins and who may do what — never implied by People Management (an editor of people is not a granter of rights).
  tab('hr', 'permissions', 'Permissions', ['team'], { view: ['accounts.view'], create: ['accounts.create'], edit: ['accounts.manage'] }),
  // Titles and the ladder are managed on Hierarchy.
  tab('hr', 'hierarchy', 'Hierarchy', ['team', 'team_directory'], { view: ['team.view'], edit: ['team.edit', 'team.manage'] }),
  tab('hr', 'member_services', 'Member Services', ['member_requests_manage', 'member_memos_manage'], { view: ['member.view'], edit: ['member.manage'] }),
  // Round 2 (the handoff's second package): Documentation, Hiring, and the Admin pages.
  tab('hr', 'documentation', 'Documentation', ['documentation'], { view: ['documentation.view'], create: ['documentation.create'], edit: ['documentation.edit'] }),
  tab('hr', 'hiring_requests', 'Hiring requests', ['hiring'], HIRING),
  tab('hr', 'hiring_insights', 'Hiring insights', ['hiring'], { view: ['hiring.view'] }),
  tab('hr', 'talent_bank', 'Talent Bank', ['hiring'], { view: ['hiring.view'], create: ['hiring.create'], edit: ['hiring.edit'] }),
  // HR › Attendance (2026-10-15, mig 20261015030000): one tab a page.
  tab('hr', 'att_today', 'Attendance today', ['attendance'], { view: ['attendance.view'] }),
  tab('hr', 'att_records', 'Attendance records', ['attendance'], { view: ['attendance.view'], edit: ['attendance.edit'] }),
  tab('hr', 'att_requests', 'Attendance requests', ['attendance'], { view: ['attendance.view'], create: ['attendance.create'], approve: ['attendance.approve'] }),
  tab('hr', 'att_balances', 'Leave balances', ['attendance'], { view: ['attendance.view'], create: ['attendance.create'], edit: ['attendance.edit'] }),
  tab('hr', 'att_close', 'Month close', ['attendance'], { view: ['attendance.view'], edit: ['attendance.edit'] }),
  tab('hr', 'att_settings', 'Attendance settings', ['attendance'], { view: ['attendance.view'], edit: ['attendance.edit'] }),
  tab('hr', 'att_ready', 'Readiness', ['attendance'], { view: ['attendance.view'] }),
  // Every view books a room (the user, 2026-10-11): one page, a tab in each.
  shared('meeting_rooms', tab('hr', 'meeting_rooms', 'Meeting Rooms', ROOMS_KEYS, ROOMS)),
  tab('hr', 'guest_link', 'Guest Link', ['guest_link'], { view: ['guest_link.view'], edit: ['guest_link.edit'] }),
  // HR's Audit Log is Changes: what it shows follows the reader's other boxes, so its own box opens nothing more.
  shared('audit_changes', tab('hr', 'audit_log', 'Audit Log', AUDIT_CHANGES_KEYS, {})),

  // ── Finance view ──
  tab('fin', 'overview', 'Overview', [], OVERVIEW),
  shared('approvals', tab('fin', 'approvals', 'Approvals', ['approvals', 'approvals_queue'], APPROVALS)),
  tab('fin', 'payments', 'Payments', TREASURY_KEYS, TREASURY),
  tab('fin', 'receipt', 'Receipt', TREASURY_KEYS, TREASURY),
  tab('fin', 'invoice', 'Invoice', ['billing'], BILLING),
  tab('fin', 'billing_allocator', 'Billing Allocator', ['billing'], BILLING),
  tab('fin', 'daily_bank', 'Daily Bank', TREASURY_KEYS, TREASURY),
  tab('fin', 'fund_in', 'Fund IN', TREASURY_KEYS, TREASURY),
  tab('fin', 'fund_out', 'Fund OUT', TREASURY_KEYS, TREASURY),
  tab('fin', 'invoice_financing', 'Invoice Financing', TREASURY_KEYS, TREASURY),
  // Overdue went with its page (2026-10-14, mig 20261014010000) — its cells are every treasury tab's.
  tab('fin', 'repayment_schedule', 'Repayment Schedule', TREASURY_KEYS, TREASURY),
  tab('fin', 'statements', 'Statements', TREASURY_KEYS, TREASURY),
  shared('reports', tab('fin', 'reports', 'Reports', ['reports'], REPORTS)),
  // The department reports read company-wide (P&L, Cash Flow, Receipt & Payment, Debtor Aging).
  tab('fin', 'dept_reports', 'Department reports', ['dept_reports'], DEPT_REPORTS),
  tab('fin', 'reconciliation', 'Reconciliation', ['reconciliation'], RECONCILIATION),
  tab('fin', 'journal_entries', 'Journal Entries', ['reconciliation'], RECONCILIATION),
  // Pages Finance opens today that the handoff's list left out. (Claims went with its sidebar link —
  // the user, 2026-10-16: "can delete"; its company-wide box is the Principal view's below.)
  shared('dept_pool', tab('fin', 'dept_pool', 'Dept Pool', ['dept_pool'], DEPT_POOL)),
  shared('venture_pool', tab('fin', 'venture_pool', 'Venture Pool', ['venture_pool'], VENTURE_POOL)),
  tab('fin', 'chart_of_account', 'Chart of Account', ['categories'], { view: ['categories.view'], edit: ['categories.manage'] }),
  shared('meeting_rooms', tab('fin', 'meeting_rooms', 'Meeting Rooms', ROOMS_KEYS, ROOMS)),
  // Finance reads Audit Log › Changes for its own areas, as HR does for theirs.
  shared('audit_changes', tab('fin', 'audit_log', 'Audit Log', AUDIT_CHANGES_KEYS, {})),

  // ── Principal view ──
  tab('pri', 'overview', 'Overview', [], OVERVIEW),
  shared('approvals', tab('pri', 'approvals', 'Approvals', ['approvals', 'approvals_queue'], APPROVALS)),
  shared('dept_pool', tab('pri', 'dept_pool', 'Dept Pool', ['dept_pool'], DEPT_POOL)),
  shared('venture_pool', tab('pri', 'venture_pool', 'Venture Pool', ['venture_pool'], VENTURE_POOL)),
  tab('pri', 'opex', 'OPEX', ['opex'], OPEX),
  tab('pri', 'my_billing', 'My Billing', ['my_billing'], MY_BILLING),
  // Every department's claims (2026-10-16): Finance view › Claims was deleted (the user: "i will build
  // another tab for it. so delete this version first"); the Principal's sidebar keeps Claims under
  // Departments, so the company-wide box stands here until that tab is built — the full-access
  // templates' claims cells keep a box, and no save narrows them to one department.
  tab('pri', 'claims', 'Claims', ['claims'], { view: ['claims.view'], create: ['claims.create'], edit: ['claims.edit'], approve: ['claims.approve', 'claims.void'] }),
  shared('reports', tab('pri', 'reports', 'Reports', ['reports'], REPORTS)),
  shared('meeting_rooms', tab('pri', 'meeting_rooms', 'Meeting Rooms', ROOMS_KEYS, ROOMS)),
  tab('pri', 'audit_log', 'Audit Log', ['audit_log'], { view: ['audit_log.view', 'audit_log.export'] }),
  tab('pri', 'settings', 'Settings', ['settings'], { view: ['settings.view'], edit: ['settings.manage'] }),
  tab('pri', 'switch_views', 'Switch views', ['view_switch'], { view: ['view_switch.view'] }),

  // ── Department view (the holder's own department) ──
  tab('dept', 'overview', 'Overview', [], OVERVIEW),
  tab('dept', 'dept_pool', 'Dept Pool', ['dept_pool'], DEPT_POOL),
  tab('dept', 'opex', 'OPEX', ['opex'], OPEX),
  tab('dept', 'my_billing', 'My Billing', ['my_billing'], MY_BILLING),
  tab('dept', 'claims', 'Claims', ['claims'], { view: ['claims.view'], approve: ['claims.approve', 'claims.void'] }),
  // Raising one's own claims — every member of staff's (Staff · Basic).
  tab('dept', 'my_claims', 'My claims', ['claims'], { view: ['claims.view'], create: ['claims.create'], edit: ['claims.edit'] }, 'own'),
  tab('dept', 'reports', 'Reports', ['dept_reports'], DEPT_REPORTS),
  tab('dept', 'people', 'People', ['team', 'team_directory'], { view: ['team.view'] }),
  // The rooms are the company's: booked at the company's reach from the Department view too.
  shared('meeting_rooms', tab('dept', 'meeting_rooms', 'Meeting Rooms', ROOMS_KEYS, ROOMS, 'all')),

  // ── Revenue app (the holder's own records) ──
  tab('rev', 'today', 'Today', ['member_portal'], REVENUE_APP),
  tab('rev', 'insight', 'Insight', ['member_insight'], REVENUE_APP),
  tab('rev', 'quote', 'Quote', ['member_quote'], REVENUE_APP_SENDS),
  tab('rev', 'arena', 'Arena', ['member_insight', 'member_portal'], REVENUE_APP),
  tab('rev', 'income', 'Profile · My income', ['member_portal'], REVENUE_APP),
  tab('rev', 'requests', 'Profile · Requests', ['member_requests'], REVENUE_APP_SENDS),
  tab('rev', 'track', 'Profile · Waiting list & replacements', ['member_requests'], REVENUE_APP_SENDS),
  tab('rev', 'team', 'Profile · Team & capacity', ['member_portal'], REVENUE_APP),
  // Round 2 (2026-10-11): the meeting rooms, booked from the app (the database lets a member book for themselves).
  tab('rev', 'rooms', 'Profile · Book a room', ['member_portal'], REVENUE_APP_SENDS),
  // …and the files HR shares with the member's department (People › Documentation).
  tab('rev', 'documentation', 'Profile · Documentation', ['member_portal'], REVENUE_APP),
  // The rest of Profile (2026-10-11, the user: every page of every view has its row): the medals and Fair
  // records, the brand worked each fair weekend (read with the Arena's key), and the commission scheme's
  // sheet. Memos & notifications has none on purpose — HR counts every member as needing to acknowledge
  // a memo, so it stays open to all (the user's choice).
  tab('rev', 'honours', 'Profile · My honours', ['member_insight'], REVENUE_APP),
  tab('rev', 'brand_weeks', 'Profile · My brand weeks', ['member_insight'], REVENUE_APP),
  tab('rev', 'scheme', 'Profile · Commission scheme', ['member_portal'], REVENUE_APP),
  tab('rev', 'leads', 'Profile · My leads & appointments', ['member_crm', 'crm_manage'], { view: ['crm.view'], edit: ['crm.edit'] }),
  // The Director and the CEO run the CRM for the whole team (PR #253); its Control panel opens with CRM · View at All.
  { ...tab('rev', 'crm_team', 'CRM · Team', ['crm_manage'], { view: ['crm.view'], edit: ['crm.edit', 'crm.manage'] }, 'all'), cellGated: true },
  tab('rev', 'product_list', 'Product List', ['product_list'], { view: ['product_list.view'], edit: ['product_list.edit'] }, 'all'),

  // ── Lead View (2026-10-16, mig 20261016300000): one tab a page ──
  tab('lead', 'inbox', 'Inbox', LEADS_KEYS, { view: ['leads.view'], create: ['leads.create'], edit: ['leads.edit'] }),
  tab('lead', 'leads', 'Leads', LEADS_KEYS, { view: ['leads.view'], edit: ['leads.edit'] }),
  tab('lead', 'insight', 'Insight', LEADS_KEYS, { view: ['leads.view'] }),
  // Flows (phase 2, mig 20261016310000): the button flows, set up as Settings is (Manage, with its Edit).
  tab('lead', 'flows', 'Flows', LEADS_KEYS, { view: ['leads.view'], edit: ['leads.manage'] }),
  // AI Agent and its Data Center (mig 20261016330000): the soul and the cards it may quote, set up as Settings is.
  tab('lead', 'ai', 'AI Agent', LEADS_KEYS, { view: ['leads.view'], edit: ['leads.manage'] }),
  tab('lead', 'knowledge', 'Data Center', LEADS_KEYS, { view: ['leads.view'], edit: ['leads.manage'] }),
  // Settings: the brands and their salespeople (Manage, with its Edit), and the test enquiry (Create).
  tab('lead', 'settings', 'Settings', LEADS_KEYS, { view: ['leads.view'], create: ['leads.create'], edit: ['leads.manage'] }),
]

export const TAB_BY_ID: ReadonlyMap<string, PermissionTab> = new Map(PERMISSION_TABS.map(t => [t.id, t]))

/** `hr.payroll.view` — a box as the database stores it (tab id, then action). */
export type TabGrant = `${string}.${TabAction}`
export const grantOf = (tabId: string, action: TabAction): TabGrant => `${tabId}.${action}` as TabGrant

/** The tab and the action of a stored box, or null when it names neither. */
export function parseGrant(grant: string): { tab: PermissionTab; action: TabAction } | null {
  const at = grant.lastIndexOf('.')
  if (at < 0) return null
  const tabDef = TAB_BY_ID.get(grant.slice(0, at))
  const action = grant.slice(at + 1) as TabAction
  if (!tabDef || !TAB_ACTIONS.includes(action) || !hasBox(tabDef, action)) return null
  return { tab: tabDef, action }
}

/** Does this box exist on this tab (Overview has no Create)? View always does. */
export function hasBox(t: PermissionTab, action: TabAction): boolean {
  return action === 'view' || (t.opens[action]?.length ?? 0) > 0
}

const RANK: Record<Scope, number> = { own: 1, dept: 2, all: 3 }

/** Function cells → their reach: what a set of ticked boxes opens underneath (the union, the widest reach). */
export function cellsFromTabs(grants: Iterable<string>): Map<FnAction, Scope> {
  const out = new Map<FnAction, Scope>()
  for (const g of grants) {
    const parsed = parseGrant(g)
    if (!parsed) continue
    for (const cell of parsed.tab.opens[parsed.action] ?? []) {
      const had = out.get(cell)
      if (!had || RANK[parsed.tab.reach] > RANK[had]) out.set(cell, parsed.tab.reach)
    }
  }
  return out
}

/**
 * A template moved onto tabs: a box is ticked only when the template already
 * holds its own cell (the first it opens) at least as far as the tab reaches,
 * and — for View — the tab's page opens for its keys today. A view's Overview
 * is ticked only with something else of that view. Nothing it does not hold
 * is ever ticked, so moving loses no cell (`lossesOf` proves it per template).
 */
export function tabsFromCells(cells: ReadonlyMap<string, Scope>, keys: ReadonlySet<string>): Set<TabGrant> {
  const out = new Set<TabGrant>()
  const holds = (cell: FnAction | undefined, reach: Scope) => !!cell && !!cells.get(cell) && RANK[cells.get(cell)!] >= RANK[reach]
  const boxes = (t: PermissionTab): TabGrant[] => {
    const own = t.opens.view?.[0]
    const opens = t.keys.length === 0 || t.keys.some(k => keys.has(k))
    if (!opens || (own ? !holds(own, t.reach) : false)) return []
    return TAB_ACTIONS.filter(a => a === 'view' || holds(t.opens[a]?.[0], t.reach)).map(a => grantOf(t.id, a))
  }
  // The company-wide tabs first; a narrower tab only for what the wider ones do not already
  // give (a Department head's own department, anybody's own claims — so Finance and the
  // Principal are never put in the Department view). Tabs of one reach stand on their own.
  const bands = (['all', 'dept', 'own'] as const).map(reach => PERMISSION_TABS.filter(t => !t.id.endsWith('.overview') && t.reach === reach))
  for (const [i, band] of bands.entries()) {
    const given = cellsFromTabs(out)
    for (const t of band) {
      const mine = boxes(t)
      const adds = i === 0 || mine.some(g => {
        const p = parseGrant(g)
        return (p?.tab.opens[p.action] ?? []).some(c => !given.get(c) || RANK[given.get(c)!] < RANK[t.reach])
      })
      if (adds) mine.forEach(g => out.add(g))
    }
  }
  // A page listed in several views is ticked in the views the template lives in (those it holds a
  // page of its own in); held but in none of them, in the first view that lists it.
  const home = new Set(PERMISSION_TABS.filter(t => !t.page && !t.id.endsWith('.overview') && out.has(grantOf(t.id, 'view'))).map(t => t.view))
  for (const page of new Set(PERMISSION_TABS.flatMap(t => (t.page ? [t.page] : [])))) {
    const held = PERMISSION_TABS.filter(t => t.page === page && out.has(grantOf(t.id, 'view')))
    const keep = held.filter(t => home.has(t.view))
    const drop = keep.length ? held.filter(t => !home.has(t.view)) : held.slice(1)
    for (const t of drop) for (const a of TAB_ACTIONS) out.delete(grantOf(t.id, a))
  }
  for (const v of TAB_VIEWS) {
    const overview = TAB_BY_ID.get(`${v.id}.overview`)
    if (overview && [...out].some(g => g.startsWith(`${v.id}.`)) && holds('dashboard.view', 'own')) out.add(grantOf(overview.id, 'view'))
  }
  return out
}

/** The cells a template held that its ticks do not give back — must be none. */
export function lossesOf(cells: ReadonlyMap<string, Scope>, grants: Iterable<string>): string[] {
  const derived = cellsFromTabs(grants)
  return [...cells].filter(([cell, reach]) => {
    const got = derived.get(cell as FnAction)
    return !got || RANK[got] < RANK[reach]
  }).map(([cell, reach]) => `${cell}:${reach}`).sort()
}

/** The cells its ticks give that it did not hold, or held less far — the user's merges, said out loud. */
export function gainsOf(cells: ReadonlyMap<string, Scope>, grants: Iterable<string>): string[] {
  return [...cellsFromTabs(grants)].filter(([cell, reach]) => {
    const had = cells.get(cell)
    return !had || RANK[had] < RANK[reach]
  }).map(([cell, reach]) => `${cell}:${reach}`).sort()
}

/** How many of a view's tabs the boxes let them see — the rail's "8/8". */
export function viewCount(view: TabView, grants: ReadonlySet<string>): { seen: number; of: number } {
  const tabs = PERMISSION_TABS.filter(t => t.view === view)
  return { seen: tabs.filter(t => grants.has(grantOf(t.id, 'view'))).length, of: tabs.length }
}

// ── What the Permissions tab and a person's window work with ──────────────

/** A template's cells as a map, `fn.action` → reach. */
export function cellMap(grants: Grants): Map<string, Scope> {
  const out = new Map<string, Scope>()
  for (const [fn, actions] of Object.entries(grants)) {
    for (const [action, scope] of Object.entries(actions ?? {})) if (scope) out.set(`${fn}.${action}`, scope)
  }
  return out
}

/** A template as the tab draws it: the ticks it stored, else the ones its cells give (it loses none). */
export function templateTicks(
  t: { grants: Grants; sensitive: readonly SensitiveField[]; baseRole: string; tabs: readonly string[] | null },
  cellKeys: readonly CellKey[],
): Set<TabGrant> {
  if (t.tabs) return new Set(t.tabs.filter(g => parseGrant(g)) as TabGrant[])
  return tabsFromCells(cellMap(t.grants), new Set(openedKeys(t.grants, t.sensitive, t.baseRole, cellKeys)))
}

/** The cells a save writes for these ticks, as `permission_template_save` takes them. */
export function cellRows(ticks: Iterable<string>): Array<{ function_key: string; action: string; scope: Scope }> {
  return [...cellsFromTabs(ticks)].map(([cell, scope]) => {
    const [function_key, action] = cell.split('.')
    return { function_key, action, scope }
  }).sort((a, b) => `${a.function_key}.${a.action}`.localeCompare(`${b.function_key}.${b.action}`))
}

/** The ticks as Grants (for the maker-and-checker warning, which reads cells). */
export function grantsOfTicks(ticks: Iterable<string>): Grants {
  const out: Grants = {}
  for (const [cell, scope] of cellsFromTabs(ticks)) {
    const [fn, action] = cell.split('.')
    out[fn] = { ...out[fn], [action]: scope }
  }
  return out
}

/** One person's box over their title's template. */
export interface PersonBox {
  tab: string
  action: TabAction
  granted: boolean
}

/**
 * Their ticks: the template's, with their own boxes over them. A box whose
 * tab they cannot View is not theirs (raised to approve on a tab the template
 * later stopped showing) — as the matrix never ticks one without its View.
 */
export function personTicks(base: ReadonlySet<string>, boxes: readonly PersonBox[]): Set<TabGrant> {
  const out = new Set(base as ReadonlySet<TabGrant>)
  for (const b of boxes) {
    const g = grantOf(b.tab, b.action)
    if (b.granted) out.add(g)
    else out.delete(g)
  }
  for (const g of [...out]) {
    const p = parseGrant(g)
    if (p && p.action !== 'view' && !out.has(grantOf(p.tab.id, 'view'))) out.delete(g)
  }
  return out
}

/** A person's ticks today: their stored boxes over the template's, else the ticks their own cells give over its cells. */
export function ticksOfPerson(
  template: { grants: Grants; sensitive: readonly SensitiveField[]; baseRole: string; tabs: readonly string[] | null },
  person: { boxes: readonly PersonBox[]; cells: PersonCells },
  cellKeys: readonly CellKey[],
): Set<TabGrant> {
  const base = templateTicks(template, cellKeys)
  if (person.boxes.length > 0) return personTicks(base, person.boxes)
  if (Object.keys(person.cells).length === 0) return base
  const grants = effectiveGrants(template.grants, person.cells)
  return tabsFromCells(cellMap(grants), new Set(openedKeys(grants, template.sensitive, template.baseRole, cellKeys)))
}

/** Their own boxes: where their ticks differ from the template's. */
export function boxesOf(base: ReadonlySet<string>, ticks: ReadonlySet<string>): PersonBox[] {
  const out: PersonBox[] = []
  for (const g of new Set([...base, ...ticks])) {
    const p = parseGrant(g)
    if (p && base.has(g) !== ticks.has(g)) out.push({ tab: p.tab.id, action: p.action, granted: ticks.has(g) })
  }
  return out.sort((a, b) => `${a.tab}.${a.action}`.localeCompare(`${b.tab}.${b.action}`))
}

/**
 * Their own cells, as `current_actions()` lays them over the template's
 * STORED cells: every cell their ticks give at another reach than the
 * template stores it, and every stored cell their ticks do not give (held
 * back — scope null).
 */
export function personCellRows(templateCells: ReadonlyMap<string, Scope>, ticks: Iterable<string>): PersonCellRow[] {
  const theirs = cellsFromTabs(ticks)
  const out: PersonCellRow[] = []
  for (const cell of new Set<string>([...templateCells.keys(), ...theirs.keys()])) {
    const want = theirs.get(cell as FnAction) ?? null
    if (want === (templateCells.get(cell) ?? null)) continue
    const [function_key, action] = cell.split('.')
    out.push({ function_key, action, scope: want })
  }
  return out.sort((a, b) => `${a.function_key}.${a.action}`.localeCompare(`${b.function_key}.${b.action}`))
}

type PersonCellRow = { function_key: string; action: string; scope: Scope | null }

/**
 * A person's boxes laid over their template again once it changed — its ticks
 * saved, or their title moved to another: what was changed for them against
 * the old ticks (`before` → `theirs`), over the new ones, and the cells worked
 * out again from that. Without it a box held back from one page could hold
 * back what the template later gives through another, or a cell given with an
 * old tick outlive it.
 */
export function reapplied(
  before: ReadonlySet<string>,
  theirs: ReadonlySet<string>,
  after: { ticks: ReadonlySet<string>; cells: ReadonlyMap<string, Scope> },
): { tabs: PersonBox[]; cells: PersonCellRow[] } {
  const ticks = personTicks(after.ticks, boxesOf(before, theirs))
  return { tabs: boxesOf(after.ticks, ticks), cells: personCellRows(after.cells, ticks) }
}

/**
 * Their own cells as stored are not what their boxes over today's template
 * give (their title moved to another template since they were saved): the
 * database grants other than their window shows until somebody saves them.
 */
export function cellsOutOfStep(templateCells: ReadonlyMap<string, Scope>, ticks: Iterable<string>, stored: PersonCells): boolean {
  const want = personCellRows(templateCells, ticks)
  if (want.length !== Object.keys(stored).length) return true
  return want.some(r => stored[`${r.function_key}.${r.action}`] !== (r.scope ?? 'none'))
}

/** Tick or untick one box: any box brings View with it; taking View away takes the tab. */
export function toggleBox(ticks: ReadonlySet<string>, tabId: string, action: TabAction): Set<TabGrant> {
  const t = TAB_BY_ID.get(tabId)
  const out = new Set(ticks as ReadonlySet<TabGrant>)
  if (!t || !hasBox(t, action)) return out
  const g = grantOf(tabId, action)
  if (out.has(g)) {
    out.delete(g)
    if (action === 'view') for (const a of TAB_ACTIONS) out.delete(grantOf(tabId, a))
  } else {
    out.add(g)
    out.add(grantOf(tabId, 'view'))
  }
  return out
}

/** The row's "all": every box the tab has, or — when all are ticked — none. */
export function toggleRow(ticks: ReadonlySet<string>, tabId: string): Set<TabGrant> {
  const t = TAB_BY_ID.get(tabId)
  const out = new Set(ticks as ReadonlySet<TabGrant>)
  if (!t) return out
  const boxes = TAB_ACTIONS.filter(a => hasBox(t, a)).map(a => grantOf(tabId, a))
  const all = boxes.every(g => out.has(g))
  for (const g of boxes) {
    if (all) out.delete(g)
    else out.add(g)
  }
  return out
}

/** Two sets of ticks hold the same boxes. */
export function sameTicks(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(g => b.has(g))
}

// ── Select all, the New template window, and the boxes that open nothing yet (2026-10-11) ──

/** One view's tabs, in its rail's order. */
export function tabsOfView(view: TabView): PermissionTab[] {
  return PERMISSION_TABS.filter(t => t.view === view)
}

/** A column of one view's table, or the whole view: every box ticked, some, or none. */
export type Tally = 'all' | 'some' | 'none'

const tally = (boxes: readonly string[], ticks: ReadonlySet<string>): Tally => {
  const on = boxes.filter(g => ticks.has(g)).length
  return on === 0 ? 'none' : on === boxes.length ? 'all' : 'some'
}

/** The boxes one action has across a view's tabs (a tab without that box is left out). */
function columnBoxes(view: TabView, action: TabAction): TabGrant[] {
  return tabsOfView(view).filter(t => hasBox(t, action)).map(t => grantOf(t.id, action))
}

/** Every box of every tab of a view. */
function viewBoxes(view: TabView): TabGrant[] {
  return tabsOfView(view).flatMap(t => TAB_ACTIONS.filter(a => hasBox(t, a)).map(a => grantOf(t.id, a)))
}

/** The Select all row's box over one column: how many of its boxes are ticked, and how many there are. */
export function columnTally(ticks: ReadonlySet<string>, view: TabView, action: TabAction): { tally: Tally; boxes: number } {
  const boxes = columnBoxes(view, action)
  return { tally: tally(boxes, ticks), boxes: boxes.length }
}

/** The Select all row's "All": every box of the view. */
export function viewTally(ticks: ReadonlySet<string>, view: TabView): Tally {
  return tally(viewBoxes(view), ticks)
}

/**
 * Select all over one column (the user, 2026-10-11 — a row of boxes at the top
 * of each view's table): that box ticked on every tab of the view that has it,
 * each tab's View with it — or, when every one is already ticked, unticked on
 * them all; unticking View takes each tab, as a row's own View does.
 */
export function toggleColumn(ticks: ReadonlySet<string>, view: TabView, action: TabAction): Set<TabGrant> {
  const out = new Set(ticks as ReadonlySet<TabGrant>)
  const tabs = tabsOfView(view).filter(t => hasBox(t, action))
  const every = tabs.length > 0 && tabs.every(t => out.has(grantOf(t.id, action)))
  for (const t of tabs) {
    if (every) {
      out.delete(grantOf(t.id, action))
      if (action === 'view') for (const a of TAB_ACTIONS) out.delete(grantOf(t.id, a))
    } else {
      out.add(grantOf(t.id, action))
      out.add(grantOf(t.id, 'view'))
    }
  }
  return out
}

/** Select all's "All": every box of every tab in the view — or, all of them ticked, none. */
export function toggleView(ticks: ReadonlySet<string>, view: TabView): Set<TabGrant> {
  const out = new Set(ticks as ReadonlySet<TabGrant>)
  const boxes = viewBoxes(view)
  const every = boxes.every(g => out.has(g))
  for (const g of boxes) {
    if (every) out.delete(g)
    else out.add(g)
  }
  return out
}

/**
 * A new template's ticks (the user, 2026-10-11 — "+ New template" asks a name
 * and which views it can see): View on every tab of the views picked, nothing
 * else; Create, Edit and Approve are ticked afterwards in the table.
 */
export function viewTicks(views: Iterable<string>): Set<TabGrant> {
  const picked = new Set(views)
  return new Set(PERMISSION_TABS.filter(t => picked.has(t.view)).map(t => grantOf(t.id, 'view')))
}

export const isTabView = (value: unknown): value is TabView => TAB_VIEWS.some(v => v.id === value)

/** Only the Revenue app among the views: its holders are Revenue app accounts (the database decides it from the ticks the same way). */
export const appOnly = (views: Iterable<string>): boolean => {
  const picked = [...new Set(views)]
  return picked.length > 0 && picked.every(v => v === 'rev')
}

const HELD_SAYS: Readonly<Record<HeldCode, string>> = {
  scope: 'Not open yet — its page opens only company-wide for now',
  salary: 'Not open yet — it shows pay: tick Salary amounts',
  treasury: 'Not open yet — it needs the View of a treasury tab too (Payments, Receipt, Fund IN …)',
  principal: 'Does not open — only a full-access template opens it',
  member: 'Does not open — a Revenue app account opens only the Revenue app',
}

/**
 * The tabs whose View is ticked but whose page still would not open (2026-10-11
 * — a note the user passed on: a template could show a tab ticked that its
 * holders cannot reach). A View opens its page through the module keys the
 * gates read, and a key stays shut while its gate holds it back — pay pages
 * want Salary amounts, the ledgers a treasury tab's View, the Principal's own
 * pages a full-access template, a Revenue app account only its app — or while
 * the box that opens it is not ticked (Member Services opens with its Edit,
 * Permissions with People Management's View). Each with what to do about it.
 */
export function heldTabs(
  ticks: ReadonlySet<string>,
  sensitive: readonly SensitiveField[],
  baseRole: string,
  cellKeys: readonly CellKey[],
): Map<string, string> {
  const grants = grantsOfTicks(ticks)
  const opened = new Set(openedKeys(grants, sensitive, baseRole, cellKeys))
  const seesSalary = sensitive.includes('salary')
  const out = new Map<string, string>()
  for (const t of PERMISSION_TABS) {
    if (t.keys.length === 0 || t.cellGated || !ticks.has(grantOf(t.id, 'view')) || t.keys.some(k => opened.has(k))) continue
    // A Principal-kind account opens the Revenue app as the Principal, with no member keys (lib/member/server.ts › session).
    if (baseRole === 'principal' && t.keys.every(k => MEMBER_APP_KEYS.includes(k))) continue
    // A Revenue app account opens no portal page whatever else is ticked — say that first.
    if (baseRole === 'revenue_member' && t.view !== 'rev') {
      out.set(t.id, HELD_SAYS.member)
      continue
    }
    const rows = cellKeys.filter(k => t.keys.includes(k.legacyKey))
    const code = rows.map(k => keyHeldCode(grants, seesSalary, baseRole, k)).find((c): c is HeldCode => c !== null)
    out.set(t.id, code ? HELD_SAYS[code] : needsAnotherBox(t, rows))
  }
  return out
}

/** Nothing ticked grants a cell that opens the page: the box that would, on this tab first. */
function needsAnotherBox(t: PermissionTab, rows: readonly CellKey[]): string {
  // HR's and Finance's Audit Log show the changes of whatever else the template opens.
  if (Object.keys(t.opens).length === 0) return 'Not open yet — it shows the changes of what its other boxes open, and none of them is ticked'
  const cells = new Set(rows.map(k => `${k.functionKey}.${k.action}`))
  const boxOf = (tab: PermissionTab) => TAB_ACTIONS.find(a => (tab.opens[a] ?? []).some(c => cells.has(c)))
  const own = boxOf(t)
  if (own) return `Not open yet — its page opens with its ${TAB_ACTION_LABEL[own]} box ticked too`
  const other = PERMISSION_TABS.find(x => x.view === t.view && boxOf(x)) ?? PERMISSION_TABS.find(x => boxOf(x))
  return other ? `Not open yet — its page opens with ${other.label} · ${TAB_ACTION_LABEL[boxOf(other)!]} ticked too` : 'Not open yet'
}
