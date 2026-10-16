/**
 * What somebody may DO, and how far (2026-10-08 — PR2 of the People
 * Management revamp: every cell of the matrix takes effect).
 *
 * Until now a gate asked for a module key, and a key opened the whole module:
 * whoever could see Treasury could raise, edit, void and export in it. Now a
 * write asks for the action it is — `treasury.create`, `treasury.approve`,
 * `claims.approve` at Dept — and the answer comes from `current_actions()`
 * (migration 20261008200000): a titled person's template cells with their own
 * cells over them, or, for an account with no template, exactly what its keys
 * allowed before (`permission_key_actions`, twinned below as `KEY_ACTIONS`).
 *
 * An action counts only while the function's own pages are open to them — a
 * cell can never reach past the module key the page itself is gated by (the
 * fail-closed rule of PR1 still decides those keys).
 */

import type { PermissionHolder } from '@/lib/permissions'
import type { Action, Scope } from '@/lib/permission-matrix'

export type FunctionKey =
  | 'dashboard' | 'approvals' | 'treasury' | 'billing' | 'categories' | 'hr_costing' | 'revenue' | 'product_list'
  | 'director_salary' | 'director_pool' | 'team' | 'accounts' | 'member' | 'revenue_app' | 'dept_pool'
  | 'venture_pool' | 'opex' | 'my_billing' | 'claims' | 'reports' | 'dept_reports' | 'reconciliation'
  | 'audit_log' | 'settings' | 'view_switch' | 'crm'
  // HR revamp round 2 (mig 20261011060000).
  | 'documentation' | 'hiring' | 'rooms' | 'guest_link'
  // HR › Attendance (mig 20261015030000).
  | 'attendance'
  // Lead View (mig 20261016300000).
  | 'leads'

/** Anybody gates can be asked about: their keys, and their actions when they were loaded. */
export interface ActionHolder extends PermissionHolder {
  actions?: Readonly<Record<string, Scope>>
}

const REACH: Record<Scope, number> = { own: 1, dept: 2, all: 3 }

/** How far they hold this action, or null. */
export function actionScope(holder: ActionHolder | null | undefined, fn: FunctionKey, action: Action): Scope | null {
  return holder?.actions?.[`${fn}.${action}`] ?? null
}

/**
 * May they do this, at least this far? `all` unless a gate says less: a gate
 * that serves somebody's own records or their department asks for that.
 */
export function canDo(holder: ActionHolder | null | undefined, fn: FunctionKey, action: Action, scope: Scope = 'all'): boolean {
  if (!holder) return false
  const held = actionScope(holder, fn, action)
  if (!held || REACH[held] < REACH[scope]) return false
  const keys = viewKeysOf(fn)
  return keys.length === 0 || keys.some(key => holder.permissions.includes(key))
}

/** Any of these actions (several gates are reachable two ways). */
export function canDoAny(holder: ActionHolder | null | undefined, ...wants: Array<[FunctionKey, Action] | [FunctionKey, Action, Scope]>): boolean {
  return wants.some(([fn, action, scope]) => canDo(holder, fn, action, scope ?? 'all'))
}

/**
 * What a key allowed before actions took effect — the twin of
 * `permission_key_actions` (registry test: `permission-actions.test.ts`
 * reads the migration and holds the two equal).
 */
