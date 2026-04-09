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
  return role === 'principal' || role === 'hr'
}

export function canAccessHRCosting(role: UserRole): boolean {
  return role === 'principal' || role === 'hr'
}

export function canAccessReports(role: UserRole): boolean {
  return role === 'principal' || role === 'finance' || role === 'hr'
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
