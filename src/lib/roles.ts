import type { UserRole } from '@/types'
import { can, type PermissionHolder } from '@/lib/permissions'
import { AUDIT_READ_KEYS } from '@/lib/audit/read-keys'
import { canSeeApprovals } from '@/lib/approval-domains'
import type { ActionHolder } from '@/lib/permission-actions'

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

export function canSeePayrollPayouts(u: PermissionHolder): boolean {
  // What ONE named person is paid, as the treasury side shows it: a salary or
  // statutory voucher, its print, the payroll bank file, Payroll Requests.
  // Treasury alone stops short of it (2026-10-02, the finance executive) —
  // such an account gets payroll by department (lib/payroll-vouchers).
  // Whoever runs payroll in HR Costing sees it regardless: the vouchers are theirs.
  return can(u, 'payroll_payouts', 'hr_costing')
}

/**
 * Whether a LIST shows payroll person by person — Payments and its export,
 * Daily Bank, a pool's History, the ledgers: the right to (canSeePayrollPayouts),
 * and not on the Finance view. The user (2026-10-13), on the Finance view
 * showing each salary voucher: "按部门，跟 Finance 一样" — so the lens draws
 * payroll by department, as an account without the right reads it. A voucher's
 * own page, its print, Payroll Requests, the bank file and Approvals still ask
 * the right alone: the lens keeps the account's power ("Approvals 照旧给你看明细").
 */
export function listsPayrollByPerson(u: (PermissionHolder & { lens?: 'hr' | 'finance' }) | null | undefined): boolean {
  return !!u && canSeePayrollPayouts(u) && u.lens !== 'finance'
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

export function canApprove(u: ActionHolder): boolean {
  // The queue opens for whoever may see it or decide anything in it — the
  // queue's own Approve or a domain's (2026-10-09, lib/approval-domains.ts).
  return canSeeApprovals(u)
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

/**
 * People Management and Hierarchy open (2026-10-10, PR4b): the `team` key —
 * HR and the Principal, who read the staff table itself — or Team · View held
 * without the Salary tick (`team_directory`: the Executive office, a
 * Department head), who read it through the directory (lib/team-directory.ts).
 */
export function canOpenPeople(u: PermissionHolder): boolean {
  return can(u, 'team', 'team_directory')
}

// HR revamp round 2 (2026-10-11): Documentation, Hiring, Meeting rooms and
// the Guest link. A room is booked from every view; managing the rooms is
// Meeting rooms · Edit's (`meeting_rooms_manage`).
export function canAccessDocumentation(u: PermissionHolder): boolean {
  return can(u, 'documentation')
}

export function canAccessHiring(u: PermissionHolder): boolean {
  return can(u, 'hiring')
}

export function canAccessMeetingRooms(u: PermissionHolder): boolean {
  return can(u, 'meeting_rooms', 'meeting_rooms_manage')
}

export function canAccessGuestLink(u: PermissionHolder): boolean {
  return can(u, 'guest_link')
}

/**
 * Change password (2026-10-12 — the user: "just for that personal acc"): a login a person on the
 * People roster holds, never a shared account (principal@, finance@, hr@, marketing@) — no key
 * decides it, the layout reads it (`personalLogin`, lib/account/personal-login.ts). Never while the
 * portal is viewed as somebody: their screen, a read-only session.
 */
export function canChangePassword(u: { personalLogin?: boolean; viewingAs?: unknown }): boolean {
  return u.personalLogin === true && !u.viewingAs
}

/**
 * Admin › My documents (2026-10-14): one's own documents — Company and Personal — for a login of one's own (a shared
 * one is no person and has none), never while viewing as somebody. The same as Change password's.
 */
export function canSeeMyDocuments(u: { personalLogin?: boolean; viewingAs?: unknown }): boolean {
  return u.personalLogin === true && !u.viewingAs
}

export function canAccessAuditLog(u: PermissionHolder): boolean {
  // The whole history, and Audit Log › Access (who read what).
  return can(u, 'audit_log')
}

export function canSeeAuditChanges(u: PermissionHolder): boolean {
  // Audit Log › Changes (2026-10-08): anybody whose permissions open the
  // history of some table — Finance its Treasury side, HR its People and
  // Payroll side. Which changes they then see is the database's call
  // (audit_changes(), table by table, value by value).
  return can(u, ...AUDIT_READ_KEYS)
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
    staff: 'Staff',
  }
  return labels[role]
}
