import { describe, expect, it } from 'vitest'
import { openedKeys, type Action, type CellKey, type Grants, type PersonCells, type Scope, type SensitiveField } from './permission-matrix'
import { viewKeysOf, type FunctionKey } from './permission-actions'
import {
  PERMISSION_TABS, TAB_VIEWS, boxesOf, cellRows, cellsFromTabs, cellsOutOfStep, gainsOf, grantOf, hasBox, lossesOf, parseGrant, personCellRows,
  personTicks, reapplied, sameTicks, tabsFromCells, templateTicks, ticksOfPerson, toggleBox, toggleRow, viewCount,
} from './permission-tabs'

// `permission_functions` on production (2026-10-11): each function's actions and reaches.
const FUNCTIONS: Record<string, { actions: Action[]; scopes: Scope[] }> = {
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
}

// `permission_cell_keys` (as permission-matrix.test.ts holds it).
const K = (functionKey: string, action: Action, legacyKey: string, minScope: Scope, gate: CellKey['gate'] = null): CellKey => ({ functionKey, action, legacyKey, minScope, gate })
const CELL_KEYS: CellKey[] = [
  K('dashboard', 'view', 'dashboard', 'own'), K('approvals', 'view', 'approvals', 'all', 'principal'), K('approvals', 'view', 'approvals_queue', 'all'),
  K('treasury', 'view', 'treasury', 'all', 'treasury'), K('treasury', 'approve', 'override', 'all', 'principal'), K('billing', 'view', 'billing', 'all', 'treasury'),
  K('categories', 'view', 'categories', 'all', 'treasury'), K('hr_costing', 'view', 'hr_costing', 'all', 'salary'), K('revenue', 'view', 'revenue', 'all', 'salary'),
  K('product_list', 'view', 'product_list', 'all', 'principal'), K('director_salary', 'view', 'director_salary', 'all', 'salary'),
  K('director_pool', 'view', 'director_pool', 'all', 'salary'), K('team', 'view', 'team', 'all', 'salary'), K('team', 'view', 'team_directory', 'own'),
  K('accounts', 'create', 'team_invite', 'all', 'principal'), K('accounts', 'manage', 'permissions_manage', 'all', 'principal'),
  K('member', 'manage', 'member_requests_manage', 'all'), K('member', 'manage', 'member_memos_manage', 'all'), K('dept_pool', 'view', 'dept_pool', 'own'),
  K('venture_pool', 'view', 'venture_pool', 'all', 'treasury'), K('opex', 'view', 'opex', 'own'), K('my_billing', 'view', 'my_billing', 'own'),
  K('claims', 'view', 'claims', 'own'), K('claims', 'approve', 'claims_approve', 'all'), K('reports', 'view', 'reports', 'all', 'treasury'),
  K('dept_reports', 'view', 'dept_reports', 'own'), K('reconciliation', 'view', 'reconciliation', 'all', 'treasury'), K('audit_log', 'view', 'audit_log', 'all', 'principal'),
  K('settings', 'view', 'settings', 'all', 'principal'), K('settings', 'manage', 'department_mode', 'all', 'principal'), K('revenue_app', 'view', 'member_portal', 'own'),
  K('revenue_app', 'view', 'member_memos', 'own'), K('revenue_app', 'view', 'member_insight', 'own'), K('revenue_app', 'create', 'member_quote', 'own'),
  K('revenue_app', 'create', 'member_requests', 'own'), K('crm', 'view', 'member_crm', 'own'), K('crm', 'manage', 'crm_manage', 'all'),
  K('view_switch', 'view', 'view_switch', 'all', 'principal'),
]

// The eleven templates exactly as production holds them on 2026-10-11 (permission_template_grants).
const everything = (withSwitch: boolean) => Object.entries(FUNCTIONS)
  .filter(([key]) => key !== 'revenue_app' && (withSwitch || key !== 'view_switch'))
  .flatMap(([key, f]) => f.actions.map(a => `${key}.${a}:${f.scopes[f.scopes.length - 1]}`)).join(' ')
