'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { notifyApprovalDecision } from '@/lib/slack'

// ─── Approve request (Principal) ──────────────────────────────────────────────

export async function approveRequest(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (!id) throw new Error('Approval id is required')

  // Fetch the approval to learn what it references
  const { data: approval, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single()

  if (fetchError || !approval) {
    throw new Error('Approval not found or already processed')
  }

  // Security: prevent self-approval (defense in depth — CHECK constraint enforces too)
  if (approval.submitted_by === user.id) {
    throw new Error('Cannot approve your own submission')
  }

  // Approving moves money (loan disbursement, voucher exec, pool release) — block if today's period is locked
  await assertPeriodOpen(supabase, new Date())

  const now = new Date().toISOString()

  // Update the approval_request
  const { error: approvalError } = await supabase
    .from('approval_requests')
    .update({
      status: 'approved',
      workflow_state: 'approved',
      approved_by: user.id,
      approved_at: now,
      notes,
    })
    .eq('id', id)
    .eq('status', 'pending') // optimistic lock via status

  if (approvalError) {
    throw new Error(`Failed to update approval: ${approvalError.message}`)
  }

  // ─── Side effects based on request_type ───
  if (approval.request_type === 'new_loan') {
    // Activate the loan
    const { error: loanError } = await supabase
      .from('loans')
      .update({
        status: 'active',
        approved_by: user.id,
        approved_at: now,
        disbursement_date: new Date().toISOString().slice(0, 10),
      })
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')

    if (loanError) {
      throw new Error(
        `Approval recorded but loan activation failed: ${loanError.message}`
      )
    }

    // Auto-deduct from Operation Pool (fund_out entry)
    const { data: loanForPool } = await supabase
      .from('loans')
      .select('company_id, principal, companies(name)')
      .eq('id', approval.reference_id)
      .single()

    if (loanForPool) {
      const companyName = (loanForPool.companies as { name: string } | null)?.name ?? 'Unknown'
      await supabase.from('hv_operating_fund').insert({
        transaction_type: 'fund_out' as const,
        amount: Number(loanForPool.principal),
        description: `Loan disbursement: ${companyName}`,
        reference_id: approval.reference_id,
        reference_table: 'loans',
        created_by: user.id,
      })
    }

    // Auto-deduct primary bank account for loan disbursement
    const { data: primaryBank } = await supabase
      .from('bank_accounts')
      .select('id, current_balance')
      .eq('is_primary', true)
      .eq('status', 'active')
      .single()

    if (primaryBank) {
      const loanAmount = Number(approval.amount ?? 0)
      if (Number(primaryBank.current_balance) < loanAmount) {
        // Don't block loan approval, but log the warning
        console.warn(`Loan approved but bank balance insufficient: balance=${primaryBank.current_balance}, loan=${loanAmount}`)
      }
      await supabase
        .from('bank_accounts')
        .update({ current_balance: Number(primaryBank.current_balance) - loanAmount })
        .eq('id', primaryBank.id)
    }
  } else if (approval.request_type === 'invoice_pool_release') {
    // Insert release transaction into invoice_payout_pool
    const { error: releaseError } = await supabase
      .from('invoice_payout_pool')
      .insert({
        transaction_type: 'release',
        amount: Number(approval.amount ?? 0),
        description: approval.description ?? 'Invoice pool release',
        release_approved_by: user.id,
        release_approved_at: now,
      })

    if (releaseError) {
      throw new Error(
        `Approval recorded but pool release failed: ${releaseError.message}`
      )
    }
  } else if (approval.request_type === 'new_fund_source') {
    // Phase 7: flip the fund_source from pending_approval → active, post the
    // Venture Pool credit (hv_operating_fund.fund_in), and bump the primary
    // bank balance. All three only fire on approval — on submit the
    // fund_source sits quietly in pending_approval with zero ledger impact.
    const { data: fundSource, error: fsFetchError } = await supabase
      .from('fund_sources')
      .select('id, amount, source_type, from_company_id, from_director_id')
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')
      .single()

    if (fsFetchError || !fundSource) {
      throw new Error('Approval recorded but fund source not found or not pending')
    }

    const { error: fsUpdateError } = await supabase
      .from('fund_sources')
      .update({ status: 'active', updated_at: now })
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')

    if (fsUpdateError) {
      throw new Error(`Approval recorded but fund source activation failed: ${fsUpdateError.message}`)
    }

    // Post the Venture Pool credit — mirrors the old inline createFundSource write
    const typeLabel = fundSource.source_type === 'subsidiary' ? 'subsidiary deposit'
      : fundSource.source_type === 'director_loan' ? 'director loan'
      : 'dept pool transfer'
    await supabase.from('hv_operating_fund').insert({
      transaction_type: 'fund_in' as const,
      amount: Number(fundSource.amount),
      description: `Fund source: ${typeLabel}`,
      reference_id: fundSource.id,
      reference_table: 'fund_sources',
      created_by: user.id,
    })

    // Bump primary bank account balance
    const { data: primaryBank } = await supabase
      .from('bank_accounts')
      .select('id, current_balance')
      .eq('is_primary', true)
      .eq('status', 'active')
      .single()
    if (primaryBank) {
      await supabase
        .from('bank_accounts')
        .update({ current_balance: Number(primaryBank.current_balance) + Number(fundSource.amount) })
        .eq('id', primaryBank.id)
    }
  } else if (approval.request_type === 'payment_voucher') {
    // Phase 4: approve the linked payment voucher
    const { error: pvError } = await supabase
      .from('payment_vouchers')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: now,
        notes,
      })
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')

    if (pvError) {
      throw new Error(
        `Approval recorded but voucher update failed: ${pvError.message}`
      )
    }
  }
  // Other request types (base_rate, tier_change, etc) handled in Phase 1.5+

  // Slack notification (non-blocking)
  notifyApprovalDecision(
    approval.request_type,
    'approved',
    approval.description ?? '',
    user.name
  ).catch(() => {})

  revalidatePath('/approvals')
  revalidatePath('/fund-out')
  revalidatePath('/overdue')
  revalidatePath('/invoice-pool')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  redirect('/approvals')
}

// ─── Reject request (Principal) ───────────────────────────────────────────────

export async function rejectRequest(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (!id) throw new Error('Approval id is required')
  if (!notes) throw new Error('Rejection reason is required')

  const { data: approval, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single()

  if (fetchError || !approval) {
    throw new Error('Approval not found or already processed')
  }

  const now = new Date().toISOString()

  const { error: approvalError } = await supabase
    .from('approval_requests')
    .update({
      status: 'rejected',
      workflow_state: 'rejected',
      approved_by: user.id,
      approved_at: now,
      notes,
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (approvalError) {
    throw new Error(`Failed to update approval: ${approvalError.message}`)
  }

  // ─── Side effects ───
  if (approval.request_type === 'new_loan') {
    const { error: loanError } = await supabase
      .from('loans')
      .update({
        status: 'cancelled',
        approved_by: user.id,
        approved_at: now,
      })
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')

    if (loanError) {
      throw new Error(
        `Rejection recorded but loan cancel failed: ${loanError.message}`
      )
    }
  } else if (approval.request_type === 'payment_voucher') {
    // Phase 4: void the linked payment voucher on rejection
    await supabase
      .from('payment_vouchers')
      .update({ status: 'voided' })
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')
  }

  revalidatePath('/approvals')
  revalidatePath('/fund-out')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  redirect('/approvals')
}
