import { describe, expect, it } from 'vitest'
import { actionsFromKeys } from './permission-actions'
import type { ActionHolder } from './permission-actions'
import {
  decidesEverything,
  decidesPoolClaims,
  overviewFor,
  raisesForSignOff,
  readsEveryPool,
  reportsCompanyWide,
  seesAllSettings,
} from './surfaces'

// Q7 (2026-10-09): pages decide by the cells, never by the account's kind.
// Every holder below is production's own answer on 2026-10-09 — the logins'
// current_permissions() / current_actions(), and each seeded template worn by
// one of them in a rolled-back transaction — and each rule must land the
// logins exactly where the old kind test did. (marketing@, the Dept Manager,
// and the Department head template went on 2026-10-17.)

type Row = [string, ActionHolder]
const untemplated = (role: string, keys: string): ActionHolder => {
  const permissions = keys.split(',')
  return { permissions, actions: actionsFromKeys(permissions) }
}
const templated = (keys: string, actions: string): ActionHolder => ({
  permissions: keys.split(','),
  actions: Object.fromEntries(actions.split(',').map(cell => {
    const [fa, scope] = cell.split(':')
    return [fa, scope as 'own' | 'dept' | 'all']
  })),
})

const LOGINS: Record<string, ActionHolder> = {
  principal: untemplated('principal', 'approvals,audit_log,billing,categories,claims,claims_approve,dashboard,department_mode,dept_pool,dept_reports,director_pool,director_salary,hr_costing,member_memos_manage,member_requests_manage,opex,override,payroll_payouts,permissions_manage,product_list,reconciliation,reports,revenue,salary_individual,settings,team,team_invite,treasury,venture_pool,view_switch'),
  finance: untemplated('finance', 'billing,categories,claims,claims_approve,dashboard,dept_pool,dept_reports,payroll_payouts,reconciliation,reports,treasury,venture_pool'),
  hr: untemplated('hr', 'claims,claims_approve,dashboard,director_pool,director_salary,hr_costing,member_memos_manage,member_requests_manage,revenue,salary_individual,team'),
  // Finance · Maker with her own cells (Billing Void / Export, Treasury Export; Reconciliation shut).
  carrie: templated('billing,claims,dashboard,treasury,venture_pool',
    'billing.create:all,billing.edit:all,billing.export:all,billing.view:all,billing.void:all,claims.create:own,claims.view:own,dashboard.view:all,treasury.create:all,treasury.edit:all,treasury.export:all,treasury.view:all,venture_pool.create:all,venture_pool.view:all'),
}

const TEMPLATES: Record<string, ActionHolder> = {
  director: templated('approvals_queue,claims,dashboard,dept_reports,director_pool,director_salary,payroll_payouts,reports,salary_individual,team,treasury,venture_pool',
    'team.view:all,claims.view:own,reports.view:all,claims.create:own,treasury.view:all,approvals.view:all,dashboard.view:all,reports.export:all,treasury.create:all,treasury.export:all,treasury.approve:all,approvals.approve:all,dept_reports.view:all,venture_pool.view:all,director_pool.view:all,director_salary.view:all,director_salary.approve:all'),
  office: templated('approvals_queue,claims,dashboard',
    'team.view:all,claims.view:own,reports.view:all,claims.create:own,approvals.view:all,dashboard.view:all'),
  fin_checker: templated('billing,categories,claims,claims_approve,dashboard,dept_pool,dept_reports,reconciliation,reports,treasury,venture_pool',
    'claims.view:all,billing.view:all,reports.view:all,treasury.view:all,billing.export:all,claims.approve:all,dashboard.view:all,dept_pool.view:all,reports.export:all,categories.view:all,treasury.export:all,treasury.approve:all,categories.manage:all,dept_reports.view:all,venture_pool.view:all,dept_reports.export:all,reconciliation.view:all,venture_pool.export:all,reconciliation.approve:all'),
  hr: templated('claims,dashboard,director_pool,director_salary,hr_costing,member_memos_manage,member_requests_manage,payroll_payouts,revenue,salary_individual,team',
    'team.edit:all,team.view:all,claims.view:own,member.view:all,team.create:all,revenue.edit:all,revenue.view:all,accounts.view:all,claims.create:own,member.manage:all,dashboard.view:all,revenue.create:all,revenue.manage:all,hr_costing.edit:all,hr_costing.view:all,hr_costing.create:all,hr_costing.export:all,director_pool.view:all,director_salary.edit:all,director_salary.view:all'),
  staff: templated('claims,dashboard', 'claims.edit:own,claims.view:own,claims.create:own,dashboard.view:all'),
}

