// The five logins production has (2026-10-11), as current_permissions() and
// current_actions() answer for each — read on production with auth.uid() set
// to each account, inside a block that rolled back. page-tabs.test.ts holds
// every page each opens today to staying open once pages also ask the tabs.

import type { Scope } from './permission-matrix'

export interface LoginFixture {
  email: string
  role: string
  keys: string[]
  actions: Record<string, Scope>
}

const all = (cells: string): Record<string, Scope> => Object.fromEntries(cells.split(' ').map(c => [c, 'all' as Scope]))

export const PROD_LOGINS: LoginFixture[] = [
  {
    email: 'carrieong1218@gmail.com',
    role: 'finance',
    keys: ['billing', 'claims', 'dashboard', 'treasury', 'venture_pool'],
    actions: {
      ...all('billing.edit billing.view billing.void billing.create billing.export dashboard.view treasury.edit treasury.view treasury.create treasury.export venture_pool.view venture_pool.create'),
      'claims.view': 'own',
      'claims.create': 'own',
    },
  },
  {
    email: 'finance@venture.my',
    role: 'finance',
    keys: ['billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'dept_pool', 'dept_reports', 'payroll_payouts', 'reconciliation', 'reports', 'treasury', 'venture_pool'],
    actions: all(
      'claims.edit claims.view claims.void billing.edit billing.view billing.void reports.view claims.create treasury.edit treasury.view treasury.void ' +
      'billing.create billing.export claims.approve dashboard.view dept_pool.view reports.export categories.view treasury.create treasury.export ' +
      'dept_pool.export categories.manage dept_reports.view venture_pool.edit venture_pool.view dept_reports.export reconciliation.edit ' +
      'reconciliation.view venture_pool.create venture_pool.export reconciliation.create reconciliation.approve',
    ),
  },
  {
    email: 'hr@venture.my',
    role: 'hr',
    keys: ['claims', 'claims_approve', 'dashboard', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage', 'member_requests_manage', 'revenue', 'salary_individual', 'team'],
    actions: all(
      'team.edit team.view claims.edit claims.view claims.void member.view team.create team.manage revenue.edit revenue.view claims.create ' +
      'member.manage claims.approve dashboard.view revenue.create revenue.export revenue.manage hr_costing.edit hr_costing.view hr_costing.create ' +
      'hr_costing.export director_pool.edit director_pool.view director_salary.edit director_salary.view',
    ),
  },
  {
    email: 'marketing@venture.my',
    role: 'dept_manager',
    keys: ['claims', 'dashboard', 'dept_pool', 'dept_reports', 'my_billing', 'opex'],
    actions: {
      'opex.view': 'dept', 'claims.edit': 'dept', 'claims.view': 'dept', 'claims.void': 'dept', 'opex.export': 'dept', 'claims.create': 'dept',
      'dashboard.view': 'all', 'dept_pool.view': 'dept', 'my_billing.view': 'dept', 'dept_pool.export': 'dept', 'dept_reports.view': 'dept',
      'my_billing.create': 'dept', 'dept_reports.export': 'dept',
    },
  },
  {
    email: 'principal@venture.my',
    role: 'principal',
    keys: ['approvals', 'audit_log', 'billing', 'categories', 'claims', 'claims_approve', 'crm_manage', 'dashboard', 'department_mode', 'dept_pool',
      'dept_reports', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage', 'member_requests_manage', 'opex', 'override',
      'payroll_payouts', 'permissions_manage', 'product_list', 'reconciliation', 'reports', 'revenue', 'salary_individual', 'settings', 'team',
      'team_invite', 'treasury', 'venture_pool', 'view_switch'],
    actions: all(
      'crm.edit crm.view opex.view team.edit team.view crm.manage claims.edit claims.view claims.void member.view opex.export team.create ' +
      'team.manage billing.edit billing.view billing.void reports.view revenue.edit revenue.view accounts.view claims.create member.manage ' +
      'settings.view treasury.edit treasury.view treasury.void approvals.view audit_log.view billing.create billing.export claims.approve ' +
      'dashboard.view dept_pool.view reports.export revenue.create revenue.export revenue.manage accounts.create accounts.manage categories.view ' +
      'hr_costing.edit hr_costing.view revenue.approve settings.manage treasury.create treasury.export audit_log.export dept_pool.export ' +
      'treasury.approve view_switch.view approvals.approve categories.manage dept_reports.view hr_costing.create hr_costing.export ' +
      'product_list.edit product_list.view venture_pool.edit venture_pool.view director_pool.edit director_pool.view hr_costing.approve ' +
      'dept_reports.export reconciliation.edit reconciliation.view venture_pool.create venture_pool.export director_salary.edit ' +
      'director_salary.view reconciliation.create reconciliation.approve director_salary.approve',
    ),
  },
]
