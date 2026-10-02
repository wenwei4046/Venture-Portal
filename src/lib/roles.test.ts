import { describe, it, expect } from 'vitest'
import {
  canAccessTreasury,
  canAccessBilling,
  canAccessDeptPool,
  canAccessHRCosting,
  canAccessDirectorSalary,
  canAccessDirectorPool,
  canAccessReports,
  canAccessSettings,
  canApprove,
  canApproveClaims,
  canSeeIndividualSalary,
  canSeePayrollPayouts,
  canAccessTeam,
} from './roles'
import type { UserRole } from '@/types'

// The seed in the permission_catalog migration, transcribed. Two things are
// being pinned at once: that the helpers read permissions, and that the seed
// still reproduces what the four roles could do before 2026-09-01 — which is
// the whole argument for why that cutover changed nobody's access.
const ROLE_DEFAULTS: Record<UserRole, string[]> = {
  revenue_member: ['member_portal', 'member_quote', 'member_requests', 'member_memos'],
  principal: [
    'dashboard', 'approvals', 'treasury', 'billing', 'categories', 'hr_costing',
    'revenue', 'product_list', 'director_salary', 'director_pool', 'team',
    'team_invite', 'salary_individual', 'dept_pool', 'venture_pool', 'opex',
    'claims', 'claims_approve', 'reports', 'dept_reports', 'reconciliation',
    'audit_log', 'settings', 'override', 'permissions_manage', 'payroll_payouts',
  ],
  finance: [
    'dashboard', 'treasury', 'billing', 'categories', 'dept_pool',
    'venture_pool', 'claims', 'claims_approve', 'reports', 'dept_reports',
    'reconciliation',
  ],
  hr: [
    'dashboard', 'hr_costing', 'revenue', 'director_salary', 'director_pool',
    'team', 'salary_individual', 'claims', 'claims_approve',
  ],
  dept_manager: ['dashboard', 'dept_pool', 'opex', 'my_billing', 'claims', 'dept_reports'],
}

const ALL_ROLES: UserRole[] = ['principal', 'finance', 'hr', 'dept_manager', 'revenue_member']
const as = (role: UserRole) => ({ permissions: ROLE_DEFAULTS[role] })

/** Assert exactly which roles a gate lets through, so a widening is a failure. */
function allows(gate: (u: { permissions: string[] }) => boolean, expected: UserRole[]) {
  for (const role of ALL_ROLES) {
    expect(
      gate(as(role)),
      `${role} should ${expected.includes(role) ? '' : 'not '}pass`,
    ).toBe(expected.includes(role))
  }
}

describe('the gates, on the seeded role defaults', () => {
  it('canAccessTreasury: principal + finance', () => {
    allows(canAccessTreasury, ['principal', 'finance'])
  })

  it('canAccessBilling: principal + finance', () => {
    allows(canAccessBilling, ['principal', 'finance'])
  })

  it('canAccessDeptPool: principal + finance + dept manager', () => {
    allows(canAccessDeptPool, ['principal', 'finance', 'dept_manager'])
  })

  it('canAccessHRCosting: principal + hr', () => {
    allows(canAccessHRCosting, ['principal', 'hr'])
  })

  it('canAccessDirectorSalary: principal + hr, never finance', () => {
    // Segregation of duties: Finance sees aggregates, never a director's salary.
    allows(canAccessDirectorSalary, ['principal', 'hr'])
  })

  it('canAccessDirectorPool: principal + hr', () => {
    allows(canAccessDirectorPool, ['principal', 'hr'])
  })

  it('canAccessReports: principal + finance', () => {
    allows(canAccessReports, ['principal', 'finance'])
  })

  it('canAccessSettings: principal alone', () => {
    allows(canAccessSettings, ['principal'])
  })

  it('canApprove: principal alone', () => {
    allows(canApprove, ['principal'])
  })

  it('canApproveClaims: everyone but a dept manager', () => {
    allows(canApproveClaims, ['principal', 'finance', 'hr'])
  })

  it('canSeeIndividualSalary: principal + hr, never finance', () => {
    allows(canSeeIndividualSalary, ['principal', 'hr'])
  })

  it('canAccessTeam: principal + hr', () => {
    allows(canAccessTeam, ['principal', 'hr'])
  })

  it('canSeePayrollPayouts: principal + hr — a finance account does not get it from its role', () => {
    // 2026-10-02: the finance account that existed that day holds it as a
    // personal grant; one created later is given it by the Principal, or not.
    allows(canSeePayrollPayouts, ['principal', 'hr'])
  })
})

describe('the gates, on a configured title', () => {
  // Once a title carries permissions the role behind the account stops
  // mattering — that is the point of the whole exercise.
  it('lets a title grant what the role never could', () => {
    const marketingManager = { permissions: ['dashboard', 'treasury', 'reports'] }
    expect(canAccessTreasury(marketingManager)).toBe(true)
    expect(canAccessReports(marketingManager)).toBe(true)
    expect(canAccessSettings(marketingManager)).toBe(false)
    expect(canApprove(marketingManager)).toBe(false)
  })

  it('lets a title withhold what the role would have given', () => {
    const juniorFinance = { permissions: ['dashboard', 'treasury'] }
    expect(canAccessTreasury(juniorFinance)).toBe(true)
    expect(canAccessReports(juniorFinance)).toBe(false)
    expect(canAccessDeptPool(juniorFinance)).toBe(false)
  })

  it('lets one person be granted payroll payouts on top of what treasury gives', () => {
    const financeExecutive = { permissions: ['dashboard', 'treasury', 'billing'] }
    const financeManager = { permissions: [...financeExecutive.permissions, 'payroll_payouts'] }
    expect(canAccessTreasury(financeExecutive)).toBe(true)
    expect(canSeePayrollPayouts(financeExecutive)).toBe(false)
    expect(canSeePayrollPayouts(financeManager)).toBe(true)
  })

  it('holds nothing for an empty set', () => {
    const nobody = { permissions: [] }
    for (const gate of [canAccessTreasury, canAccessHRCosting, canApprove, canAccessSettings]) {
      expect(gate(nobody)).toBe(false)
    }
  })
})
