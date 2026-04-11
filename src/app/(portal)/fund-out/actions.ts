'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { PaymentType } from '@/types'

// ─── Create new loan (Finance) ────────────────────────────────────────────────

export async function createLoan(formData: FormData) {
  await requireRole(['finance'])
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

  // ─── Atomic loan + approval creation (M1 fix) ───
  const { data: loanId, error: rpcError } = await supabase.rpc(
    'create_loan_with_approval',
    {
      p_company_id: companyId,
      p_principal: principal,
      p_base_rate: base,
      p_risk_premium: premium,
      p_effective_rate: effective,
      p_repayment_terms: repaymentTerms || undefined,
      p_company_name: company.name,
      p_company_tier: company.tier,
    }
  )

  if (rpcError || !loanId) {
    throw new Error(`Failed to create loan: ${rpcError?.message ?? 'unknown'}`)
  }

  revalidatePath('/fund-out')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  redirect(`/fund-out/${loanId}`)
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
  await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Loan id is required')

  // M2 fix (Phase 2 Step 2): atomic cancel via SECURITY DEFINER RPC.
  // Both the loan and its paired approval_request are updated in one
  // transaction. Previously Finance could only reject the approval, leaving
  // the loan stuck in pending_approval forever because loans_principal_update
  // RLS blocks Finance from updating loans.
  //
  // See supabase/migrations/20260101000017_approval_cascade_trigger.sql
  const { error: rpcErr } = await supabase.rpc('cancel_loan_and_approval', {
    p_loan_id: id,
  })

  if (rpcErr) {
    throw new Error(`Failed to cancel loan: ${rpcErr.message}`)
  }

  revalidatePath('/fund-out')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  redirect('/fund-out')
}

// ─── Export loan portfolio as CSV ─────────────────────────────────────────────

export async function exportLoansCSV(): Promise<string> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, companies(name, short_code)')
    .order('status')
    .order('disbursement_date', { ascending: false })

  if (!loans || loans.length === 0) throw new Error('No loans to export')

  const header = 'Company,Short Code,Principal (RM),Base Rate (%/mo),Risk Premium (%/mo),Effective Rate (%/mo),Disbursement Date,Status'
  const rows = loans.map(l => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const co = (l as any).companies
    return [
      `"${co?.name ?? ''}"`,
      co?.short_code ?? '',
      Number(l.principal).toFixed(2),
      (Number(l.base_rate) * 100).toFixed(3),
      (Number(l.risk_premium) * 100).toFixed(3),
      (Number(l.effective_rate) * 100).toFixed(3),
      l.disbursement_date ?? '',
      l.status,
    ].join(',')
  })

  return [header, ...rows].join('\n')
}
