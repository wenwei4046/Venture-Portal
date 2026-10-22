import { describe, expect, it } from 'vitest'
import {
  CELL_LABEL,
  type Action,
  type CellKey,
  type Grants,
  type PermFunction,
  type Scope,
  type SensitiveField,
  cellOf,
  changedCells,
  cyclePersonCell,
  cycleNext,
  describeExceptions,
  effectiveGrants,
  exceptionCounts,
  exceptionsOnChangedCells,
  grantsFromRows,
  grantsToRows,
  heldCells,
  keyList,
  openedKeys,
  personCellsFromRows,
  personCellsToRows,
  pruneExceptions,
  sectionTally,
  setCell,
  sodWarnings,
} from './permission-matrix'

// The catalog as migration 20261008120000 seeds it — less My Billing, and Dept
// Pool, OPEX and Department reports at All only (both 20261017160000, when the
// Dept Manager went).
const F = (key: string, label: string, section: string, actions: string, scopes: string): PermFunction => ({
  key, label, section, actions: actions.split(' ') as Action[], scopes: scopes.split(' ') as Scope[], description: null,
})
const FUNCTIONS: PermFunction[] = [
  F('dashboard', 'Overview', 'Daily', 'view', 'all'),
  F('approvals', 'Approvals', 'Daily', 'view approve', 'all'),
  F('treasury', 'Treasury', 'Daily', 'view create edit approve void export', 'all'),
  F('billing', 'Billing', 'Daily', 'view create edit void export', 'all'),
  F('categories', 'Chart of Account', 'Daily', 'view manage', 'all'),
  F('hr_costing', 'HR Costing', 'People', 'view create edit approve export', 'own dept all'),
  F('revenue', 'Revenue Department', 'People', 'view create edit approve export manage', 'own dept all'),
  F('product_list', 'Product list', 'People', 'view edit', 'all'),
  F('director_salary', 'Director Salary', 'People', 'view edit approve', 'all'),
  F('director_pool', 'Director Pool', 'People', 'view edit', 'all'),
  F('team', 'Team & roster', 'People', 'view create edit manage', 'own dept all'),
  F('accounts', 'Logins & invites', 'People', 'view create manage', 'all'),
  F('member', 'Member Services', 'People', 'view manage', 'all'),
  F('revenue_app', 'Revenue app', 'People', 'view create', 'own'),
  // 20261010020000: the CRM joins the matrix.
  F('crm', 'CRM', 'People', 'view edit manage', 'own all'),
  F('dept_pool', 'Dept Pool', 'Departments', 'view export', 'all'),
  F('venture_pool', 'Venture Pool', 'Departments', 'view create edit export', 'all'),
  F('opex', 'OPEX', 'Departments', 'view export', 'all'),
  F('claims', 'Claims', 'Departments', 'view create edit approve void', 'own dept all'),
  F('reports', 'Reports', 'Reports', 'view export', 'all'),
  F('dept_reports', 'Department reports', 'Reports', 'view export', 'all'),
  F('reconciliation', 'Reconciliation', 'Reports', 'view create edit approve', 'all'),
  F('audit_log', 'Audit log', 'Admin', 'view export', 'all'),
  F('settings', 'Settings', 'Admin', 'view manage', 'all'),
  F('view_switch', 'Switch views', 'Admin', 'view', 'all'),
]
const fn = (key: string) => FUNCTIONS.find(f => f.key === key)!

