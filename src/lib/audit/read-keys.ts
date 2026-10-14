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
  // Hiring's requests, candidates, form and Talent Bank (round 2, 2026-10-11).
  'hiring',
  'member_memos_manage',
  // Meeting rooms and their bookings (2026-10-11): whoever manages the rooms.
  'meeting_rooms_manage',
  // People › Documentation (mig 20261011070000).
  'documentation',
  // The guest link and its subsidiaries (2026-10-11).
  'guest_link',
  // HR › Attendance's settings, days, requests and balances (2026-10-15).
  'attendance',
] as const satisfies readonly Permission[]

/**
 * Keys that open some history only INSIDE an app, never the portal's Audit Log: CRM · Manage reads the CRM's settings
 * tables in the CRM desktop's Settings › History (CRM Desktop rev 1, mig 20261013100000) — the Revenue Director's
 * template holds it and has no portal page.
 */
export const IN_APP_HISTORY_KEYS = ['crm_manage'] as const satisfies readonly Permission[]
