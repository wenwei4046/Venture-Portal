'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { notifyApprovalDecision } from '@/lib/slack'
import { postJournalEntry } from '@/lib/journal'
import { resolveLoansReceivableLeaf } from '@/lib/loans-coa'

// Mig 197: dept name → equity GL code mirror (must match dept_pool_gl_code SQL helper).
const DEPT_POOL_GL: Record<string, string> = {
  Marketing: '3030',
  Finance: '3040',
  HR: '3050',
  'Director Office': '3070',
  Director: '3080',
}

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

  // P0-1: payment_voucher goes through approve_single_voucher RPC — atomic
  // flip + bank debit + pool adjust + repayment sync + GL journal in one
  // Postgres transaction. Early-return because the RPC does the approval flip
  // itself; skip the generic flip below.
  if (approval.request_type === 'payment_voucher') {
    // Principal may opt to allow dept-pool overdraw (e.g. payroll that can't
    // wait for invoice settlement). Default false → sufficiency check still blocks.
    const allowOverdraw = formData.get('allow_overdraw') === 'on'
    const { error: rpcErr } = await supabase.rpc('approve_single_voucher', {
      p_approval_id: id,
      p_user_id: user.id,
      p_notes: notes ?? '',
      p_allow_overdraw: allowOverdraw,
    })
    if (rpcErr) {
      throw new Error(`Approval failed: ${rpcErr.message}`)
    }

    notifyApprovalDecision(
      approval.request_type,
      'approved',
      approval.description ?? '',
      user.name
    ).catch(() => {})

    revalidatePath('/approvals')
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    redirect('/approvals')
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
    // Activate the loan. disbursement_date is preserved if Finance set it on
    // creation; the loans_default_disbursement_on_activate trigger (mig 222)
    // backfills CURRENT_DATE for legacy NULL rows.
    const { error: loanError } = await supabase
      .from('loans')
      .update({
        status: 'active',
        approved_by: user.id,
        approved_at: now,
      })
      .eq('id', approval.reference_id)
      .eq('status', 'pending_approval')

    if (loanError) {
      throw new Error(
        `Approval recorded but loan activation failed: ${loanError.message}`
      )
    }

    const loanAmount = Number(approval.amount ?? 0)

    // Venture Pool cash ledger: loan disbursement = fund_out (Phase 10 / mig 192).
    const { error: vpError } = await supabase
      .from('venture_pool')
      .insert({
        transaction_type: 'fund_out',
        amount: loanAmount,
        description: approval.description ?? `Loan disbursement — ${approval.reference_id}`,
        reference_id: approval.reference_id,
        reference_table: 'loans',
        created_by: user.id,
      })
    if (vpError) {
      throw new Error(`Approval recorded but venture_pool fund_out failed: ${vpError.message}`)
    }

    // Auto-deduct primary bank account for loan disbursement
    const { data: primaryBank } = await supabase
      .from('bank_accounts')
      .select('id, current_balance')
      .eq('is_primary', true)
      .eq('status', 'active')
      .single()

    if (primaryBank) {
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
    // Flip fund_source pending_approval → active + bump primary bank balance.
    // For source_type='department_pool', also debit the source dept pool
    // (expense_out) so the dept pool balance reflects the transfer to HV.
    const { data: fundSource, error: fsFetchError } = await supabase
      .from('fund_sources')
      .select('id, amount, source_type, from_company_id, from_director_id, from_department_id, effective_date, account_code')
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

    // Mig 193: department_pool transfers carry the source dept in
    // from_department_id (not from_company_id). Debit that pool so the source
    // dept's balance drops — pre-submit balance check in fund-in/actions.ts
    // has already guarded against insufficient funds.
    if (fundSource.source_type === 'department_pool' && fundSource.from_department_id) {
      const periodMonth = dayjs(fundSource.effective_date).startOf('month').format('YYYY-MM-DD')
      const amountLabel = Number(fundSource.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })
      const { error: deptDebitError } = await supabase
        .from('dept_pools')
        .insert({
          department_id: fundSource.from_department_id,
          transaction_type: 'expense_out',
          amount: Number(fundSource.amount),
          period_month: periodMonth,
          description: `Dept Pool → Venture transfer: RM ${amountLabel}`,
          approval_id: id,
          created_by: user.id,
        })

      if (deptDebitError) {
        throw new Error(`Approval recorded but dept pool debit failed: ${deptDebitError.message}`)
      }

      // Mig 197/P0-3: post dept pool → HV Operating Fund equity reclassification.
      const { data: srcDept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', fundSource.from_department_id)
        .single()
      const srcGl = srcDept?.name ? DEPT_POOL_GL[srcDept.name] : undefined
      if (srcGl) {
        await postJournalEntry(supabase, {
          transactionDate: fundSource.effective_date ?? new Date().toISOString().slice(0, 10),
          description: `Dept Pool → Venture transfer (${srcDept?.name}) — fund source ${fundSource.id}`,
          referenceType: 'fund_source',
          referenceId: fundSource.id,
          createdBy: user.id,
          lines: [
            { accountCode: srcGl, debit: Number(fundSource.amount), description: `${srcDept?.name} Pool transferred to HV` },
            { accountCode: '1010', credit: Number(fundSource.amount), description: 'HV Operating Fund from dept transfer' },
          ],
        })
      }
    }

    // Venture Pool cash ledger: fund source activation = fund_in (Phase 10 / mig 192).
    const { error: vpError } = await supabase
      .from('venture_pool')
      .insert({
        transaction_type: 'fund_in',
        amount: Number(fundSource.amount),
        description: approval.description ?? `Fund source: ${fundSource.source_type}`,
        reference_id: fundSource.id,
        reference_table: 'fund_sources',
        created_by: user.id,
      })
    if (vpError) {
      throw new Error(`Approval recorded but venture_pool fund_in failed: ${vpError.message}`)
    }

    // Bump primary bank account balance
    const { data: primaryBank } = await supabase
      .from('bank_accounts')
      .select('id, current_balance, gl_account_code')
      .eq('is_primary', true)
      .eq('status', 'active')
      .single()
    if (primaryBank) {
      await supabase
        .from('bank_accounts')
        .update({ current_balance: Number(primaryBank.current_balance) + Number(fundSource.amount) })
        .eq('id', primaryBank.id)
    }

    // Mig 197/P0-3: post fund source activation JE (dr Bank / cr Fund Sources Payable).
    // Mig 247: credit leg uses fundSource.account_code if Finance picked a specific
    // sub-account (e.g. "4001 — Lim Wei Siang"); falls back to the umbrella 4000
    // for legacy / unpicked rows. The trigger in mig 246 already enforces that
    // account_code, if set, is not a header.
    // Skip for department_pool source_type because the dept transfer JE above already
    // covers that flow (dept→HV is an equity reclass, not a new liability).
    if (fundSource.source_type !== 'department_pool') {
      const liabilityCode = fundSource.account_code ?? '4000'
      await postJournalEntry(supabase, {
        transactionDate: fundSource.effective_date ?? new Date().toISOString().slice(0, 10),
        description: approval.description ?? `Fund source activated — ${fundSource.source_type}`,
        referenceType: 'fund_source',
        referenceId: fundSource.id,
        createdBy: user.id,
        lines: [
          { accountCode: primaryBank?.gl_account_code ?? '3000', debit: Number(fundSource.amount), description: 'Bank — fund source received' },
          { accountCode: liabilityCode, credit: Number(fundSource.amount), description: `Fund source payable — ${fundSource.source_type}` },
        ],
      })
    }
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
  } else if (approval.request_type === 'dept_payment_request') {
    // PR #4: Principal #1 (expense). RPC debits the dept pool and flips the
    // dept_payment_request to pending_finance_pv so Finance can generate the PV.
    const { error: dprErr } = await supabase.rpc('approve_dept_payment_expense', {
      p_approval_id: id,
    })
    if (dprErr) {
      throw new Error(
        `Approval recorded but dept payment expense step failed: ${dprErr.message}`
      )
    }
  } else if (approval.request_type === 'loan_cancel') {
    // Item 3 + Codex review fix: atomic cancellation. The RPC now owns the
    // entire reversal (loan status, voucher void, venture_pool, bank bump,
    // reversing JE) inside one transaction, so a failure anywhere rolls
    // everything back. Caller is just a thin shim.
    const { error: ecErr } = await supabase
      .rpc('execute_loan_cancel', { p_loan_id: approval.reference_id })
    if (ecErr) {
      throw new Error(`Approval recorded but loan reversal failed: ${ecErr.message}`)
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
  } else if (approval.request_type === 'dept_payment_request') {
    // PR #4: flip dept_payment_request to rejected_expense (no pool debit).
    await supabase.rpc('reject_dept_payment_request', { p_approval_id: id })
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
  // Payroll disbursement vouchers ship as one approval group (same group_id),
  // N = 32 typical. TODO-2 β (migration 171) moves the full side-effect chain
  // (status flip, bank debit, pool adjust, repayment sync, GL journal) into
  // approve_voucher_batch — one Postgres transaction, no partial-commit risk.
  if (!loanApproval) {
    const { data: processedRows, error: rpcError } = await supabase.rpc(
      'approve_voucher_batch',
      {
        p_group_id: groupId,
        p_user_id: user.id,
        p_notes: notes ?? '',
      },
    )

    if (rpcError) {
      throw new Error(`Batch approval failed: ${rpcError.message}`)
    }

    const processed = Array.isArray(processedRows) ? processedRows.length : 0

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
    .select('id, current_balance, bank_name, gl_account_code')
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
  // disbursement_date preserved if Finance set it on creation; trigger
  // loans_default_disbursement_on_activate (mig 222) backfills today for NULLs.
  const { error: loanError } = await supabase
    .from('loans')
    .update({
      status: 'active',
      approved_by: user.id,
      approved_at: now,
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

  // ─── 4) Debit primary bank ───
  if (primaryBank) {
    await supabase
      .from('bank_accounts')
      .update({
        current_balance: Number(primaryBank.current_balance) - Number(voucher.amount),
      })
      .eq('id', primaryBank.id)
  }

  // ─── 5) Venture Pool cash ledger: loan disbursement = fund_out ──────────
  // Phase 10 / mig 192. The non-grouped new_loan branch in approveRequest
  // already does this; the combined-group path was missing it, so loan
  // approvals left venture_pool untouched even though bank was debited.
  // Surfaced by E2E Path 4 (2026-04-21).
  const { error: vpError } = await supabase
    .from('venture_pool')
    .insert({
      transaction_type: 'fund_out',
      amount: Number(voucher.amount),
      description: loanApproval.description ?? `Loan disbursement — ${loanApproval.reference_id}`,
      reference_id: loanApproval.reference_id,
      reference_table: 'loans',
      created_by: user.id,
    })
  if (vpError) {
    throw new Error(`Group approved but venture_pool fund_out failed: ${vpError.message}`)
  }

  // ─── 6) GL journal: loan disbursement (P0-2 drift fix, mig 199) ─────────
  // approveRequestGroup bypasses approve_single_voucher because the paired
  // approvals live under group_id (approve_single_voucher rejects grouped
  // rows). Post the loan-side JE directly: dr <borrower's leaf under 3020>
  // / cr Bank. The voucher-side JE (which approve_single_voucher would
  // have written) is skipped here to avoid double-counting — same net
  // balance effect, one JE labelled as the loan event.
  //
  // 2026-05-15 fix: was hardcoded to `3020`, but the user split the COA
  // into a header + per-borrower leaves (`3051 Amount Due From - Carres`,
  // ...). Posting to the header silently disappeared from Trial Balance
  // (which filters to leaves only). Mig 256 added a DB trigger that
  // rejects header posts; this code now resolves the leaf per borrower.
  const loansReceivableLeaf = await resolveLoansReceivableLeaf(supabase, loanApproval.reference_id)
  try {
    await postJournalEntry(supabase, {
      transactionDate: todayStr,
      description: `Loan disbursement approved — ${loanApproval.description ?? loanApproval.reference_id}`,
      referenceType: 'loan',
      referenceId: loanApproval.reference_id,
      createdBy: user.id,
      lines: [
        { accountCode: loansReceivableLeaf, debit: Number(voucher.amount), description: 'Loans Receivable — disbursement' },
        { accountCode: primaryBank?.gl_account_code ?? '3000', credit: Number(voucher.amount), description: `Bank — loan disbursement ${voucher.voucher_no ?? ''}`.trim() },
      ],
    })
  } catch (jeErr) {
    const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
    throw new Error(`Group approved but loan disbursement JE failed: ${msg}`)
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

// ─── Partial batch approval (Principal) — P1-1 ────────────────────────────
// Approve some rows and reject others within the same combined batch, in one
// atomic transaction. Both lists together must cover every pending approval
// in the group. Rejection reason is required when any rows are rejected.

export async function approveRequestGroupPartial(args: {
  groupId: string
  approveApprovalIds: string[]
  rejectApprovalIds: string[]
  approveNotes: string
  rejectReason: string
}) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const { error } = await supabase.rpc('approve_voucher_batch_partial', {
    p_group_id: args.groupId,
    p_approve_ids: args.approveApprovalIds,
    p_reject_ids: args.rejectApprovalIds,
    p_user_id: user.id,
    p_approve_notes: args.approveNotes ?? '',
    p_reject_reason: args.rejectReason ?? '',
  })

  if (error) throw new Error(`Partial batch approval failed: ${error.message}`)

  notifyApprovalDecision(
    'payment_voucher',
    'approved',
    `Split batch: ${args.approveApprovalIds.length} approved, ${args.rejectApprovalIds.length} rejected`,
    user.name,
  ).catch(() => {})

  revalidatePath('/approvals')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  revalidatePath('/hr-costing/payment')
}

// ─── Batch voucher details for CombinedApprovalCard modal (Principal) ────────
// Called when Principal clicks "View details" on a combined approval card.
// Batches the voucher + sources + attachments lookups so an N-voucher modal
// opens in 3 round-trips, not 3N.

export interface BatchVoucherRow {
  approvalId: string
  voucherId: string
  voucherNo: string | null
  voucherType: string
  amount: number
  direction: string | null
  payeeName: string
  description: string
  sources: Array<{ pool: string; amount: number }>
  attachments: Array<{
    id: string
    fileName: string
    fileType: string
    uploadedAt: string
  }>
}

export async function getBatchVoucherDetails(groupId: string): Promise<BatchVoucherRow[]> {
  await requireRole(['principal'])
  const supabase = await createClient()

  const { data: approvalRows } = await supabase
    .from('approval_requests')
    .select('id, reference_id')
    .eq('group_id', groupId)
    .eq('request_type', 'payment_voucher')

  const pairs = (approvalRows ?? [])
    .filter((r): r is { id: string; reference_id: string } => !!r.reference_id)

  if (pairs.length === 0) return []

  const voucherIds = pairs.map((r) => r.reference_id)

  const [vouchersRes, sourcesRes, attachmentsRes] = await Promise.all([
    supabase
      .from('payment_vouchers')
      .select('id, voucher_no, voucher_type, amount, direction, payee_name, description')
      .in('id', voucherIds),
    supabase
      .from('payment_voucher_sources')
      .select('voucher_id, pool, amount')
      .in('voucher_id', voucherIds),
    supabase
      .from('payment_attachments')
      .select('id, voucher_id, file_name, file_type, uploaded_at')
      .in('voucher_id', voucherIds)
      .order('uploaded_at', { ascending: false }),
  ])

  const vouchers = (vouchersRes.data ?? []) as Array<{
    id: string
    voucher_no: string | null
    voucher_type: string
    amount: string | number
    direction: string | null
    payee_name: string
    description: string
  }>
  const sourcesByVoucher = new Map<string, Array<{ pool: string; amount: number }>>()
  for (const s of (sourcesRes.data ?? []) as Array<{ voucher_id: string; pool: string; amount: string | number }>) {
    const arr = sourcesByVoucher.get(s.voucher_id) ?? []
    arr.push({ pool: s.pool, amount: Number(s.amount) })
    sourcesByVoucher.set(s.voucher_id, arr)
  }
  const attachmentsByVoucher = new Map<
    string,
    Array<{ id: string; fileName: string; fileType: string; uploadedAt: string }>
  >()
  for (const a of (attachmentsRes.data ?? []) as Array<{
    id: string
    voucher_id: string
    file_name: string
    file_type: string
    uploaded_at: string
  }>) {
    const arr = attachmentsByVoucher.get(a.voucher_id) ?? []
    arr.push({
      id: a.id,
      fileName: a.file_name,
      fileType: a.file_type,
      uploadedAt: a.uploaded_at,
    })
    attachmentsByVoucher.set(a.voucher_id, arr)
  }

  const voucherById = new Map(vouchers.map((v) => [v.id, v]))

  return pairs
    .map((p) => {
      const v = voucherById.get(p.reference_id)
      if (!v) return null
      return {
        approvalId: p.id,
        voucherId: v.id,
        voucherNo: v.voucher_no,
        voucherType: v.voucher_type,
        amount: Number(v.amount),
        direction: v.direction,
        payeeName: v.payee_name,
        description: v.description,
        sources: sourcesByVoucher.get(v.id) ?? [],
        attachments: attachmentsByVoucher.get(v.id) ?? [],
      } satisfies BatchVoucherRow
    })
    .filter((r): r is BatchVoucherRow => r !== null)
}
