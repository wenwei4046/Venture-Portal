import { canDo, type ActionHolder } from '@/lib/permission-actions'

// What a page shows somebody and lets them do, read off their own cells —
// never off their account's KIND (2026-10-09, Q7 of the People Management
// revamp; user: 到最后是跟着 title 的 permission 走).
//
// The kind (`users.role`) is a template's hidden base_role, kept in step by
// `sync_user_role`, so a seeded template routes right either way; a custom
// template whose base_role differs from its cells did not — a Director's title
// (kind `staff`) holding Treasury · View drew the "Treasury data is for
// Principal and Finance" well instead of the treasury Overview, and a
// Department head whose kind was not `dept_manager` was handed every
// department. Each rule below is the old kind test rewritten so the four
// shared accounts and carrie land exactly where they did (surfaces.test.ts
// holds them to it); the kind survives only where it is the point — the view-
// as switch, the Principal's own powers (reopen a closed month, approve what
// they raised themselves), labels and the phone's tab bar.

export type OverviewKind = 'treasury' | 'hr' | 'none'

/**
 * Which Overview to draw: the treasury one for anybody who reads the treasury
 * (it is the company's money — Principal, Finance, a Director), else HR's for
 * whoever reads payroll, else none. (A department's own Overview went with the
 * Dept Manager, 2026-10-17.)
 */
export function overviewFor(holder: ActionHolder): OverviewKind {
  if (canDo(holder, 'treasury', 'view')) return 'treasury'
  if (canDo(holder, 'hr_costing', 'view')) return 'hr'
  return 'none'
}

/** Approves anything that waits for sign-off (Approvals · Approve — the Principal's cell). */
export function decidesEverything(holder: ActionHolder): boolean {
  return canDo(holder, 'approvals', 'approve')
}

/**
 * Raises treasury requests somebody else signs off — Finance's queues on the
 * Overview ("awaiting sign-off", "recent decisions") and the Invoice Pool's
 * *Request release*. Whoever decides everything signs their own.
 */
export function raisesForSignOff(holder: ActionHolder): boolean {
  return canDo(holder, 'treasury', 'create') && !decidesEverything(holder)
}

/**
 * Reads every department's pool — Dept Pool · View at All. Since the Dept Manager went (2026-10-17 — the user:
 * "全删"), the pool pages are for this reader alone: anybody short of All reads none of them, never their own
 * department's (no page draws that any more).
 */
export function readsEveryPool(holder: ActionHolder): boolean {
  return canDo(holder, 'dept_pool', 'view', 'all')
}

/** Every Settings tab (Settings · Manage); otherwise Finance's chart-of-accounts tabs. */
export function seesAllSettings(holder: ActionHolder): boolean {
  return canDo(holder, 'settings', 'manage')
}

/** Reports company-wide (Reports · View); otherwise their own segment's (Dept reports). */
export function reportsCompanyWide(holder: ActionHolder): boolean {
  return canDo(holder, 'reports', 'view')
}