export const KEY_ACTIONS: Readonly<Record<string, ReadonlyArray<`${FunctionKey}.${Action}`>>> = {
  dashboard: ['dashboard.view'],
  // The queue's Approve — the Principal's — also carries HR Costing's, Director
  // Salary's and Revenue's: deciding a payroll run or an Invoice Pool release
  // was only ever theirs (20261009010000 moved the three rows here).
  approvals: ['approvals.view', 'approvals.approve', 'hr_costing.approve', 'director_salary.approve', 'revenue.approve'],
  approvals_queue: ['approvals.view'],
  treasury: ['treasury.view', 'treasury.create', 'treasury.edit', 'treasury.void', 'treasury.export'],
  override: ['treasury.approve'],
  billing: ['billing.view', 'billing.create', 'billing.edit', 'billing.void', 'billing.export'],
  categories: ['categories.view', 'categories.manage'],
  hr_costing: ['hr_costing.view', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.export'],
  revenue: ['revenue.view', 'revenue.create', 'revenue.edit', 'revenue.export', 'revenue.manage'],
  product_list: ['product_list.view', 'product_list.edit'],
  director_salary: ['director_salary.view', 'director_salary.edit'],
  director_pool: ['director_pool.view', 'director_pool.edit'],
  team: ['team.view', 'team.create', 'team.edit', 'team.manage'],
  team_invite: ['accounts.view', 'accounts.create'],
  permissions_manage: ['accounts.view', 'accounts.manage'],
  dept_pool: ['dept_pool.view', 'dept_pool.export'],
  venture_pool: ['venture_pool.view', 'venture_pool.create', 'venture_pool.edit', 'venture_pool.export'],
  opex: ['opex.view', 'opex.export'],
  my_billing: ['my_billing.view', 'my_billing.create'],
  claims: ['claims.view', 'claims.create', 'claims.edit', 'claims.void'],
  claims_approve: ['claims.approve'],
  reports: ['reports.view', 'reports.export'],
  dept_reports: ['dept_reports.view', 'dept_reports.export'],
  reconciliation: ['reconciliation.view', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.approve'],
  audit_log: ['audit_log.view', 'audit_log.export'],
  settings: ['settings.view', 'settings.manage'],
  department_mode: ['settings.manage'],
  member_requests_manage: ['member.view', 'member.manage'],
  member_memos_manage: ['member.view', 'member.manage'],
  member_portal: ['revenue_app.view'],
  member_insight: ['revenue_app.view'],
  member_memos: ['revenue_app.view'],
  member_quote: ['revenue_app.create'],
  member_requests: ['revenue_app.create'],
  // The CRM (20261010020000): their own line, or the Control panel.
  member_crm: ['crm.view', 'crm.edit'],
  crm_manage: ['crm.view', 'crm.edit', 'crm.manage'],
  view_switch: ['view_switch.view'],
  // HR revamp round 2 (20261011060000): Documentation, Hiring, Meeting rooms
  // (booking, and the rooms themselves), the Guest link.
  documentation: ['documentation.view', 'documentation.create', 'documentation.edit'],
  hiring: ['hiring.view', 'hiring.create', 'hiring.edit', 'hiring.approve'],
  meeting_rooms: ['rooms.view', 'rooms.create'],
  meeting_rooms_manage: ['rooms.view', 'rooms.create', 'rooms.edit'],
  guest_link: ['guest_link.view', 'guest_link.edit'],
  // HR › Attendance (20261015030000).
  attendance: ['attendance.view', 'attendance.create', 'attendance.edit', 'attendance.approve'],
  // Lead View (20261016300000).
  leads: ['leads.view', 'leads.create', 'leads.edit', 'leads.manage'],
}

/**
 * The keys that open a function's pages: those that allowed its View. One of
 * them must be held before any of the function's actions counts — has_action()
 * asks the same of permission_key_actions in the database.
 */
const VIEW_KEYS = new Map<string, string[]>()
for (const [key, list] of Object.entries(KEY_ACTIONS)) {
  for (const fa of list) {
    if (!fa.endsWith('.view')) continue
    const fn = fa.slice(0, -'.view'.length)
    VIEW_KEYS.set(fn, [...(VIEW_KEYS.get(fn) ?? []), key])
  }
}

export function viewKeysOf(fn: FunctionKey): readonly string[] {
  return VIEW_KEYS.get(fn) ?? []
}

/**
 * Every action a gate in the portal asks for, and the least reach any of them
 * asks — what the matrix reads to say whether a cell is in force (heldCells,
 * lib/permission-matrix.ts). A cell missing here is not refused anything: no
 * page acts on it yet (Revenue · Approve, Venture Pool · Create …). The test
 * beside this file reads every requireAction / canDo in src/ and holds the two
 * equal, so a new gate cannot leave the matrix behind.
 */
export const GATED_ACTIONS: Readonly<Record<string, Scope>> = {
  'accounts.create': 'all',
  'accounts.manage': 'all',
  'approvals.approve': 'all',
  'approvals.view': 'all',
  // HR › Attendance (2026-10-15).
  'attendance.approve': 'all',
  'attendance.create': 'all',
  'attendance.edit': 'all',
  'attendance.view': 'all',
  'billing.create': 'all',
  'billing.edit': 'all',
  'billing.export': 'all',
  'billing.void': 'all',
  'categories.manage': 'all',
  'claims.approve': 'all',
  'claims.create': 'own',
  'crm.edit': 'own',
  'crm.manage': 'all',
  'crm.view': 'own',
  'dept_pool.view': 'own',
  'dept_reports.export': 'dept',
  'director_pool.edit': 'all',
  'documentation.create': 'all',
  'documentation.edit': 'all',
  'documentation.view': 'all',
  'director_salary.approve': 'all',
  'director_salary.edit': 'all',
  'guest_link.edit': 'all',
  'hr_costing.approve': 'all',
  'hr_costing.create': 'all',
  'hr_costing.edit': 'all',
  'hr_costing.export': 'all',
  'hr_costing.view': 'all',
  // Hiring (round 2, 2026-10-11).
  'hiring.approve': 'all',
  'hiring.create': 'all',
  'hiring.edit': 'all',
  'hiring.view': 'all',
  // Lead View (2026-10-16).
  'leads.create': 'all',
  'leads.edit': 'all',
  'leads.manage': 'all',
  'leads.view': 'all',
  // Sales Groups › Waiting list's "+" (2026-10-11): Member services · Edit.
  'member.manage': 'all',
  'my_billing.create': 'dept',
  'opex.view': 'all',
  'product_list.edit': 'all',
  'reconciliation.approve': 'all',
  'reconciliation.create': 'all',
  'reconciliation.edit': 'all',
  'reports.export': 'all',
  'reports.view': 'all',
  'revenue.create': 'all',
  'revenue.edit': 'all',
  'revenue.manage': 'all',
  'rooms.create': 'all',
  'rooms.edit': 'all',
  // The HR phone app reads the rooms only for an account whose cell opens them (2026-10-11).
  'rooms.view': 'all',
  'settings.manage': 'all',
  'team.create': 'all',
  'team.edit': 'all',
  'team.manage': 'all',
  'treasury.approve': 'all',
  'treasury.create': 'all',
  'treasury.edit': 'all',
  'treasury.export': 'all',
  'treasury.view': 'all',
  'treasury.void': 'all',
}

/** A department manager's department pages are theirs at Dept. */
const DEPARTMENT_FUNCTIONS = new Set<string>(['dept_pool', 'opex', 'my_billing', 'dept_reports', 'claims'])

/**
 * Keys as actions, the way `current_actions()` reads an account with no
 * template — what a masked view (View as) holds.
 */
export function actionsFromKeys(keys: readonly string[], role: string): Record<string, Scope> {
  const out: Record<string, Scope> = {}
  for (const key of keys) {
    for (const fa of KEY_ACTIONS[key] ?? []) {
      const fn = fa.slice(0, fa.lastIndexOf('.'))
      out[fa] = role === 'dept_manager' && DEPARTMENT_FUNCTIONS.has(fn) ? 'dept' : 'all'
    }
  }
  return out
}

/** `current_actions()`'s jsonb, checked: anything that is not `fn.action` → a reach is dropped. */
export function actionsFromJson(value: unknown): Record<string, Scope> {
  const out: Record<string, Scope> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, scope] of Object.entries(value as Record<string, unknown>)) {
    if (/^[a-z_]+\.[a-z]+$/.test(key) && (scope === 'own' || scope === 'dept' || scope === 'all')) out[key] = scope
  }
  return out
}
