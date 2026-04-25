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
  canSeeIndividualSalary,
} from './roles'
import type { UserRole } from '@/types'

const ALL_ROLES: UserRole[] = ['principal', 'finance', 'hr', 'dept_manager']

describe('canAccessTreasury', () => {
  it('allows principal and finance', () => {
    expect(canAccessTreasury('principal')).toBe(true)
    expect(canAccessTreasury('finance')).toBe(true)
  })

  it('denies hr and dept_manager', () => {
    expect(canAccessTreasury('hr')).toBe(false)
    expect(canAccessTreasury('dept_manager')).toBe(false)
  })
})

describe('canAccessBilling', () => {
  it('allows principal and finance', () => {
    expect(canAccessBilling('principal')).toBe(true)
    expect(canAccessBilling('finance')).toBe(true)
  })

  it('denies hr and dept_manager', () => {
    expect(canAccessBilling('hr')).toBe(false)
    expect(canAccessBilling('dept_manager')).toBe(false)
  })
})

describe('canAccessDeptPool', () => {
  // Phase 2: Finance also reads dept pools per module-spec-phase2.
  // The spec says "Principal: 只读全部 + 审批支出" and "Finance: 只读全部".
  // Dept Manager gets read+write scoped to their own department — that
  // restriction is enforced in the page + RPC, not in the role check.
  it('allows principal, finance, and dept_manager', () => {
    expect(canAccessDeptPool('principal')).toBe(true)
    expect(canAccessDeptPool('finance')).toBe(true)
    expect(canAccessDeptPool('dept_manager')).toBe(true)
  })

  it('denies hr', () => {
    expect(canAccessDeptPool('hr')).toBe(false)
  })
})

describe('canAccessHRCosting', () => {
  it('allows principal and hr only', () => {
    expect(canAccessHRCosting('principal')).toBe(true)
    expect(canAccessHRCosting('hr')).toBe(true)
    expect(canAccessHRCosting('finance')).toBe(false)
    expect(canAccessHRCosting('dept_manager')).toBe(false)
  })
})

describe('canAccessDirectorSalary', () => {
  it('allows principal and hr only (finance excluded — segregation of duties)', () => {
    expect(canAccessDirectorSalary('principal')).toBe(true)
    expect(canAccessDirectorSalary('hr')).toBe(true)
    expect(canAccessDirectorSalary('finance')).toBe(false)
    expect(canAccessDirectorSalary('dept_manager')).toBe(false)
  })
})

describe('canAccessDirectorPool', () => {
  // Director Pool shows all-time accumulated balance. HR is intentionally
  // excluded because HR only needs to see the current-month calculation
  // (via /director-salary), not the accumulated running total.
  it('allows principal and finance only', () => {
    expect(canAccessDirectorPool('principal')).toBe(true)
    expect(canAccessDirectorPool('finance')).toBe(true)
    expect(canAccessDirectorPool('hr')).toBe(false)
    expect(canAccessDirectorPool('dept_manager')).toBe(false)
  })
})

describe('canAccessReports', () => {
  it('allows principal and finance only', () => {
    expect(canAccessReports('principal')).toBe(true)
    expect(canAccessReports('finance')).toBe(true)
    expect(canAccessReports('hr')).toBe(false)
    expect(canAccessReports('dept_manager')).toBe(false)
  })
})

describe('canAccessSettings', () => {
  it('allows principal only', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessSettings(role)).toBe(role === 'principal')
    }
  })
})

describe('canApprove', () => {
  it('allows principal only', () => {
    for (const role of ALL_ROLES) {
      expect(canApprove(role)).toBe(role === 'principal')
    }
  })
})

describe('canSeeIndividualSalary — PDPA gate', () => {
  // CLAUDE.md: "Finance CANNOT see individual employee salaries — only
  // department lump sum." This is the most important access boundary in
  // the whole portal. If this test breaks, someone reduced access on a
  // data-visibility column and needs a corresponding RLS policy check.
  it('only principal and hr can see individual salary breakdown', () => {
    expect(canSeeIndividualSalary('principal')).toBe(true)
    expect(canSeeIndividualSalary('hr')).toBe(true)
    expect(canSeeIndividualSalary('finance')).toBe(false)
    expect(canSeeIndividualSalary('dept_manager')).toBe(false)
  })
})
