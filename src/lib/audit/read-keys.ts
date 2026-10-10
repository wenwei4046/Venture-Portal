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
  // Meeting rooms and their bookings (2026-10-11): whoever manages the rooms.
  'meeting_rooms_manage',
  // People › Documentation (mig 20261011070000).
  'documentation',
] as const satisfies readonly Permission[]