const PROD: Record<string, { cells: string; sensitive: SensitiveField[]; baseRole: string }> = {
  dept_head: { baseRole: 'dept_manager', sensitive: [], cells: 'claims.approve:dept claims.create:own claims.view:dept dashboard.view:all dept_pool.export:dept dept_pool.view:dept dept_reports.export:dept dept_reports.view:dept my_billing.create:dept my_billing.view:dept opex.view:dept team.view:dept' },
  director: { baseRole: 'staff', sensitive: ['salary'], cells: 'approvals.approve:all approvals.view:all claims.create:own claims.view:own dashboard.view:all dept_reports.view:all director_pool.view:all director_salary.approve:all director_salary.view:all reports.export:all reports.view:all team.view:all treasury.approve:all treasury.create:all treasury.export:all treasury.view:all venture_pool.view:all' },
  office: { baseRole: 'staff', sensitive: [], cells: 'approvals.view:all claims.create:own claims.view:own dashboard.view:all reports.view:all team.view:all' },
  fin_checker: { baseRole: 'finance', sensitive: ['bank'], cells: 'billing.export:all billing.view:all categories.manage:all categories.view:all claims.approve:all claims.view:all dashboard.view:all dept_pool.view:all dept_reports.export:all dept_reports.view:all reconciliation.approve:all reconciliation.view:all reports.export:all reports.view:all treasury.approve:all treasury.export:all treasury.view:all venture_pool.export:all venture_pool.view:all' },
  fin_maker: { baseRole: 'finance', sensitive: ['bank'], cells: 'billing.create:all billing.edit:all billing.view:all claims.create:own claims.view:own dashboard.view:all reconciliation.create:all reconciliation.edit:all reconciliation.view:all treasury.create:all treasury.edit:all treasury.view:all venture_pool.create:all venture_pool.view:all' },
  full: { baseRole: 'principal', sensitive: ['salary', 'nric', 'bank'], cells: everything(false) },
  hr: { baseRole: 'hr', sensitive: ['salary', 'nric', 'bank'], cells: 'accounts.view:all claims.create:own claims.view:own dashboard.view:all director_pool.view:all director_salary.edit:all director_salary.view:all hr_costing.create:all hr_costing.edit:all hr_costing.export:all hr_costing.view:all member.manage:all member.view:all revenue.create:all revenue.edit:all revenue.manage:all revenue.view:all team.create:all team.edit:all team.view:all' },
  revenue_director: { baseRole: 'revenue_member', sensitive: [], cells: 'crm.edit:all crm.manage:all crm.view:all revenue_app.create:own revenue_app.view:own' },
  revenue_team: { baseRole: 'revenue_member', sensitive: [], cells: 'crm.edit:own crm.view:own revenue_app.create:own revenue_app.view:own' },
  staff: { baseRole: 'staff', sensitive: [], cells: 'claims.create:own claims.edit:own claims.view:own dashboard.view:all' },
  ultimate: { baseRole: 'principal', sensitive: ['salary', 'nric', 'bank'], cells: everything(true) },
}
const cellsOf = (spec: string) => new Map(spec.split(' ').map(c => c.split(':') as [string, Scope]))
const grantsOf = (spec: string): Grants => {
  const out: Grants = {}
  for (const [cell, scope] of cellsOf(spec)) {
    const [fn, action] = cell.split('.')
    out[fn] = { ...out[fn], [action]: scope }
  }
  return out
}
const keysOf = (key: string) => {
  const t = PROD[key]
  return new Set(openedKeys(grantsOf(t.cells), t.sensitive, t.baseRole, CELL_KEYS))
}
const moved = (key: string) => tabsFromCells(cellsOf(PROD[key].cells), keysOf(key))
/** The cells that take effect today: a cell counts only while its function's pages open (canDo, has_action). */
const held = (key: string) => {
  const keys = keysOf(key)
  return new Map([...cellsOf(PROD[key].cells)].filter(([cell]) => {
    const opens = viewKeysOf(cell.split('.')[0] as FunctionKey)
    return opens.length === 0 || opens.some(k => keys.has(k))
  }))
}
const views = (grants: Set<string>) => TAB_VIEWS.filter(v => viewCount(v.id, grants).seen > 0).map(v => v.id)

