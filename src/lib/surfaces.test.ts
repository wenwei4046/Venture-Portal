import { describe, expect, it } from 'vitest'
import { actionsFromKeys } from './permission-actions'
import type { ActionHolder } from './permission-actions'
import {
  decidesEverything,
  decidesPoolClaims,
  overviewFor,
  ownDepartmentOnly,
  raisesDepartmentRequests,
  raisesForSignOff,
  reportsCompanyWide,
  seesAllSettings,
} from './surfaces'

// Q7 (2026-10-09): pages decide by the cells, never by the account's kind.
// Every holder below is production's own answer on 2026-10-09 — the five
// logins' current_permissions() / current_actions(), and each seeded template
// worn by one of them in a rolled-back transaction — and each rule must land
// the five logins exactly where the old kind test did.

type Row = [string, ActionHolder]
const untemplated = (role: string, keys: string): ActionHolder => {
  const permissions = keys.split(',')
  return { permissions, actions: actionsFromKeys(permissions, role) }
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
  marketing: untemplated('dept_manager', 'claims,dashboard,dept_pool,dept_reports,my_billing,opex'),
  // Finance · Maker with her own cells (Billing Void / Export, Treasury Export; Reconciliation shut).
  carrie: templated('billing,claims,dashboard,treasury,venture_pool',
    'billing.create:all,billing.edit:all,billing.export:all,billing.view:all,billing.void:all,claims.create:own,claims.view:own,dashboard.view:all,treasury.create:all,treasury.edit:all,treasury.export:all,treasury.view:all,venture_pool.create:all,venture_pool.view:all'),
}

const TEMPLATES: Record<string, ActionHolder> = {
  director: templated('approvals_queue,claims,dashboard,dept_reports,director_pool,director_salary,payroll_payouts,reports,salary_individual,team,treasury,venture_pool',
    'team.view:all,claims.view:own,reports.view:all,claims.create:own,treasury.view:all,approvals.view:all,dashboard.view:all,reports.export:all,treasury.create:all,treasury.export:all,treasury.approve:all,approvals.approve:all,dept_reports.view:all,venture_pool.view:all,director_pool.view:all,director_salary.view:all,director_salary.approve:all'),
  office: templated('approvals_queue,claims,dashboard',
    'team.view:all,claims.view:own,reports.view:all,claims.create:own,approvals.view:all,dashboard.view:all'),
  dept_head: templated('claims,dashboard,dept_pool,dept_reports,my_billing,opex',
    'opex.view:dept,team.view:dept,claims.view:dept,claims.create:own,claims.approve:dept,dashboard.view:all,dept_pool.view:dept,my_billing.view:dept,dept_pool.export:dept,dept_reports.view:dept,my_billing.create:dept,dept_reports.export:dept'),
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
  ownDeptPool: ownDepartmentOnly(h, 'dept_pool'),
  decidesPoolClaims: decidesPoolClaims(h),
  raisesDeptRequests: raisesDepartmentRequests(h),
  allSettings: seesAllSettings(h),
  reportsCompanyWide: reportsCompanyWide(h),
})

describe('the five logins land where their kind put them', () => {
  // The old tests: isPrincipal (kind principal), isFinance (kind finance),
  // role === 'hr' / 'dept_manager', pool claims to Finance / Principal.
  const expected: Record<string, ReturnType<typeof surfaces>> = {
    principal: { overview: 'treasury', decidesEverything: true, raisesForSignOff: false, ownDeptPool: false, decidesPoolClaims: true, raisesDeptRequests: false, allSettings: true, reportsCompanyWide: true },
    finance: { overview: 'treasury', decidesEverything: false, raisesForSignOff: true, ownDeptPool: false, decidesPoolClaims: true, raisesDeptRequests: false, allSettings: false, reportsCompanyWide: true },
    hr: { overview: 'hr', decidesEverything: false, raisesForSignOff: false, ownDeptPool: false, decidesPoolClaims: false, raisesDeptRequests: false, allSettings: false, reportsCompanyWide: false },
    marketing: { overview: 'department', decidesEverything: false, raisesForSignOff: false, ownDeptPool: true, decidesPoolClaims: false, raisesDeptRequests: true, allSettings: false, reportsCompanyWide: false },
    // Kind finance: raises for sign-off as before; Claims · Approve is not on
    // her template (the gate already refused her), and she opens no report.
    carrie: { overview: 'treasury', decidesEverything: false, raisesForSignOff: true, ownDeptPool: false, decidesPoolClaims: false, raisesDeptRequests: false, allSettings: false, reportsCompanyWide: false },
  }
  for (const [name, holder] of Object.entries(LOGINS) as Row[]) {
    it(name, () => expect(surfaces(holder)).toEqual(expected[name]))
  }
})

describe('a template routes by its cells, whatever its hidden kind', () => {
  it('a Director (kind staff) gets the treasury Overview and the sign-off queue', () => {
    expect(surfaces(TEMPLATES.director)).toEqual({
      overview: 'treasury', decidesEverything: true, raisesForSignOff: false, ownDeptPool: false,
      decidesPoolClaims: false, raisesDeptRequests: false, allSettings: false, reportsCompanyWide: true,
    })
  })
  it('the Executive office (kind staff) has no Overview of its own — its Reports cell is held without Treasury', () => {
    expect(surfaces(TEMPLATES.office).overview).toBe('none')
    expect(reportsCompanyWide(TEMPLATES.office)).toBe(false)
  })
  it('a Department head reads and raises for their own department only', () => {
    expect(surfaces(TEMPLATES.dept_head)).toMatchObject({ overview: 'department', ownDeptPool: true, raisesDeptRequests: true, decidesPoolClaims: false })
  })
  it('a Finance · Checker decides pool claims but raises nothing for sign-off', () => {
    expect(surfaces(TEMPLATES.fin_checker)).toMatchObject({ overview: 'treasury', raisesForSignOff: false, decidesPoolClaims: true, reportsCompanyWide: true })
  })
  it('HR · Payroll gets HR’s Overview; Staff · Basic none', () => {
    expect(overviewFor(TEMPLATES.hr)).toBe('hr')
    expect(overviewFor(TEMPLATES.staff)).toBe('none')
  })
  it('a cell held back (pages not open) reads as no reach', () => {
    // dept_pool.view at Dept without the dept_pool key: held, not "their department".
    const held: ActionHolder = { permissions: ['dashboard'], actions: { 'dept_pool.view': 'dept', 'dashboard.view': 'all' } }
    expect(overviewFor(held)).toBe('none')
    expect(ownDepartmentOnly(held, 'dept_pool')).toBe(false)
  })
})