const K = (functionKey: string, action: Action, legacyKey: string, minScope: Scope, gate: CellKey['gate'] = null): CellKey => ({
  functionKey, action, legacyKey, minScope, gate,
})
const CELL_KEYS: CellKey[] = [
  K('dashboard', 'view', 'dashboard', 'own'),
  K('approvals', 'view', 'approvals', 'all', 'principal'),
  // The queue's own key (20261009010000): Approvals · View opens it for anybody.
  K('approvals', 'view', 'approvals_queue', 'all'),
  K('treasury', 'view', 'treasury', 'all', 'treasury'),
  K('treasury', 'approve', 'override', 'all', 'principal'),
  K('billing', 'view', 'billing', 'all', 'treasury'),
  K('categories', 'view', 'categories', 'all', 'treasury'),
  K('hr_costing', 'view', 'hr_costing', 'all', 'salary'),
  K('revenue', 'view', 'revenue', 'all', 'salary'),
  // No gate since 20261014100000: a template ticked at All opens it, whatever its kind.
  K('product_list', 'view', 'product_list', 'all'),
  K('director_salary', 'view', 'director_salary', 'all', 'salary'),
  K('director_pool', 'view', 'director_pool', 'all', 'salary'),
  K('team', 'view', 'team', 'all', 'salary'),
  // People without the staff table (20261010010000, PR4b): Team · View at any reach, no gate.
  K('team', 'view', 'team_directory', 'own'),
  K('accounts', 'create', 'team_invite', 'all', 'principal'),
  K('accounts', 'manage', 'permissions_manage', 'all', 'principal'),
  K('member', 'manage', 'member_requests_manage', 'all'),
  K('member', 'manage', 'member_memos_manage', 'all'),
  K('dept_pool', 'view', 'dept_pool', 'own'),
  K('venture_pool', 'view', 'venture_pool', 'all', 'treasury'),
  K('opex', 'view', 'opex', 'own'),
  K('claims', 'view', 'claims', 'own'),
  K('claims', 'approve', 'claims_approve', 'all'),
  K('reports', 'view', 'reports', 'all', 'treasury'),
  K('dept_reports', 'view', 'dept_reports', 'own'),
  K('reconciliation', 'view', 'reconciliation', 'all', 'treasury'),
  K('audit_log', 'view', 'audit_log', 'all', 'principal'),
  K('settings', 'view', 'settings', 'all', 'principal'),
  K('settings', 'manage', 'department_mode', 'all', 'principal'),
  K('revenue_app', 'view', 'member_portal', 'own'),
  K('revenue_app', 'view', 'member_memos', 'own'),
  K('revenue_app', 'view', 'member_insight', 'own'),
  K('revenue_app', 'create', 'member_quote', 'own'),
  K('revenue_app', 'create', 'member_requests', 'own'),
  K('crm', 'view', 'member_crm', 'own'),
  K('crm', 'manage', 'crm_manage', 'all'),
  K('view_switch', 'view', 'view_switch', 'all', 'principal'),
]

// The design's TEMPLATES (People Management v2.dc.html), parsed the way it parses them.
const parse = (spec: Record<string, string>): Grants => {
  const out: Grants = {}
  for (const [key, cells] of Object.entries(spec)) {
    out[key] = {}
    for (const cell of cells.split(' ')) {
      const [a, s] = cell.split(':')
      out[key]![a as Action] = s as Scope
    }
  }
  return out
}
const everything = (withSwitch: boolean): Grants => {
  const out: Grants = {}
  for (const f of FUNCTIONS) {
    if (f.key === 'revenue_app' || (f.key === 'view_switch' && !withSwitch)) continue
    out[f.key] = Object.fromEntries(f.actions.map(a => [a, f.scopes[f.scopes.length - 1]]))
  }
  return out
}
const T: Record<string, { grants: Grants; sensitive: SensitiveField[]; baseRole: string }> = {
  ultimate: { grants: everything(true), sensitive: ['salary', 'nric', 'bank'], baseRole: 'principal' },
  full: { grants: everything(false), sensitive: ['salary', 'nric', 'bank'], baseRole: 'principal' },
  director: { sensitive: ['salary'], baseRole: 'staff', grants: parse({ dashboard: 'view:all', approvals: 'view:all approve:all', treasury: 'view:all create:all approve:all export:all', reports: 'view:all export:all', dept_reports: 'view:all', director_salary: 'view:all approve:all', director_pool: 'view:all', venture_pool: 'view:all', claims: 'view:own create:own', team: 'view:all' }) },
  office: { sensitive: [], baseRole: 'staff', grants: parse({ dashboard: 'view:all', approvals: 'view:all', reports: 'view:all', team: 'view:all', claims: 'view:own create:own' }) },
  fin_checker: { sensitive: ['bank'], baseRole: 'finance', grants: parse({ dashboard: 'view:all', treasury: 'view:all approve:all export:all', billing: 'view:all export:all', categories: 'view:all manage:all', dept_pool: 'view:all', venture_pool: 'view:all export:all', reports: 'view:all export:all', dept_reports: 'view:all export:all', reconciliation: 'view:all approve:all', claims: 'view:all approve:all' }) },
  fin_maker: { sensitive: ['bank'], baseRole: 'finance', grants: parse({ dashboard: 'view:all', treasury: 'view:all create:all edit:all', billing: 'view:all create:all edit:all', venture_pool: 'view:all create:all', reconciliation: 'view:all create:all edit:all', claims: 'view:own create:own' }) },
  hr: { sensitive: ['salary', 'nric', 'bank'], baseRole: 'hr', grants: parse({ dashboard: 'view:all', hr_costing: 'view:all create:all edit:all export:all', revenue: 'view:all edit:all', director_salary: 'view:all edit:all', director_pool: 'view:all', team: 'view:all create:all edit:all', accounts: 'view:all', claims: 'view:own create:own', member: 'view:all manage:all' }) },
  staff: { sensitive: [], baseRole: 'staff', grants: parse({ dashboard: 'view:all', claims: 'view:own create:own edit:own' }) },
  revenue_team: { sensitive: [], baseRole: 'revenue_member', grants: parse({ revenue_app: 'view:own create:own', crm: 'view:own edit:own' }) },
  revenue_director: { sensitive: [], baseRole: 'revenue_member', grants: parse({ revenue_app: 'view:own create:own', crm: 'view:all edit:all manage:all' }) },
}

