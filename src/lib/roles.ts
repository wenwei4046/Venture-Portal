import type { UserRole } from '@/types'
import { can, type PermissionHolder } from '@/lib/permissions'

// What each part of the portal needs.
//
// These used to answer "is this role allowed here". Since 2026-09-01 they
// answer "does this account hold the permission", which a title grants and the
// four roles only supply as a default. The names stayed because the call sites
// read well — `canAccessTreasury(user)` — and because keeping them is what let
// the switch be one mechanical pass rather than 130 judgement calls.
//
// The catalog lives in `permission_defs`; the keys are mirrored in
// lib/permissions.ts so the compiler checks the spelling.

export function canAccessTreasury(u: PermissionHolder): boolean {
  return can(u, 'treasury')
}

export function canAccessBilling(u: PermissionHolder): boolean {
  return can(u, 'billing')
}

export function canAccessDeptPool(u: PermissionHolder): boolean {
  // Principal and Finance read every department; a dept manager reads their
  // own only — that restriction is enforced in the page guard and the RPC, not
  // here.
  return can(u, 'dept_pool')
}

export function canAccessRevenue(u: PermissionHolder): boolean {
  // Revenue Department — the commission-paid sales teams.
  return can(u, 'revenue')
}

export function canAccessProductList(u: PermissionHolder): boolean {
  // Item code → unit cost. What a product COSTS is not payroll's call
  // (user 2026-08-31), so it is its own permission.
  return can(u, 'product_list')
}

export function canAccessHRCosting(u: PermissionHolder): boolean {
  return can(u, 'hr_costing')
}

export function canAccessDirectorSalary(u: PermissionHolder): boolean {
  return can(u, 'director_salary')
}

export function canAccessDirectorPool(u: PermissionHolder): boolean {
  return can(u, 'director_pool')
}

export function canAccessVenturePool(u: PermissionHolder): boolean {
  return can(u, 'venture_pool')
}

export function canAccessReports(u: PermissionHolder): boolean {
  // Whole-company reports: balance sheet, trial balance, ledger, fund summary.
  return can(u, 'reports')
}

export function canAccessDeptReports(u: PermissionHolder): boolean {
  // Segment-scoped reports (P&L, Cash Flow, Debtor Aging) somebody may see for
  // THEIR OWN department. RLS restricts every row to their segment, so even a
  // hand-typed ?segment= returns empty.
  return can(u, 'dept_reports')
}

export function canAccessClaims(u: PermissionHolder): boolean {
  return can(u, 'claims')
}

export function canApproveClaims(u: PermissionHolder): boolean {
  // Deciding a claim is not submitting one.
  return can(u, 'claims_approve')
}

export function canAccessSettings(u: PermissionHolder): boolean {
  return can(u, 'settings')
}

export function canAccessCategories(u: PermissionHolder): boolean {
  // Categories drive GL routing for every voucher, and Finance creates
  // vouchers all day, so they add and edit these themselves.
  return can(u, 'categories')
}

export function canApprove(u: PermissionHolder): boolean {
  return can(u, 'approvals')
}

export function canSeeIndividualSalary(u: PermissionHolder): boolean {
  return can(u, 'salary_individual')
}

export function canManagePermissions(u: PermissionHolder): boolean {
  return can(u, 'permissions_manage')
}

export function canInviteUsers(u: PermissionHolder): boolean {
  return can(u, 'team_invite')
}

export function canAccessTeam(u: PermissionHolder): boolean {
  return can(u, 'team')
}

export function canAccessAuditLog(u: PermissionHolder): boolean {
  return can(u, 'audit_log')
}

export function canAccessReconciliation(u: PermissionHolder): boolean {
  return can(u, 'reconciliation')
}

export function canAccessOpex(u: PermissionHolder): boolean {
  return can(u, 'opex')
}

export function canAccessMyBilling(u: PermissionHolder): boolean {
  return can(u, 'my_billing')
}

// The one thing still keyed off the role: a dept manager's pages read their
// own `department_id`, and 16 RLS policies scope rows the same way. No
// permission expresses "their own department", so this stays.
export function isDeptManager(role: UserRole): boolean {
  return role === 'dept_manager'
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    principal: 'Principal',
    finance: 'Finance',
    hr: 'HR',
    dept_manager: 'Dept Manager',
    revenue_member: 'Revenue Member',
  }
  return labels[role]
}
