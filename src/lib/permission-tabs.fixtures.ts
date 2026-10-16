// Production as it stood on 2026-10-11: the function catalog, what each cell
// opens, and the eleven templates exactly as permission_template_grants holds
// them — shared by permission-tabs.test.ts and page-tabs.test.ts.

import { openedKeys, type Action, type CellKey, type Grants, type Scope, type SensitiveField } from './permission-matrix'

// `permission_functions` on production (2026-10-11): each function's actions and reaches.
export const FUNCTIONS: Record<string, { actions: Action[]; scopes: Scope[] }> = {
  dashboard: { actions: ['view'], scopes: ['all'] },
  approvals: { actions: ['view', 'approve'], scopes: ['all'] },
  treasury: { actions: ['view', 'create', 'edit', 'approve', 'void', 'export'], scopes: ['all'] },
  billing: { actions: ['view', 'create', 'edit', 'void', 'export'], scopes: ['all'] },
  categories: { actions: ['view', 'manage'], scopes: ['all'] },
  hr_costing: { actions: ['view', 'create', 'edit', 'approve', 'export'], scopes: ['own', 'dept', 'all'] },
  revenue: { actions: ['view', 'create', 'edit', 'approve', 'export', 'manage'], scopes: ['own', 'dept', 'all'] },
  product_list: { actions: ['view', 'edit'], scopes: ['all'] },
  director_salary: { actions: ['view', 'edit', 'approve'], scopes: ['all'] },
  director_pool: { actions: ['view', 'edit'], scopes: ['all'] },
  team: { actions: ['view', 'create', 'edit', 'manage'], scopes: ['own', 'dept', 'all'] },
  accounts: { actions: ['view', 'create', 'manage'], scopes: ['all'] },
  member: { actions: ['view', 'manage'], scopes: ['all'] },
  revenue_app: { actions: ['view', 'create'], scopes: ['own'] },
  crm: { actions: ['view', 'edit', 'manage'], scopes: ['own', 'all'] },
  dept_pool: { actions: ['view', 'export'], scopes: ['dept', 'all'] },
  venture_pool: { actions: ['view', 'create', 'edit', 'export'], scopes: ['all'] },
  opex: { actions: ['view', 'export'], scopes: ['dept', 'all'] },
  my_billing: { actions: ['view', 'create'], scopes: ['dept', 'all'] },
  claims: { actions: ['view', 'create', 'edit', 'approve', 'void'], scopes: ['own', 'dept', 'all'] },
  reports: { actions: ['view', 'export'], scopes: ['all'] },
  dept_reports: { actions: ['view', 'export'], scopes: ['dept', 'all'] },
  reconciliation: { actions: ['view', 'create', 'edit', 'approve'], scopes: ['all'] },
  audit_log: { actions: ['view', 'export'], scopes: ['all'] },
  settings: { actions: ['view', 'manage'], scopes: ['all'] },
  view_switch: { actions: ['view'], scopes: ['all'] },
  // HR revamp round 2 (mig 20261011060000).
  documentation: { actions: ['view', 'create', 'edit'], scopes: ['all'] },
  hiring: { actions: ['view', 'create', 'edit', 'approve'], scopes: ['all'] },
  rooms: { actions: ['view', 'create', 'edit'], scopes: ['all'] },
  guest_link: { actions: ['view', 'edit'], scopes: ['all'] },
  // HR › Attendance (mig 20261015030000).
  attendance: { actions: ['view', 'create', 'edit', 'approve'], scopes: ['all'] },
}

// `permission_cell_keys` (as permission-matrix.test.ts holds it; the Product List's gate went 2026-10-14, mig 20261014100000).
const K = (functionKey: string, action: Action, legacyKey: string, minScope: Scope, gate: CellKey['gate'] = null): CellKey => ({ functionKey, action, legacyKey, minScope, gate })
export const CELL_KEYS: CellKey[] = [
  K('dashboard', 'view', 'dashboard', 'own'), K('approvals', 'view', 'approvals', 'all'), K('approvals', 'view', 'approvals_queue', 'all'),
  K('treasury', 'view', 'treasury', 'all', 'treasury'), K('treasury', 'approve', 'override', 'all'), K('billing', 'view', 'billing', 'all', 'treasury'),
  K('categories', 'view', 'categories', 'all', 'treasury'), K('hr_costing', 'view', 'hr_costing', 'all', 'salary'), K('revenue', 'view', 'revenue', 'all', 'salary'),
  K('product_list', 'view', 'product_list', 'all'), K('director_salary', 'view', 'director_salary', 'all', 'salary'),
  K('director_pool', 'view', 'director_pool', 'all', 'salary'), K('team', 'view', 'team', 'all', 'salary'), K('team', 'view', 'team_directory', 'own'),
  K('accounts', 'create', 'team_invite', 'all'), K('accounts', 'manage', 'permissions_manage', 'all'),
  K('member', 'manage', 'member_requests_manage', 'all'), K('member', 'manage', 'member_memos_manage', 'all'), K('dept_pool', 'view', 'dept_pool', 'own'),
  K('venture_pool', 'view', 'venture_pool', 'all', 'treasury'), K('opex', 'view', 'opex', 'own'), K('my_billing', 'view', 'my_billing', 'own'),
  K('claims', 'view', 'claims', 'own'), K('claims', 'approve', 'claims_approve', 'all'), K('reports', 'view', 'reports', 'all', 'treasury'),
  K('dept_reports', 'view', 'dept_reports', 'own'), K('reconciliation', 'view', 'reconciliation', 'all', 'treasury'), K('audit_log', 'view', 'audit_log', 'all'),
  K('settings', 'view', 'settings', 'all'), K('settings', 'manage', 'department_mode', 'all'), K('revenue_app', 'view', 'member_portal', 'own'),
  K('revenue_app', 'view', 'member_memos', 'own'), K('revenue_app', 'view', 'member_insight', 'own'), K('revenue_app', 'create', 'member_quote', 'own'),
  K('revenue_app', 'create', 'member_requests', 'own'), K('crm', 'view', 'member_crm', 'own'), K('crm', 'manage', 'crm_manage', 'all'),
  K('view_switch', 'view', 'view_switch', 'all'),
  K('documentation', 'view', 'documentation', 'all'), K('hiring', 'view', 'hiring', 'all'), K('rooms', 'view', 'meeting_rooms', 'all'),
  K('rooms', 'edit', 'meeting_rooms_manage', 'all'), K('guest_link', 'view', 'guest_link', 'all'), K('attendance', 'view', 'attendance', 'all'),
]