// Production's role defaults (2026-10-08).
const PRINCIPAL = ['approvals', 'audit_log', 'billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'department_mode',
  'dept_pool', 'dept_reports', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage', 'member_requests_manage',
  'opex', 'override', 'payroll_payouts', 'permissions_manage', 'product_list', 'reconciliation', 'reports', 'revenue',
  'salary_individual', 'settings', 'team', 'team_invite', 'treasury', 'venture_pool', 'crm_manage']
const FINANCE = ['billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'dept_pool', 'dept_reports', 'reconciliation',
  'reports', 'treasury', 'venture_pool']
const REVENUE_MEMBER = ['member_insight', 'member_memos', 'member_portal', 'member_quote', 'member_requests']
/** What a Revenue Team title opens since 20261010020000: the member app's keys and its own CRM. */
const REVENUE_TEAM = [...REVENUE_MEMBER, 'member_crm'].sort()

describe('cycling a cell', () => {
  it('runs · → each reach the function allows, narrowest first → ·', () => {
    const claims = fn('claims')
    expect([cycleNext(claims, 'none'), cycleNext(claims, 'own'), cycleNext(claims, 'dept'), cycleNext(claims, 'all')])
      .toEqual(['own', 'dept', 'all', 'none'])
    // Dept Pool offers All only since the Dept Manager went (20261017160000).
    expect(cycleNext(fn('dept_pool'), 'none')).toBe('all')
    expect(cycleNext(fn('treasury'), 'none')).toBe('all')
    expect(cycleNext(fn('treasury'), 'all')).toBe('none')
  })
})

describe('View coupling', () => {
  it('any action brings View up with it', () => {
    const g = setCell({}, fn('treasury'), 'approve', 'all')
    expect(g.treasury).toEqual({ approve: 'all', view: 'all' })
    const claims = setCell({ claims: { view: 'own' } }, fn('claims'), 'create', 'dept')
    expect(claims.claims).toEqual({ view: 'dept', create: 'dept' })
  })

  it('never lowers View when an action is set below it', () => {
    expect(setCell({ claims: { view: 'all' } }, fn('claims'), 'create', 'own').claims).toEqual({ view: 'all', create: 'own' })
  })

  it('lowering View lowers every action above it, and · clears them', () => {
    const start: Grants = { claims: { view: 'all', create: 'all', approve: 'dept', edit: 'own' } }
    expect(setCell(start, fn('claims'), 'view', 'own').claims).toEqual({ view: 'own', create: 'own', approve: 'own', edit: 'own' })
    expect(setCell(start, fn('claims'), 'view', 'none').claims).toBeUndefined()
  })

  it('leaves the other functions alone and does not mutate its input', () => {
    const start: Grants = { dashboard: { view: 'all' } }
    const next = setCell(start, fn('treasury'), 'view', 'all')
    expect(start).toEqual({ dashboard: { view: 'all' } })
    expect(next).toEqual({ dashboard: { view: 'all' }, treasury: { view: 'all' } })
  })
})