const surfaces = (h: ActionHolder) => ({
  overview: overviewFor(h),
  decidesEverything: decidesEverything(h),
  raisesForSignOff: raisesForSignOff(h),
  everyPool: readsEveryPool(h),
  decidesPoolClaims: decidesPoolClaims(h),
  allSettings: seesAllSettings(h),
  reportsCompanyWide: reportsCompanyWide(h),
})

describe('the logins land where their kind put them', () => {
  // The old tests: isPrincipal (kind principal), isFinance (kind finance),
  // role === 'hr', pool claims to Finance / Principal.
  const expected: Record<string, ReturnType<typeof surfaces>> = {
    principal: { overview: 'treasury', decidesEverything: true, raisesForSignOff: false, everyPool: true, decidesPoolClaims: true, allSettings: true, reportsCompanyWide: true },
    finance: { overview: 'treasury', decidesEverything: false, raisesForSignOff: true, everyPool: true, decidesPoolClaims: true, allSettings: false, reportsCompanyWide: true },
    hr: { overview: 'hr', decidesEverything: false, raisesForSignOff: false, everyPool: false, decidesPoolClaims: false, allSettings: false, reportsCompanyWide: false },
    // Kind finance: raises for sign-off as before; Claims · Approve is not on
    // her template (the gate already refused her), and she opens no report.
    carrie: { overview: 'treasury', decidesEverything: false, raisesForSignOff: true, everyPool: false, decidesPoolClaims: false, allSettings: false, reportsCompanyWide: false },
  }
  for (const [name, holder] of Object.entries(LOGINS) as Row[]) {
    it(name, () => expect(surfaces(holder)).toEqual(expected[name]))
  }
})

describe('a template routes by its cells, whatever its hidden kind', () => {
  it('a Director (kind staff) gets the treasury Overview and the sign-off queue', () => {
    expect(surfaces(TEMPLATES.director)).toEqual({
      overview: 'treasury', decidesEverything: true, raisesForSignOff: false, everyPool: false,
      decidesPoolClaims: false, allSettings: false, reportsCompanyWide: true,
    })
  })
  it('the Executive office (kind staff) has no Overview of its own — its Reports cell is held without Treasury', () => {
    expect(surfaces(TEMPLATES.office).overview).toBe('none')
    expect(reportsCompanyWide(TEMPLATES.office)).toBe(false)
  })
  it('a Finance · Checker decides pool claims but raises nothing for sign-off', () => {
    expect(surfaces(TEMPLATES.fin_checker)).toMatchObject({ overview: 'treasury', raisesForSignOff: false, everyPool: true, decidesPoolClaims: true, reportsCompanyWide: true })
  })
  it('HR · Payroll gets HR’s Overview; Staff · Basic none', () => {
    expect(overviewFor(TEMPLATES.hr)).toBe('hr')
    expect(overviewFor(TEMPLATES.staff)).toBe('none')
  })
  it('a cell held back (pages not open) reads as no reach', () => {
    // dept_pool.view at All without the dept_pool key: held, not opened.
    const held: ActionHolder = { permissions: ['dashboard'], actions: { 'dept_pool.view': 'all', 'dashboard.view': 'all' } }
    expect(overviewFor(held)).toBe('none')
    expect(readsEveryPool(held)).toBe(false)
  })

  it('Dept Pool below All reads no pool — no page draws one department’s any more (2026-10-17)', () => {
    expect(readsEveryPool({ permissions: ['dept_pool'], actions: { 'dept_pool.view': 'dept' } })).toBe(false)
    expect(readsEveryPool({ permissions: ['dept_pool'], actions: { 'dept_pool.view': 'all' } })).toBe(true)
  })
})