// The eleven templates exactly as production holds them on 2026-10-11 (permission_template_grants) —
// with round 2's cells (20261011060000): every portal template books a room; Ultimate, Full and HR
// hold Documentation, Hiring, Meeting rooms and the Guest link whole.
const ROOMS = ' rooms.create:all rooms.view:all'
// HR › Attendance (20261015030000): Ultimate, Full and HR hold it whole.
const ATTENDANCE = ' attendance.approve:all attendance.create:all attendance.edit:all attendance.view:all'
const ROUND2 = ' documentation.create:all documentation.edit:all documentation.view:all guest_link.edit:all guest_link.view:all hiring.approve:all hiring.create:all hiring.edit:all hiring.view:all rooms.create:all rooms.edit:all rooms.view:all'
const everything = (withSwitch: boolean) => Object.entries(FUNCTIONS)
  .filter(([key]) => key !== 'revenue_app' && (withSwitch || key !== 'view_switch'))
  .flatMap(([key, f]) => f.actions.map(a => `${key}.${a}:${f.scopes[f.scopes.length - 1]}`)).join(' ')
export const PROD: Record<string, { cells: string; sensitive: SensitiveField[]; baseRole: string }> = {
  dept_head: { baseRole: 'dept_manager', sensitive: [], cells: 'claims.approve:dept claims.create:own claims.view:dept dashboard.view:all dept_pool.export:dept dept_pool.view:dept dept_reports.export:dept dept_reports.view:dept my_billing.create:dept my_billing.view:dept opex.view:dept team.view:dept' + ROOMS },
  director: { baseRole: 'staff', sensitive: ['salary'], cells: 'approvals.approve:all approvals.view:all claims.create:own claims.view:own dashboard.view:all dept_reports.view:all director_pool.view:all director_salary.approve:all director_salary.view:all reports.export:all reports.view:all team.view:all treasury.approve:all treasury.create:all treasury.export:all treasury.view:all venture_pool.view:all' + ROOMS },
  office: { baseRole: 'staff', sensitive: [], cells: 'approvals.view:all claims.create:own claims.view:own dashboard.view:all reports.view:all team.view:all' + ROOMS },
  // Its claims.approve:all and claims.view:all went with Finance view › Claims (mig 20261016140000; nobody wears it).
  fin_checker: { baseRole: 'finance', sensitive: ['bank'], cells: 'billing.export:all billing.view:all categories.manage:all categories.view:all dashboard.view:all dept_pool.view:all dept_reports.export:all dept_reports.view:all reconciliation.approve:all reconciliation.view:all reports.export:all reports.view:all treasury.approve:all treasury.export:all treasury.view:all venture_pool.export:all venture_pool.view:all' + ROOMS },
  fin_maker: { baseRole: 'finance', sensitive: ['bank'], cells: 'billing.create:all billing.edit:all billing.view:all claims.create:own claims.view:own dashboard.view:all reconciliation.create:all reconciliation.edit:all reconciliation.view:all treasury.create:all treasury.edit:all treasury.view:all venture_pool.create:all venture_pool.view:all' + ROOMS },
  full: { baseRole: 'principal', sensitive: ['salary', 'nric', 'bank'], cells: everything(false) },
  hr: { baseRole: 'hr', sensitive: ['salary', 'nric', 'bank'], cells: 'accounts.view:all claims.create:own claims.view:own dashboard.view:all director_pool.view:all director_salary.edit:all director_salary.view:all hr_costing.create:all hr_costing.edit:all hr_costing.export:all hr_costing.view:all member.manage:all member.view:all revenue.create:all revenue.edit:all revenue.manage:all revenue.view:all team.create:all team.edit:all team.view:all' + ROUND2 + ATTENDANCE },
  revenue_director: { baseRole: 'revenue_member', sensitive: [], cells: 'crm.edit:all crm.manage:all crm.view:all revenue_app.create:own revenue_app.view:own' },
  revenue_team: { baseRole: 'revenue_member', sensitive: [], cells: 'crm.edit:own crm.view:own revenue_app.create:own revenue_app.view:own' },
  staff: { baseRole: 'staff', sensitive: [], cells: 'claims.create:own claims.edit:own claims.view:own dashboard.view:all' + ROOMS },
  ultimate: { baseRole: 'principal', sensitive: ['salary', 'nric', 'bank'], cells: everything(true) },
}
export const cellsOf = (spec: string) => new Map(spec.split(' ').map(c => c.split(':') as [string, Scope]))
export const grantsOf = (spec: string): Grants => {
  const out: Grants = {}
  for (const [cell, scope] of cellsOf(spec)) {
    const [fn, action] = cell.split('.')
    out[fn] = { ...out[fn], [action]: scope }
  }
  return out
}
export const keysOf = (key: string) => {
  const t = PROD[key]
  return new Set(openedKeys(grantsOf(t.cells), t.sensitive, t.baseRole, CELL_KEYS))
}