describe('maker and checker', () => {
  it('the Director template trips it on Treasury, as the design intends', () => {
    expect(sodWarnings(T.director.grants, FUNCTIONS)).toEqual([
      'Treasury: Create and Approve are both granted — one person could raise and approve the same item.',
    ])
  })

  it('raising your own claim and approving wider is ordinary practice', () => {
    expect(sodWarnings({ claims: { view: 'dept', create: 'own', approve: 'dept' } }, FUNCTIONS)).toEqual([])
    expect(sodWarnings({ claims: { view: 'all', create: 'own', approve: 'own' } }, FUNCTIONS)).toHaveLength(1)
  })

  it('the checker and the maker are each clean', () => {
    expect(sodWarnings(T.fin_checker.grants, FUNCTIONS)).toEqual([])
    expect(sodWarnings(T.fin_maker.grants, FUNCTIONS)).toEqual([])
  })
})

describe('the keys list and the tallies', () => {
  it('lists cells in the matrix order, then the sensitive fields', () => {
    expect(keyList(T.staff.grants, [], FUNCTIONS)).toEqual(['dashboard.view:all', 'claims.view:own', 'claims.create:own', 'claims.edit:own'])
    expect(keyList(T.fin_maker.grants, ['bank'], FUNCTIONS).at(-1)).toBe('sensitive.bank')
    expect(keyList(T.full.grants, ['bank', 'salary', 'nric'], FUNCTIONS).slice(-3))
      .toEqual(['sensitive.salary', 'sensitive.nric', 'sensitive.bank'])
  })

  it('a section tally counts functions with anything granted', () => {
    const daily = FUNCTIONS.filter(f => f.section === 'Daily')
    expect(sectionTally(T.fin_checker.grants, daily)).toBe('4/5')
    expect(sectionTally(T.staff.grants, daily)).toBe('1/5')
  })

  it('round-trips through the stored rows', () => {
    const rows = grantsToRows(T.hr.grants, FUNCTIONS)
    expect(rows[0]).toEqual({ function_key: 'dashboard', action: 'view', scope: 'all' })
    expect(grantsFromRows(rows)).toEqual(T.hr.grants)
    expect(grantsFromRows([{ function_key: 'claims', action: 'fly', scope: 'all' }, { function_key: 'claims', action: 'view', scope: 'galaxy' }])).toEqual({})
  })

  it('names exactly the cells a draft changes', () => {
    const draft = setCell(T.staff.grants, fn('dept_reports'), 'view', 'all')
    expect(changedCells(T.staff.grants, draft, FUNCTIONS)).toEqual(['dept_reports.view'])
    expect(changedCells(T.staff.grants, T.staff.grants, FUNCTIONS)).toEqual([])
  })
})

describe('one person', () => {
  // The design's own examples: TAN raised on the Audit log, SITI held back from exporting HR Costing.
  it('raised and lowered, over the template', () => {
    const tan = { 'audit_log.view': 'all' } as const
    expect(exceptionCounts(T.fin_checker.grants, tan)).toEqual({ raised: 1, lowered: 0 })
    expect(cellOf(effectiveGrants(T.fin_checker.grants, tan), 'audit_log', 'view')).toBe('all')
    const siti = { 'hr_costing.export': 'none' } as const
    expect(exceptionCounts(T.hr.grants, siti)).toEqual({ raised: 0, lowered: 1 })
    expect(cellOf(effectiveGrants(T.hr.grants, siti), 'hr_costing', 'export')).toBe('none')
    expect(T.hr.grants.hr_costing?.export).toBe('all')
  })

  it('cycling back to the template drops the exception instead of storing a copy', () => {
    let own = cyclePersonCell(T.staff.grants, {}, fn('hr_costing'), 'view')
    expect(own).toEqual({ 'hr_costing.view': 'own' })
    own = cyclePersonCell(T.staff.grants, own, fn('hr_costing'), 'view')
    expect(own).toEqual({ 'hr_costing.view': 'dept' })
    own = cyclePersonCell(T.staff.grants, own, fn('hr_costing'), 'view')
    expect(own).toEqual({ 'hr_costing.view': 'all' })
    own = cyclePersonCell(T.staff.grants, own, fn('hr_costing'), 'view')
    expect(own).toEqual({})
    expect(cyclePersonCell(T.staff.grants, {}, fn('claims'), 'view')).toEqual({ 'claims.view': 'dept' })
  })

  it('asks about exactly the people whose own cells a save changes', () => {
    const siti = { name: 'SITI', cells: { 'hr_costing.export': 'none' as const } }
    const wong = { name: 'WONG', cells: { 'team.manage': 'all' as const } }
    const lowered = setCell(T.hr.grants, fn('hr_costing'), 'export', 'none')
    expect(exceptionsOnChangedCells([siti, wong], T.hr.grants, lowered, FUNCTIONS)).toEqual([
      { person: siti, cells: ['hr_costing.export'] },
    ])
    const elsewhere = setCell(T.hr.grants, fn('reports'), 'view', 'all')
    expect(exceptionsOnChangedCells([siti, wong], T.hr.grants, elsewhere, FUNCTIONS)).toEqual([])
  })

  it('an exception the template has since caught up with is dropped', () => {
    expect(pruneExceptions(T.hr.grants, { 'hr_costing.export': 'all', 'team.manage': 'all' })).toEqual({ 'team.manage': 'all' })
  })

  it('reads as the Personal exceptions column does', () => {
    expect(describeExceptions('SR', { 'hr_costing.export': 'none', 'audit_log.view': 'all' }))
      .toEqual(['SR audit_log.view:all', 'SR hr_costing.export:✕'])
  })

  it('round-trips through the stored rows (✕ is a NULL scope)', () => {
    const rows = [{ function_key: 'hr_costing', action: 'export', scope: null }, { function_key: 'audit_log', action: 'view', scope: 'all' }]
    const own = personCellsFromRows(rows)
    expect(own).toEqual({ 'hr_costing.export': 'none', 'audit_log.view': 'all' })
    expect(personCellsToRows(own)).toEqual(rows)
  })
})

