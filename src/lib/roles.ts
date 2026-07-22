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
  // Director Pool v2 (2026-07-17) is the standalone calculator — full
  // per-director detail (weights, advances, savings). Principal + HR
  // (HR access granted by user 2026-07-21). Finance lost the old
  // aggregate-bucket view when the ledger page was replaced.
  return role === 'principal' || role === 'hr'
}

export function canAccessVenturePool(role: UserRole): boolean {
  // Venture Pool = HV holding-company cash ledger (5 txn types).
  // Mirrors Director Pool gating: Principal + Finance only.
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

// Segment-scoped reports (P&L, Cash Flow, Debtor Aging) a dept_manager may see
// for THEIR OWN department only — RLS restricts every row to their segment, so
// even a hand-typed ?segment= returns empty. Whole-company reports (balance
// sheet, trial balance, ledger, fund summary) stay principal/finance via
// canAccessReports. (2026-07: give Marketing their own department reports.)
export function canAccessDeptReports(role: UserRole): boolean {
  return role === 'principal' || role === 'finance' || role === 'dept_manager'
}

export function canAccessClaims(role: UserRole): boolean {
  return role === 'principal' || role === 'finance' || role === 'hr' || role === 'dept_manager'
}

export function canAccessSettings(role: UserRole): boolean {
  return role === 'principal'
}

// Categories drive GL routing for every PV — Finance creates PVs all day so
// they need to add/edit categories themselves rather than blocking on Principal.
// Principal still sees all Settings tabs; Finance only sees Categories.
export function canAccessCategories(role: UserRole): boolean {
  return role === 'principal' || role === 'finance'
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
