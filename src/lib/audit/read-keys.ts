import type { Permission } from '@/lib/permissions'

/**
 * Every permission key that opens some table's history — the union of
 * `audit_tables.read_keys` — and `audit_log`, which opens them all
 * (2026-10-08). Holding any one of them puts Audit Log › Changes in the
 * sidebar; what the page then lists is decided in the database, table by
 * table, by `audit_changes()`. `registry.test.ts` holds this list to the
 * migrations' registrations.
 */
export const AUDIT_READ_KEYS = [
  'audit_log',
  'treasury',
  'reports',
  'approvals',
  'billing',
  'venture_pool',
  'categories',
  'reconciliation',
  'settings',
  'hr_costing',
  'payroll_payouts',
  'claims_approve',
  'revenue',
  'director_salary',
  'director_pool',
  'team',
  'permissions_manage',
  'product_list',
  'member_requests_manage',
  'member_memos_manage',
] as const satisfies readonly Permission[]
