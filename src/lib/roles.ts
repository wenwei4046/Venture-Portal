import type { UserRole } from '@/types'

export function canAccessTreasury(role: UserRole): boolean {
  return role === 'principal' || role === 'finance'
}

export function canAccessBilling(role: UserRole): boolean {
  return role === 'principal' || role === 'finance'
}

export function canAccessDeptPool(role: UserRole): boolean {
  // Principal + Finance read everything. Dept Manager reads their own dept
  // only — that restriction is enforced in the page guard + RPC, not here.
  return role === 'principal' || role === 'finance' || role === 'dept_manager'
}

export function canAccessDirectorSalary(role: UserRole): boolean {
  // Finance sees lump-sum only (via get_director_payout_summary RPC)
  return role === 'principal' || role === 'hr' || role === 'finance'
}

export function canAccessDirectorPool(role: UserRole): boolean {
  // Director Pool shows accumulated running balance — Principal + Finance only.
  // HR sees current-month calculation via /director-salary but not the
  // all-time pool balance.
  return role === 'principal' || role === 'finance'
}

export function canAccessHRCosting(role: UserRole): boolean {
  // Phase 7 Step 15: Finance executes approved snapshots, so needs access.
  return role === 'principal' || role === 'hr' || role === 'finance'
}

export function canAccessReports(role: UserRole): boolean {
  return role === 'principal' || role === 'finance'
}

export function canAccessClaims(role: UserRole): boolean {
  return role === 'principal' || role === 'finance' || role === 'hr' || role === 'dept_manager'
}

export function canAccessSettings(role: UserRole): boolean {
  return role === 'principal'
}

export function canApprove(role: UserRole): boolean {
  return role === 'principal'
}

export function canSeeIndividualSalary(role: UserRole): boolean {
  return role === 'principal' || role === 'hr'
}

export function isDeptManager(role: UserRole): boolean {
  return role === 'dept_manager'
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    principal: 'Principal',
    finance: 'Finance',
    hr: 'HR',
    dept_manager: 'Dept Manager',
  }
  return labels[role]
}
