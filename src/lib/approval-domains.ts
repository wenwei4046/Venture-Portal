/**
 * Who decides an approval (2026-10-09 — PR2b of the People Management revamp:
 * approvals go by domain).
 *
 * A request is decided by whoever holds the Approve of its DOMAIN, or the
 * queue's own Approve (everything in it) — and never by whoever raised it,
 * unless their account is the owner kind (the Principal approves their own,
 * user 2026-08-06; a checker approving their own submission is no check).
 *
 * The twin of the database's `approval_domain()` / `approvable_types()` /
 * `approver_may()` (migration 20261009010000): the approval functions and the
 * row policies refuse exactly what this hides, so a button is never drawn for
 * a decision the database would refuse.
 */

import type { ApprovalRequestType } from '@/types'
import { canDo, type ActionHolder } from '@/lib/permission-actions'

type Domain = 'treasury' | 'hr_costing' | 'director_salary'

/** The function whose Approve signs a request type off; null = only the queue's own Approve. */
export const APPROVAL_DOMAIN: Readonly<Record<ApprovalRequestType, Domain | null>> = {
  payment_voucher: 'treasury',
  new_loan: 'treasury',
  loan_cancel: 'treasury',
  new_fund_source: 'treasury',
  tier_change: 'treasury',
  base_rate: 'treasury',
  dept_expense: 'treasury',
  dept_payment_request: 'treasury',
  advance: 'treasury',
  profit_withdrawal: 'treasury',
  escalation: 'treasury',
  payroll_run: 'hr_costing',
  hr_costing: 'hr_costing',
  invoice_pool_release: 'director_salary',
  new_contract: null,
  contract_change: null,
}

/** Somebody gates can ask about approvals: their keys, actions and the account behind them. */
export interface Approver extends ActionHolder {
  id: string
  role: string
  /** The real account kind while a Principal is masked (View as). */
  actualRole?: string
}

/** The request types they may decide. */
export function approvableTypes(user: ActionHolder | null | undefined): ApprovalRequestType[] {
  if (!user) return []
  const types = Object.keys(APPROVAL_DOMAIN) as ApprovalRequestType[]
  if (canDo(user, 'approvals', 'approve')) return types
  const held = new Set<Domain>()
  if (canDo(user, 'treasury', 'approve')) held.add('treasury')
  if (canDo(user, 'hr_costing', 'approve')) held.add('hr_costing')
  if (canDo(user, 'director_salary', 'approve')) held.add('director_salary')
  return types.filter((t) => {
    const domain = APPROVAL_DOMAIN[t]
    return domain !== null && held.has(domain)
  })
}

/** Is this account the owner kind — the Principal, who may decide their own requests? */
function isOwnerKind(user: Approver): boolean {
  return user.role === 'principal' && (user.actualRole === undefined || user.actualRole === 'principal')
}

/**
 * May they decide a request (or a combined one: every type in it, every
 * submitter of it)? Why not, when not — for the row's title.
 */
export function decision(
  user: Approver | null | undefined,
  requestTypes: readonly string[],
  submitterIds: readonly string[],
): { may: true } | { may: false; why: string } {
  if (!user) return { may: false, why: 'Sign in to decide' }
  const mine = new Set<string>(approvableTypes(user))
  if (requestTypes.length === 0 || !requestTypes.every((t) => mine.has(t))) {
    return { may: false, why: 'Not yours to decide — your Approve does not reach this kind of request' }
  }
  if (!isOwnerKind(user) && submitterIds.includes(user.id)) {
    return { may: false, why: 'You raised it — somebody else decides it' }
  }
  return { may: true }
}

export function canDecide(
  user: Approver | null | undefined,
  requestTypes: readonly string[],
  submitterIds: readonly string[],
): boolean {
  return decision(user, requestTypes, submitterIds).may
}

/** The queue opens for whoever may see it (Approvals · View) or decide anything in it. */
export function canSeeApprovals(user: ActionHolder | null | undefined): boolean {
  return !!user && (canDo(user, 'approvals', 'view') || approvableTypes(user).length > 0)
}
