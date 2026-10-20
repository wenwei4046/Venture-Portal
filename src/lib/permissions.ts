// The permission vocabulary, mirrored from `permission_defs`.
//
// The database is the source of truth — the matrix reads that table and RLS
// derives its scopes from it. This file exists so the ~350 gates in the app can
// name a permission and have the compiler check the spelling, which a string
// literal against a database table cannot do.
//
// Keep in step with the permission_catalog migrations. A key here that the
// database does not have simply never resolves, which fails closed.

export const PERMISSIONS = [
  'dashboard',
  'approvals',
  // Opens the approval queue and nothing else (2026-10-09) — what one may decide
  // there is their Approve's (lib/approval-domains.ts).
  'approvals_queue',
  'treasury',
  'payroll_payouts',
  'billing',
  'categories',
  'hr_costing',
  'revenue',
  'product_list',
  'director_salary',
  'director_pool',
  'team',
  // People without the staff table (2026-10-10, PR4b): Team · View at any reach
  // with no Salary tick — the roster through team_directory(), the chart
  // through team_org_chart(). Opens reading only (lib/team-directory.ts).
  'team_directory',
  'team_invite',
  'salary_individual',
  'dept_pool',
  'venture_pool',
  'opex',
  'claims',
  'claims_approve',
  'reports',
  'dept_reports',
  'reconciliation',
  'audit_log',
  'settings',
  'department_mode',
  'override',
  'permissions_manage',
  'member_portal',
  'member_quote',
  'member_requests',
  'member_memos',
  'member_requests_manage',
  'member_memos_manage',
  // The CRM (2026-10-10): CRM · View opens the first, CRM · Manage the second.
  'member_crm',
  'crm_manage',
  // HR revamp round 2 (2026-10-11, mig 20261011060000): each module's View
  // opens its key — Meeting rooms · Edit the second rooms key.
  'documentation',
  'hiring',
  'meeting_rooms',
  'meeting_rooms_manage',
  'guest_link',
  // HR › Attendance (2026-10-15, mig 20261015030000): Attendance · View opens it.
  'attendance',
  // IT support's desk (2026-10-20, mig 20261021013000): IT requests · View opens it — a Revenue app account may hold it.
  'it_requests',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** Anything that can be asked "may you". A User is one; so is a bare set. */
export interface PermissionHolder {
  permissions: readonly string[]
}

/**
 * Does this holder have any of these permissions?
 *
 * Several keys means OR, because a handful of gates in the portal are reachable
 * from two directions — the payroll bank-transfer file belongs to whoever runs
 * payroll AND to whoever pays it out.
 */
export function can(holder: PermissionHolder | null | undefined, ...keys: Permission[]): boolean {
  if (!holder) return false
  return keys.some(k => holder.permissions.includes(k))
}
