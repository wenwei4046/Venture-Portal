'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { PaymentType } from '@/types'

// ─── Create new loan (Finance) ────────────────────────────────────────────────

export async function createLoan(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const companyId = (formData.get('company_id') as string) ?? ''
  const principal = parseFloat((formData.get('principal') as string) ?? '0')
  const repaymentTerms = (formData.get('repayment_terms') as string) ?? ''

  if (!companyId) throw new Error('Company is required')
  if (isNaN(principal) || principal <= 0) {
    throw new Error('Principal must be greater than 0')
  }
  if (principal > 100_000_000) {
    throw new Error('Principal exceeds RM 100M ceiling')
  }

  // ─── Look up active base rate ───
  const { data: baseRate, error: brError } = await supabase
    .from('base_rate_history')
    .select('base_rate, effective_from, effective_to')
    .not('approved_at', 'is', null)
    .lte('effective_from', dayjs().format('YYYY-MM-DD'))
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (brError) throw new Error(`Base rate lookup failed: ${brError.message}`)
  if (!baseRate) {
    throw new Error(
      'No approved base rate found. Principal must approve a base rate before loans can be created.'
    )
  }

  // ─── Look up company's tier + premium ───
  const { data: company, error: cError } = await supabase
    .from('companies')
    .select('name, tier')
    .eq('id', companyId)
    .eq('is_active', true)
    .single()

  if (cError || !company) throw new Error('Company not found or inactive')

  const { data: tierConfig, error: tcError } = await supabase
    .from('tier_config')
    .select('premium_rate')
    .eq('tier', company.tier)
    .single()

  if (tcError || !tierConfig) {
    throw new Error(`Tier premium for ${company.tier} not configured`)
  }

  const base = Number(baseRate.base_rate)
  const premium = Number(tierConfig.premium_rate)
  const effective = base + premium

  // ─── INSERT loan (pending_approval) ───
  const { data: loan, error: loanError } = await supabase
    .from('loans')
    .insert({
      company_id: companyId,
      principal,
      base_rate: base,
      risk_premium: premium,
      effective_rate: effective,
      repayment_terms: repaymentTerms || null,
      status: 'pending_approval',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (loanError || !loan) {
    throw new Error(`Failed to create loan: ${loanError?.message ?? 'unknown'}`)
  }

  // ─── INSERT approval request ───
  // NOTE: Not atomic with loan insert. If this fails, we have an orphan
  // loan in pending_approval. Phase 1.5 should add a Postgres function
  // with SECURITY DEFINER to make this atomic.
  const { error: approvalError } = await supabase.from('approval_requests').insert({
    request_type: 'new_loan',
    reference_id: loan.id,
    reference_table: 'loans',
    submitted_by: user.id,
    description: `New loan to ${company.name} (${company.tier})`,
    amount: principal,
    status: 'pending',
    workflow_state: 'submitted',
  })

  if (approvalError) {
    throw new Error(
      `Loan created but approval request failed: ${approvalError.message}. Contact admin.`
    )
  }

  revalidatePath('/fund-out')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  redirect(`/fund-out/${loan.id}`)
}

// ─── Record repayment (Finance) ───────────────────────────────────────────────

export async function recordRepayment(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const loanId = (formData.get('loan_id') as string) ?? ''
  const paymentType = (formData.get('payment_type') as PaymentType) ?? 'interest'
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const paymentDate = (formData.get('payment_date') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (!loanId) throw new Error('Loan id is required')
  if (!['principal', 'interest', 'penalty', 'netting'].includes(paymentType)) {
    throw new Error('Invalid payment type')
  }
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  if (!paymentDate) {
    throw new Error('Payment date is required')
  }
  if (dayjs(paymentDate).isAfter(dayjs(), 'day')) {
    throw new Error('Payment date cannot be in the future')
  }

  // Check loan is active and amount doesn't exceed outstanding for principal payments
  const { data: loan, error: loanError } = await supabase
    .from('loans')
    .select('status, principal')
    .eq('id', loanId)
    .single()

  if (loanError || !loan) throw new Error('Loan not found')
  if (loan.status !== 'active') {
    throw new Error(`Cannot record repayment on ${loan.status} loan`)
  }

  // For principal payments, check against outstanding via the view
  if (paymentType === 'principal') {
    const { data: outstanding } = await supabase
      .from('loan_outstanding')
      .select('outstanding')
      .eq('loan_id', loanId)
      .single()

    const currentOutstanding = Number(outstanding?.outstanding ?? loan.principal)
    if (amount > currentOutstanding) {
      throw new Error(
        `Principal payment ${amount} exceeds outstanding ${currentOutstanding}`
      )
    }
  }

  const { error: insertError } = await supabase.from('repayments').insert({
    loan_id: loanId,
    amount,
    payment_type: paymentType,
    payment_date: paymentDate,
    notes,
    created_by: user.id,
  })

  if (insertError) {
    throw new Error(`Failed to record repayment: ${insertError.message}`)
  }

  revalidatePath(`/fund-out/${loanId}`)
  revalidatePath('/fund-out')
  revalidatePath('/dashboard')
}

// ─── Cancel loan (Finance — only pending_approval) ───────────────────────────

export async function cancelLoan(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Loan id is required')

  // Only allow cancel if still pending_approval (Finance's submission window)
  const { data: loan } = await supabase
    .from('loans')
    .select('status')
    .eq('id', id)
    .single()

  if (!loan) throw new Error('Loan not found')
  if (loan.status !== 'pending_approval') {
    throw new Error(
      `Can only cancel pending_approval loans (current status: ${loan.status})`
    )
  }

  // Cancel the approval request first
  const { error: approvalErr } = await supabase
    .from('approval_requests')
    .update({ status: 'rejected', workflow_state: 'rejected' })
    .eq('reference_id', id)
    .eq('reference_table', 'loans')
    .eq('status', 'pending')

  if (approvalErr) {
    throw new Error(`Failed to cancel approval: ${approvalErr.message}`)
  }

  // Note: loans_principal_update RLS would block Finance from updating loans
  // directly. The approval rejection path handles the loan status transition
  // via the approval workflow. For pending_approval loans, Finance cancels
  // via rejecting the approval_request and Principal-only update policy is
  // bypassed by the approval_requests update above (Finance CAN update
  // approvals they submitted).
  //
  // In Phase 1.5, add a trigger on approval_requests to auto-update loan
  // status when approval is rejected/cancelled.

  void user
  revalidatePath('/fund-out')
  revalidatePath('/approvals')
  redirect('/fund-out')
}
