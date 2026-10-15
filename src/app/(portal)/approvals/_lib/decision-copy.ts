import type { ApprovalRequestType } from '@/types'

// What deciding a request does, in a clause per request type (moved out of
// `[id]/_components/ApprovalActions.tsx` 2026-10-15, so the Finance phone
// app's sheets say the same). Each entry is the lead clause — the common
// suffix ("and records your decision in the audit trail" / "A written reason
// is required") is appended where it is shown. Record<> enforces
// exhaustiveness so new enum values can't sneak past the type checker.

export const APPROVE_LEAD: Record<ApprovalRequestType, string> = {
  new_loan: 'Approving activates the loan',
  new_contract: 'Approving stamps the service contract as approved',
  contract_change: 'Approving applies the contract change',
  dept_expense: 'Approving posts the expense to the department pool',
  advance: 'Approving releases the director advance',
  base_rate: 'Approving applies the new base rate',
  tier_change: 'Approving applies the tier change',
  escalation: 'Approving acknowledges the escalation',
  invoice_pool_release: 'Approving releases the invoice pool funds',
  profit_withdrawal: 'Approving authorises the profit withdrawal',
  payment_voucher: 'Approving authorises the payment for execution',
  new_fund_source: 'Approving activates the fund source and credits the Venture Pool',
  hr_costing: 'Approving locks in the HR costing snapshot for Finance to execute',
  payroll_run: 'Approving pays out the monthly payroll to every employee and director',
  dept_payment_request: 'Approving debits the dept pool and routes the request to Finance to generate the PV',
  loan_cancel: 'Approving reverses the booked loan — bank, Venture Pool and GL — and marks it cancelled',
}

export const REJECT_LEAD: Record<ApprovalRequestType, string> = {
  new_loan: 'Rejecting cancels the loan',
  new_contract: 'Rejecting cancels the contract',
  contract_change: 'Rejecting keeps the contract as-is',
  dept_expense: 'Rejecting discards the expense — the pool is unchanged',
  advance: 'Rejecting cancels the advance request',
  base_rate: 'Rejecting keeps the current base rate',
  tier_change: 'Rejecting keeps the current tier',
  escalation: 'Rejecting dismisses the escalation',
  invoice_pool_release: 'Rejecting keeps the funds in the invoice pool',
  profit_withdrawal: 'Rejecting denies the withdrawal',
  payment_voucher: 'Rejecting cancels the payment — no funds will be transferred',
  new_fund_source: 'Rejecting cancels the fund source — no capital will be posted',
  hr_costing: 'Rejecting keeps the HR snapshot as-is and blocks execution',
  payroll_run: 'Rejecting sends the payroll back to HR as draft — no one gets paid',
  dept_payment_request: 'Rejecting cancels the request — pool is unchanged, Finance is not notified',
  loan_cancel: 'Rejecting keeps the loan active',
}

/** The lead clause for any request type (one added since reads generically). */
export function approveLead(type: string): string {
  return (APPROVE_LEAD as Record<string, string>)[type] ?? 'Approving authorises the request'
}

export function rejectLead(type: string): string {
  return (REJECT_LEAD as Record<string, string>)[type] ?? 'Rejecting turns the request down'
}
