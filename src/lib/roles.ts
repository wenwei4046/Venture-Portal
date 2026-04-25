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
  // Director Salary engine — Principal + HR only.
  // Finance is excluded; they see aggregated totals via /director-pool,
  // never per-director salary detail (segregation of duties).
  return role === 'principal' || role === 'hr'
}

export function canAccessDirectorPool(role: UserRole): boolean {
  // Director Pool shows accumulated running balance — Principal + Finance.
  // HR is excluded; their visibility ends at the current-month calculation
  // in /director-salary. Finance sees aggregate buckets only — per-director
  // detail is gated to Principal inside the page.
  return role === 'principal' || role === 'finance'
}

export function canAccessHRCosting(role: UserRole): boolean {
  // HR submits monthly snapshots; Principal approves via the Approvals queue.
  // Finance no longer sees the tab — they consume the aggregate from Dept Pool
  // and mark approved snapshots as executed from /dept-pool/submissions.
  return role === 'principal' || role === 'hr'
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