describe('the tab catalog (HR revamp 8)', () => {
  it('names every cell a function really has, at a reach it allows', () => {
    for (const t of PERMISSION_TABS) {
      for (const cells of Object.values(t.opens)) {
        for (const cell of cells ?? []) {
          const [fn, action] = cell.split('.')
          expect(FUNCTIONS[fn]?.actions, `${t.id} → ${cell}`).toContain(action)
          expect(FUNCTIONS[fn]?.scopes, `${t.id} → ${cell} at ${t.reach}`).toContain(t.reach)
        }
      }
    }
  })

  it('has one id per tab, an Overview in every portal view, and the handoff’s lists in order', () => {
    expect(new Set(PERMISSION_TABS.map(t => t.id)).size).toBe(PERMISSION_TABS.length)
    for (const v of ['hr', 'fin', 'pri', 'dept']) expect(PERMISSION_TABS.find(t => t.id === `${v}.overview`)).toBeDefined()
    expect(PERMISSION_TABS.filter(t => t.view === 'hr').map(t => t.label)).toEqual([
      'Overview', 'HR Costing', 'Payroll', 'Payment', 'Director Salary', 'Director Pool', 'Comm Cal', 'Sales Groups', 'Rules',
      'People Management', 'Permissions', 'Hierarchy', 'Member Services', 'Audit Log',
    ])
    expect(PERMISSION_TABS.filter(t => t.view === 'rev').map(t => t.label).slice(0, 8)).toEqual([
      'Today', 'Insight', 'Quote', 'Arena', 'Profile · My income', 'Profile · Requests', 'Profile · Waiting list & replacements', 'Profile · Team & capacity',
    ])
  })

  it('reads a stored box back, and refuses one that does not exist', () => {
    expect(parseGrant('hr.payroll.edit')?.tab.label).toBe('Payroll')
    expect(parseGrant('hr.overview.create')).toBeNull()
    expect(parseGrant('nope.view')).toBeNull()
    expect(hasBox(PERMISSION_TABS.find(t => t.id === 'hr.director_pool')!, 'approve')).toBe(false)
  })

  it('derives the cells underneath: the user’s merges, the widest reach', () => {
    expect([...cellsFromTabs(['fin.payments.view', 'fin.payments.approve', 'dept.my_claims.create', 'fin.claims.create'])].sort()).toEqual([
      ['claims.create', 'all'], ['treasury.approve', 'all'], ['treasury.export', 'all'], ['treasury.view', 'all'], ['treasury.void', 'all'],
    ])
    expect(cellsFromTabs(['dept.my_claims.view']).get('claims.view')).toBe('own')
  })
})

describe('moving the eleven templates onto tabs loses nothing', () => {
  it.each(Object.keys(PROD))('%s keeps every cell it held', key => {
    expect(lossesOf(held(key), moved(key))).toEqual([])
  })

  // What a template gains when it is next saved — the cells its ticks write that it did not store:
  // the user's merges only (point 2: export with view, void with approve, manage with edit).
  it('gains only the merges the user chose', () => {
    const gains = Object.fromEntries(Object.keys(PROD).map(k => [k, gainsOf(cellsOf(PROD[k].cells), moved(k))]))
    expect(gains).toEqual({
      dept_head: ['claims.void:dept', 'opex.export:dept'],
      director: ['dept_reports.export:all', 'treasury.void:all', 'venture_pool.export:all'],
      fin_checker: ['claims.void:all', 'dept_pool.export:all', 'treasury.void:all'],
      fin_maker: ['billing.export:all', 'treasury.export:all', 'venture_pool.export:all'],
      full: [],
      hr: ['revenue.export:all', 'team.manage:all'],
      office: [],
      revenue_director: [],
      revenue_team: [],
      staff: [],
      ultimate: [],
    })
  })

  // A stored cell that opened nothing (its pages were held back) is not carried over.
  it('drops only cells that opened nothing', () => {
    const drops = Object.fromEntries(Object.keys(PROD).map(k => [k, lossesOf(cellsOf(PROD[k].cells), moved(k))]).filter(([, d]) => d.length))
    expect(drops).toEqual({ office: ['reports.view:all'] })
  })

  it('puts each template in the views its pages are in — the company-wide ones out of the Department view', () => {
    expect(views(moved('full'))).toEqual(['hr', 'fin', 'pri', 'rev'])
    expect(views(moved('fin_maker'))).toEqual(['fin', 'dept'])
    expect(views(moved('dept_head'))).toEqual(['dept'])
    expect(views(moved('staff'))).toEqual(['dept'])
    expect(views(moved('hr'))).toEqual(['hr', 'dept'])
    expect(views(moved('revenue_team'))).toEqual(['rev'])
    expect([...moved('staff')].sort()).toEqual(['dept.my_claims.create', 'dept.my_claims.edit', 'dept.my_claims.view', 'dept.overview.view'])
  })
})

