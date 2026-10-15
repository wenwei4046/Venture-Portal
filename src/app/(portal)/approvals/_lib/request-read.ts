import type { createClient } from '@/lib/supabase/server'
import type { User } from '@/types'
import { decision } from '@/lib/approval-domains'
import { canSeePayrollPayouts } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import { getVoucherDetailContext, type VoucherDetailContext } from '@/lib/voucher-detail'

// One approval request, read (2026-10-15 — moved out of
// `/approvals/[id]/page.tsx` word for word, so the Finance phone app's request
// screen reads the same): the request, who raised it, whether this reader may
// decide it (and why not), a loan's terms or a voucher's whole context, and
// whether the bank would go short. A payroll voucher's request is not this
// reader's without Payroll payouts (it is titled with who is paid what).

type Client = Awaited<ReturnType<typeof createClient>>

export interface ApprovalLoanContext {
  company_name?: string
  principal?: number
  effective_rate?: number
  base_rate?: number
  risk_premium?: number
  loan_id: string
}

export type ApprovalRequestRead =
  | { found: false }
  | {
      found: true
      approval: Record<string, unknown> & {
        id: string
        status: string
        request_type: string
        description: string | null
        submitted_by: string
        created_at: string
        approved_at: string | null
        notes: string | null
        reference_id: string | null
        group_id: string | null
        amount: number | string | null
      }
      submitterName: string | null
      verdict: { may: true } | { may: false; why: string }
      loanContext: ApprovalLoanContext | null
      voucherContext: VoucherDetailContext | null
      insufficientBalance: boolean
    }

export async function readApprovalRequest(supabase: Client, user: User, id: string): Promise<ApprovalRequestRead> {
  const { data: approval, error } = await supabase.from('approval_requests').select('*').eq('id', id).single()
  if (error || !approval) return { found: false }
  const verdict = decision(user, [approval.request_type], [approval.submitted_by])

  const { data: submitter } = await supabase.from('users').select('name').eq('id', approval.submitted_by).single()

  // Load reference object if new_loan
  let loanContext: ApprovalLoanContext | null = null
  if (approval.request_type === 'new_loan' && approval.reference_id) {
    const { data: loan } = await supabase.from('loans').select('*, companies(name, short_code)').eq('id', approval.reference_id).single()
    if (loan) {
      loanContext = {
        company_name: loan.companies?.name,
        principal: Number(loan.principal),
        effective_rate: Number(loan.effective_rate),
        base_rate: Number(loan.base_rate),
        risk_premium: Number(loan.risk_premium),
        loan_id: loan.id,
      }
    }
  }

  // Load voucher detail if payment_voucher
  let voucherContext: VoucherDetailContext | null = null
  if (approval.request_type === 'payment_voucher' && approval.reference_id) {
    voucherContext = await getVoucherDetailContext(supabase, approval.reference_id)
  }
  // The request for a payroll voucher is titled with who is paid what, and
  // shows the voucher under it: not without Payroll payouts (2026-10-02).
  if (voucherContext && isPayrollReference(voucherContext.voucher.reference_type) && !canSeePayrollPayouts(user)) {
    return { found: false }
  }

  // Issue #4 pre-check: Debit voucher with insufficient bank balance should not
  // be approvable — otherwise the approval action will throw mid-flight, and
  // for N-voucher batches the earlier vouchers already committed.
  const insufficientBalance =
    voucherContext !== null &&
    voucherContext.voucher.direction === 'debit' &&
    voucherContext.bank !== null &&
    voucherContext.bank.current_balance < Number(voucherContext.voucher.amount)

  return {
    found: true,
    approval: approval as unknown as Extract<ApprovalRequestRead, { found: true }>['approval'],
    submitterName: (submitter?.name as string | undefined) ?? null,
    verdict,
    loanContext,
    voucherContext,
    insufficientBalance,
  }
}
