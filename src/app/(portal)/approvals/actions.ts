'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { notifyApprovalDecision } from '@/lib/slack'
import { applyVoucherPaidSideEffects } from '@/lib/voucher-paid-helpers'

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

  // Phase 7 Step 9: grouped approvals must go through approveRequestGroup
  if (approval.group_id) {
    throw new Error('This request is part of a combined approval — use the combined card to approve both together.')
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
      await supabase.from('venture_pool').insert({
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
    // Venture Pool credit (venture_pool.fund_in), and bump the primary
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
    await supabase.from('venture_pool').insert({
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
    // Approve + execute in one step. Sets voucher to 'paid' directly, then
    // applies bank debit / pool adjust / loan sync / GL journal side effects.
    const paymentDate = dayjs().format('YYYY-MM-DD')

    const { data: voucher, error: pvFetchErr } = await supabase
      .from('payment_vouchers')
      .select('*')
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')
      .single()

    if (pvFetchErr || !voucher) {
      throw new Error(
        `Approval recorded but voucher fetch failed: ${pvFetchErr?.message ?? 'not found'}`
      )
    }

    // Bank balance check on the debit side
    if (voucher.bank_account_id && voucher.direction === 'debit') {
      const { data: bank } = await supabase
        .from('bank_accounts')
        .select('current_balance, bank_name')
        .eq('id', voucher.bank_account_id)
        .single()
      if (bank) {
        const balance = Number(bank.current_balance)
        const amt = Number(voucher.amount)
        if (balance < amt) {
          throw new Error(
            `Insufficient bank balance. ${bank.bank_name} has RM ${balance.toFixed(2)} but payment requires RM ${amt.toFixed(2)}.`
          )
        }
      }
    }

    const { error: pvError } = await supabase
      .from('payment_vouchers')
      .update({
        status: 'paid',
        approved_by: user.id,
        approved_at: now,
        executed_by: user.id,
        executed_at: now,
        payment_date: paymentDate,
        notes,
      })
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')

    if (pvError) {
      throw new Error(
        `Approval recorded but voucher update failed: ${pvError.message}`
      )
    }

    await applyVoucherPaidSideEffects(supabase, voucher, paymentDate, user.id)
  } else if (approval.request_type === 'hr_costing') {
    // Phase 7 Step 15: flip HR cost snapshot to approved_for_execution;
    // Finance then clicks Execute on /hr-costing.
    const { error: hrErr } = await supabase
      .from('hr_cost_submissions')
      .update({ execution_state: 'approved_for_execution' })
      .eq('id', approval.reference_id)
      .eq('execution_state', 'pending')

    if (hrErr) {
      throw new Error(
        `Approval recorded but HR costing state update failed: ${hrErr.message}`
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

  // Phase 7 Step 9: grouped approvals must go through rejectRequestGroup
  if (approval.group_id) {
    throw new Error('This request is part of a combined approval — use the combined card to reject both together.')
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

// ─── Approve combined group (Principal) — Phase 7 Step 9 ─────────────────────
//
// Used by Loan OUT flow: one button approves both the new_loan AND its paired
// payment_voucher (loan disbursement). Money moves on approval — voucher is
// flipped to 'paid' with executed metadata; hv_fund fund_out + bank debit fire
// once.

export async function approveRequestGroup(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const groupId = (formData.get('group_id') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (!groupId) throw new Error('group_id is required')

  await assertPeriodOpen(supabase, new Date())

  // Fetch both approval_requests in the group
  const { data: group, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'pending')

  if (fetchError || !group || group.length === 0) {
    throw new Error('Approval group not found or already processed')
  }

  // Self-approval guard — applies if ANY request in the group is self-submitted
  if (group.some((r) => r.submitted_by === user.id)) {
    throw new Error('Cannot approve your own submission')
  }

  const loanApproval = group.find((r) => r.request_type === 'new_loan')
  const voucherApprovals = group.filter((r) => r.request_type === 'payment_voucher')

  if (voucherApprovals.length === 0) {
    throw new Error('Combined approval group must include at least one payment voucher')
  }

  const now = new Date().toISOString()
  const todayStr = now.slice(0, 10)

  // ── Batch disbursement mode: no new_loan, N payment_vouchers ──────────────
  // Payroll disbursement vouchers ship as one approval group (same group_id)
  // with N = 32 typical. Flip each voucher to paid and run the normal pool /
  // bank / GL side effects per voucher via the shared helper. No loan flow.
  if (!loanApproval) {
    const { error: groupUpdateError } = await supabase
      .from('approval_requests')
      .update({
        status: 'approved',
        workflow_state: 'approved',
        approved_by: user.id,
        approved_at: now,
        notes,
      })
      .eq('group_id', groupId)
      .eq('status', 'pending')

    if (groupUpdateError) {
      throw new Error(`Failed to approve group: ${groupUpdateError.message}`)
    }

    let processed = 0
    for (const va of voucherApprovals) {
      if (!va.reference_id) continue

      const { data: v } = await supabase
        .from('payment_vouchers')
        .select('*')
        .eq('id', va.reference_id)
        .eq('status', 'pending_approval')
        .single()

      if (!v) continue

      const { error: flipErr } = await supabase
        .from('payment_vouchers')
        .update({
          status: 'paid',
          approved_by: user.id,
          approved_at: now,
          executed_by: user.id,
          executed_at: now,
          payment_date: todayStr,
          notes,
        })
        .eq('id', v.id)
        .eq('status', 'pending_approval')

      if (flipErr) {
        throw new Error(`Group approved but voucher ${v.voucher_no} flip failed: ${flipErr.message}`)
      }

      await applyVoucherPaidSideEffects(supabase, v, todayStr, user.id)
      processed++
    }

    notifyApprovalDecision(
      'payment_voucher',
      'approved',
      `Batch of ${processed} vouchers`,
      user.name,
    ).catch(() => {})

    revalidatePath('/approvals')
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidatePath('/hr-costing/payment')
    redirect('/approvals')
  }

  // ── Loan OUT mode: 1 new_loan + 1 payment_voucher ─────────────────────────
  if (voucherApprovals.length !== 1) {
    throw new Error('Loan OUT approval group must include exactly one payment_voucher')
  }
  const voucherApproval = voucherApprovals[0]

  // ─── Pre-flight: bank balance check ───
  const { data: voucher } = await supabase
    .from('payment_vouchers')
    .select('id, amount, bank_account_id, voucher_no, description')
    .eq('id', voucherApproval.reference_id)
    .eq('status', 'pending_approval')
    .single()

  if (!voucher) throw new Error('Paired voucher not found or not pending approval')

  const { data: primaryBank } = await supabase
    .from('bank_accounts')
    .select('id, current_balance, bank_name')
    .eq('is_primary', true)
    .eq('status', 'active')
    .single()

  if (primaryBank) {
    const balance = Number(primaryBank.current_balance)
    const amount = Number(voucher.amount)
    if (balance < amount) {
      throw new Error(
        `Insufficient bank balance. ${primaryBank.bank_name} has RM ${balance.toFixed(2)} but loan disbursement requires RM ${amount.toFixed(2)}.`
      )
    }
  }

  // ─── 1) Flip both approval_requests to approved ───
  const { error: groupUpdateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'approved',
      workflow_state: 'approved',
      approved_by: user.id,
      approved_at: now,
      notes,
    })
    .eq('group_id', groupId)
    .eq('status', 'pending')

  if (groupUpdateError) {
    throw new Error(`Failed to approve group: ${groupUpdateError.message}`)
  }

  // ─── 2) Activate the loan ───
  const { error: loanError } = await supabase
    .from('loans')
    .update({
      status: 'active',
      approved_by: user.id,
      approved_at: now,
      disbursement_date: todayStr,
    })
    .eq('id', loanApproval.reference_id)
    .eq('status', 'pending_approval')

  if (loanError) {
    throw new Error(`Group approved but loan activation failed: ${loanError.message}`)
  }

  // ─── 3) Flip voucher to paid (status transition only — money moves below) ───
  const { error: voucherError } = await supabase
    .from('payment_vouchers')
    .update({
      status: 'paid',
      approved_by: user.id,
      approved_at: now,
      executed_by: user.id,
      executed_at: now,
      payment_date: todayStr,
    })
    .eq('id', voucher.id)
    .eq('status', 'pending_approval')

  if (voucherError) {
    throw new Error(`Group approved but voucher execute failed: ${voucherError.message}`)
  }

  // ─── 4) Venture Pool: fund_out ledger entry ───
  await supabase.from('venture_pool').insert({
    transaction_type: 'fund_out' as const,
    amount: Number(voucher.amount),
    description: `${voucher.voucher_no}: ${voucher.description}`,
    reference_id: loanApproval.reference_id,
    reference_table: 'loans',
    created_by: user.id,
  })

  // ─── 5) Debit primary bank ───
  if (primaryBank) {
    await supabase
      .from('bank_accounts')
      .update({
        current_balance: Number(primaryBank.current_balance) - Number(voucher.amount),
      })
      .eq('id', primaryBank.id)
  }

  // Slack notify (best-effort)
  notifyApprovalDecision(
    'new_loan',
    'approved',
    loanApproval.description ?? '',
    user.name
  ).catch(() => {})

  revalidatePath('/approvals')
  revalidatePath('/fund-out')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  redirect('/approvals')
}

// ─── Reject combined group (Principal) — Phase 7 Step 9 ──────────────────────

export async function rejectRequestGroup(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const groupId = (formData.get('group_id') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (!groupId) throw new Error('group_id is required')
  if (!notes) throw new Error('Rejection reason is required')

  const { data: group, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'pending')

  if (fetchError || !group || group.length === 0) {
    throw new Error('Approval group not found or already processed')
  }

  const now = new Date().toISOString()

  // ─── 1) Reject all approval_requests in the group ───
  const { error: groupUpdateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'rejected',
      workflow_state: 'rejected',
      approved_by: user.id,
      approved_at: now,
      notes,
    })
    .eq('group_id', groupId)
    .eq('status', 'pending')

  if (groupUpdateError) {
    throw new Error(`Failed to reject group: ${groupUpdateError.message}`)
  }

  // ─── 2) Cancel the loan (if present) ───
  const loanApproval = group.find((r) => r.request_type === 'new_loan')
  if (loanApproval?.reference_id) {
    await supabase
      .from('loans')
      .update({
        status: 'cancelled',
        approved_by: user.id,
        approved_at: now,
      })
      .eq('id', loanApproval.reference_id)
      .eq('status', 'pending_approval')
  }

  // ─── 3) Void every voucher in the group (N for batch, 1 for Loan OUT) ───
  const voucherApprovals = group.filter((r) => r.request_type === 'payment_voucher')
  for (const va of voucherApprovals) {
    if (!va.reference_id) continue
    await supabase
      .from('payment_vouchers')
      .update({ status: 'voided' })
      .eq('id', va.reference_id)
      .eq('status', 'pending_approval')
  }

  revalidatePath('/approvals')
  revalidatePath('/fund-out')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  revalidatePath('/hr-costing/payment')
  redirect('/approvals')
}