it('counts a view the way the rail does', () => {
  expect(viewCount('rev', new Set([grantOf('rev.today', 'view'), grantOf('rev.quote', 'create')]))).toEqual({ seen: 1, of: 11 })
})

describe('what the Permissions tab and a person’s window work with', () => {
  it('ticks a box with its View, and taking View away takes the tab', () => {
    const on = toggleBox(new Set(), 'fin.payments', 'approve')
    expect([...on].sort()).toEqual(['fin.payments.approve', 'fin.payments.view'])
    expect([...toggleBox(on, 'fin.payments', 'view')]).toEqual([])
    expect([...toggleBox(new Set(), 'hr.overview', 'create')]).toEqual([])
  })

  it('“all” ticks every box a tab has, and again none', () => {
    const all = toggleRow(new Set(), 'hr.director_pool')
    expect([...all].sort()).toEqual(['hr.director_pool.edit', 'hr.director_pool.view'])
    expect(toggleRow(all, 'hr.director_pool').size).toBe(0)
  })

  it('writes the cells the ticks stand for, the database’s way', () => {
    expect(cellRows(['dept.my_claims.view', 'dept.my_claims.create'])).toEqual([
      { function_key: 'claims', action: 'create', scope: 'own' },
      { function_key: 'claims', action: 'view', scope: 'own' },
    ])
  })

  it('a template shows the ticks it stored, else the ones its cells give', () => {
    const stored = templateTicks({ grants: {}, sensitive: [], baseRole: 'staff', tabs: ['dept.my_claims.view', 'nope.view'] }, CELL_KEYS)
    expect([...stored]).toEqual(['dept.my_claims.view'])
    const t = PROD.staff
    expect(templateTicks({ grants: grantsOf(t.cells), sensitive: t.sensitive, baseRole: t.baseRole, tabs: null }, CELL_KEYS)).toEqual(moved('staff'))
  })

  it('lays a person’s boxes over the title, and writes only the cells that differ', () => {
    const base = moved('fin_maker')
    // carrie on production: void on invoices, held back from Reconciliation.
    const ticks = personTicks(base, [
      { tab: 'fin.invoice', action: 'approve', granted: true },
      { tab: 'fin.reconciliation', action: 'view', granted: false }, { tab: 'fin.reconciliation', action: 'create', granted: false }, { tab: 'fin.reconciliation', action: 'edit', granted: false },
      { tab: 'fin.journal_entries', action: 'view', granted: false }, { tab: 'fin.journal_entries', action: 'create', granted: false }, { tab: 'fin.journal_entries', action: 'edit', granted: false },
    ])
    expect(boxesOf(base, ticks)).toHaveLength(7)
    expect(personCellRows(cellsOf(PROD.fin_maker.cells), ticks)).toEqual([
      { function_key: 'billing', action: 'export', scope: 'all' },
      { function_key: 'billing', action: 'void', scope: 'all' },
      { function_key: 'reconciliation', action: 'create', scope: null },
      { function_key: 'reconciliation', action: 'edit', scope: null },
      { function_key: 'reconciliation', action: 'view', scope: null },
      { function_key: 'treasury', action: 'export', scope: 'all' },
      { function_key: 'venture_pool', action: 'export', scope: 'all' },
    ])
    expect(sameTicks(personTicks(base, []), base)).toBe(true)
  })

  it('a box whose tab they cannot View is not theirs', () => {
    const ticks = personTicks(new Set(['dept.overview.view']), [{ tab: 'fin.invoice', action: 'approve', granted: true }])
    expect([...ticks]).toEqual(['dept.overview.view'])
  })
})

// carrie on production (2026-10-11): Finance · Maker, with six cells of her own from before tabs.
const CARRIE: PersonCells = {
  'billing.export': 'all', 'billing.void': 'all', 'treasury.export': 'all',
  'reconciliation.create': 'none', 'reconciliation.edit': 'none', 'reconciliation.view': 'none',
}
const record = (key: string, tabs: string[] | null = null) => ({ grants: grantsOf(PROD[key].cells), sensitive: PROD[key].sensitive, baseRole: PROD[key].baseRole, tabs })
const theirs = (key: string, cells: PersonCells, boxes: Parameters<typeof personTicks>[1] = []) => ticksOfPerson(record(key), { boxes, cells }, CELL_KEYS)
const savedAs = (ticks: Set<string>) => ({ ticks, cells: cellsFromTabs(ticks) })