describe('what a template opens today — the database rule, in TypeScript', () => {
  const opens = (key: keyof typeof T) => openedKeys(T[key].grants, T[key].sensitive, T[key].baseRole, CELL_KEYS)

  it('Ultimate and Full are the Principal role (and the queue and the directory); only Ultimate switches views', () => {
    expect(opens('ultimate')).toEqual([...PRINCIPAL, 'approvals_queue', 'member_crm', 'team_directory', 'view_switch'].sort())
    expect(opens('full')).toEqual([...PRINCIPAL, 'approvals_queue', 'member_crm', 'team_directory'].sort())
  })

  it('the checker and the Revenue team are their old roles exactly', () => {
    expect(opens('fin_checker')).toEqual(FINANCE)
    expect(opens('revenue_team')).toEqual(REVENUE_TEAM)
  })

  it('Team · View at Dept opens the directory (PR4b, 2026-10-10) — its own department’s roster and the company chart, never the staff table', () => {
    expect(openedKeys(parse({ team: 'view:dept' }), [], 'staff', CELL_KEYS)).toEqual(['team_directory'])
  })

  // 20261010020000 (2026-10-10): the CRM in the matrix — a Revenue app account
  // may hold its keys, so the Revenue Director's Control panel is in force.
  it('opens the CRM: the Revenue team its own, the Revenue Director the Control panel', () => {
    expect(opens('revenue_director')).toEqual([...REVENUE_MEMBER, 'crm_manage', 'member_crm'].sort())
    const held = (key: keyof typeof T) => heldCells(T[key].grants, T[key].sensitive, T[key].baseRole, CELL_KEYS, FUNCTIONS)
    expect(held('revenue_team')).toEqual([])
    expect(held('revenue_director')).toEqual([])
    // Manage opens only at All; nothing short of it is the Control panel.
    const ownManager = setCell(T.revenue_team.grants, fn('crm'), 'manage', 'own')
    expect(openedKeys(ownManager, [], 'revenue_member', CELL_KEYS)).not.toContain('crm_manage')
  })

  // 20261014100000 (2026-10-14): the user ticked Product List View + Edit on the
  // Revenue Director template and read "Does not open — only a full-access
  // template opens it"; PETER's sidebar had no Product List.
  it('opens the Product List to the Revenue Director template that ticks it — and nothing else', () => {
    const ticked = setCell(setCell(T.revenue_director.grants, fn('product_list'), 'view', 'all'), fn('product_list'), 'edit', 'all')
    expect(openedKeys(ticked, [], 'revenue_member', CELL_KEYS)).toEqual([...REVENUE_MEMBER, 'crm_manage', 'member_crm', 'product_list'].sort())
    expect(heldCells(ticked, [], 'revenue_member', CELL_KEYS, FUNCTIONS)).toEqual([])
    // Before: the Principal's gate held it back, and a Revenue app account could not hold the key.
    const gated = CELL_KEYS.map(k => (k.legacyKey === 'product_list' ? { ...k, gate: 'principal' as const } : k))
    const before = heldCells(ticked, [], 'revenue_member', gated, FUNCTIONS)
    expect(before.map(h => h.key).sort()).toEqual(['product_list.edit', 'product_list.view'])
    expect(before.every(h => /only a full-access template opens it/.test(h.reason))).toBe(true)
    // Ticked short of All it stays closed, and says so.
    const own = setCell(T.revenue_director.grants, fn('product_list'), 'view', 'own')
    expect(openedKeys(own, [], 'revenue_member', CELL_KEYS)).not.toContain('product_list')
  })

  it('holds back what a module key would open wider than the cell', () => {
    // The queue's own key (2026-10-09) opens for Approvals · View; the admin-scope
    // `approvals` key still needs an owner's template.
    expect(opens('director')).toEqual(['approvals_queue', 'claims', 'dashboard', 'dept_reports', 'director_pool', 'director_salary',
      'payroll_payouts', 'reports', 'salary_individual', 'team', 'team_directory', 'treasury', 'venture_pool'])
    // Team · View without Salary amounts: the directory, not the `team` key (PR4b).
    expect(opens('office')).toEqual(['approvals_queue', 'claims', 'dashboard', 'team_directory'])
    expect(opens('staff')).toEqual(['claims', 'dashboard'])
    expect(opens('hr')).toEqual(['claims', 'dashboard', 'director_pool', 'director_salary', 'hr_costing',
      'member_memos_manage', 'member_requests_manage', 'payroll_payouts', 'revenue', 'salary_individual', 'team', 'team_directory'])
  })

  it('says why, cell by cell', () => {
    const held = (key: keyof typeof T) => heldCells(T[key].grants, T[key].sensitive, T[key].baseRole, CELL_KEYS, FUNCTIONS)
    // Team · View is in force without Salary amounts since PR4b (the directory).
    expect(held('office').map(h => h.key)).toEqual(['reports.view'])
    expect(held('office').find(h => h.key === 'reports.view')?.reason).toMatch(/Treasury · View/)
    const deptApprover = heldCells(setCell(T.staff.grants, fn('claims'), 'approve', 'dept'), [], 'staff', CELL_KEYS, FUNCTIONS)
    expect(deptApprover.map(h => h.key)).toEqual(['claims.approve'])
    expect(deptApprover[0].reason).toMatch(/^Dept is not enforced/)
    // Since PR2 a write asks for its cell: Treasury · Approve (amending a booked
    // loan) is in force wherever Treasury opens, and since approvals go by
    // domain the queue opens on its own key — a Director's Approve is in force.
    expect(held('director')).toEqual([])
    expect(held('full')).toEqual([])
    expect(held('fin_checker')).toEqual([])
    // Own claims are raised at Own; a reach short of what the gate asks is said.
    expect(held('staff')).toEqual([])
    const ownApprover = setCell(T.staff.grants, fn('claims'), 'approve', 'own')
    expect(heldCells(ownApprover, [], 'staff', CELL_KEYS, FUNCTIONS).map(h => h.reason))
      .toEqual([expect.stringMatching(/^Own is not enforced on this yet.*All opens it now$/)])
  })

  it('a person raised on a cell opens it only where the rule allows', () => {
    const hr = T.hr
    const raised = effectiveGrants(hr.grants, { 'dept_pool.view': 'all', 'audit_log.view': 'all', 'reports.view': 'all' })
    const keys = openedKeys(raised, hr.sensitive, hr.baseRole, CELL_KEYS)
    expect(keys).toContain('dept_pool')
    expect(keys).not.toContain('audit_log')
    expect(keys).not.toContain('reports')
    const revenue = effectiveGrants(T.revenue_team.grants, { 'dashboard.view': 'all' })
    expect(openedKeys(revenue, [], 'revenue_member', CELL_KEYS)).toEqual(REVENUE_TEAM)
  })

  it('labels every cell value', () => {
    expect(Object.values(CELL_LABEL)).toEqual(['·', 'Own', 'Dept', 'All'])
  })
})
