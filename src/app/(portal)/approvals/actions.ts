'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { computeDowngradedTier } from '@/lib/tier'
import { notifyApprovalDecision } from '@/lib/slack'
import type { CompanyTier } from '@/types'

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
  } else if (approval.request_type === 'escalation') {
    // Escalation approval → tier downgrade on the related company.
    // reference_id points at overdue_records; trace back to company via loan.
    const { data: overdue } = await supabase
      .from('overdue_records')
      .select('loan_id')
      .eq('id', approval.reference_id)
      .single()

    if (!overdue) {
      throw new Error('Escalation approval recorded but overdue record not found')
    }

    const { data: loan } = await supabase
      .from('loans')
      .select('company_id')
      .eq('id', overdue.loan_id)
      .single()

    if (!loan) {
      throw new Error('Escalation approval recorded but loan not found')
    }

    const { data: company } = await supabase
      .from('companies')
      .select('tier, name')
      .eq('id', loan.company_id)
      .single()

    if (!company) {
      throw new Error('Escalation approval recorded but company not found')
    }

    // Downgrade one tier: T1→T2→T3→T4, stop at T4 (lowest).
    // Logic extracted to `src/lib/tier.ts` + unit-tested in `tier.test.ts`
    // (Phase 1.5 Step 1 — M3 regression lock).
    const nextTier = computeDowngradedTier(company.tier as CompanyTier)

    if (nextTier) {
      const { error: tierError } = await supabase
        .from('companies')
        .update({ tier: nextTier, updated_at: now })
        .eq('id', loan.company_id)

      if (tierError) {
        throw new Error(
          `Escalation approved but tier downgrade failed: ${tierError.message}`
        )
      }
    }
    // If company is already at T4, approval is recorded but no downgrade
    // is possible. Principal sees approval succeeded; next action is manual
    // recovery / write-off (out of Phase 1 scope).
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