describe('a person’s own boxes follow their template', () => {
  it('reads a person’s ticks: their boxes over the title, else what their own cells give, else the title’s', () => {
    expect(theirs('staff', {})).toEqual(moved('staff'))
    expect(theirs('staff', {}, [{ tab: 'dept.my_claims', action: 'edit', granted: false }]).has('dept.my_claims.edit')).toBe(false)
    // carrie’s cells: void on billing (both of its tabs’ Approve), held back from Reconciliation and Journal Entries.
    expect(boxesOf(moved('fin_maker'), theirs('fin_maker', CARRIE))).toEqual([
      { tab: 'fin.billing_allocator', action: 'approve', granted: true },
      { tab: 'fin.invoice', action: 'approve', granted: true },
      { tab: 'fin.journal_entries', action: 'create', granted: false },
      { tab: 'fin.journal_entries', action: 'edit', granted: false },
      { tab: 'fin.journal_entries', action: 'view', granted: false },
      { tab: 'fin.reconciliation', action: 'create', granted: false },
      { tab: 'fin.reconciliation', action: 'edit', granted: false },
      { tab: 'fin.reconciliation', action: 'view', granted: false },
    ])
  })

  it('her template’s first save on tabs: her boxes kept, her cells only what the template no longer gives', () => {
    const before = moved('fin_maker')
    const again = reapplied(before, theirs('fin_maker', CARRIE), savedAs(before))
    expect(again.tabs).toHaveLength(8)
    // The exports are the template’s own now (the user’s merge), so they are no longer hers.
    expect(again.cells).toEqual([
      { function_key: 'billing', action: 'void', scope: 'all' },
      { function_key: 'reconciliation', action: 'create', scope: null },
      { function_key: 'reconciliation', action: 'edit', scope: null },
      { function_key: 'reconciliation', action: 'view', scope: null },
    ])
    // And she loses none of the cells she held.
    const held = new Map([...cellsOf(PROD.fin_maker.cells)].filter(([c]) => !c.startsWith('reconciliation.')))
    for (const c of ['billing.export', 'billing.void', 'treasury.export']) held.set(c, 'all')
    expect(lossesOf(held, personTicks(before, again.tabs))).toEqual([])
  })

  it('a box held back from one tab does not hold back what the template later gives through another', () => {
    const before = moved('staff')
    const mine = personTicks(before, [{ tab: 'dept.my_claims', action: 'edit', granted: false }])
    expect(personCellRows(cellsOf(PROD.staff.cells), mine)).toEqual([{ function_key: 'claims', action: 'edit', scope: null }])
    // Later the template edits everybody’s claims (Finance › Claims · Edit): their old ✕ would have closed it.
    const after = new Set([...before, 'fin.overview.view', 'fin.claims.view', 'fin.claims.edit'])
    expect(reapplied(before, mine, savedAs(after))).toEqual({ tabs: [{ tab: 'dept.my_claims', action: 'edit', granted: false }], cells: [] })
  })

  it('a cell given with an old tick does not outlive it', () => {
    const before = moved('fin_maker')
    const mine = personTicks(before, [{ tab: 'fin.invoice', action: 'approve', granted: true }])
    // The template stops showing Invoice at all: Approve on it goes with it, and billing.void with that.
    const after = new Set([...before].filter(g => !g.startsWith('fin.invoice.') && !g.startsWith('fin.billing_allocator.')))
    expect(reapplied(before, mine, savedAs(after))).toEqual({ tabs: [], cells: [] })
  })

  it('says when their stored cells are not what their boxes give over today’s template', () => {
    const base = moved('staff')
    const mine = personTicks(base, [{ tab: 'dept.my_claims', action: 'edit', granted: false }])
    expect(cellsOutOfStep(cellsOf(PROD.staff.cells), mine, { 'claims.edit': 'none' })).toBe(false)
    expect(cellsOutOfStep(cellsOf(PROD.staff.cells), mine, {})).toBe(true)
    expect(cellsOutOfStep(cellsOf(PROD.staff.cells), mine, { 'claims.edit': 'own' })).toBe(true)
  })
})
