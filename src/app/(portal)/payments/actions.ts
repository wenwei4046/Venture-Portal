'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { postJournalEntry, r2 } from '@/lib/journal'
import {
  adjustPool,
  applyVoucherPaidSideEffects,
  type SupabaseClient,
} from '@/lib/voucher-paid-helpers'

// ─── Create payment voucher (Finance) ────────────────────────────────────────

export async function createPaymentVoucher(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const voucherType = formData.get('voucher_type') as string
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  let payeeName = (formData.get('payee_name') as string)?.trim() ?? ''
  const payeeCompanyId = (formData.get('payee_company_id') as string) || null
  const bankAccountId = (formData.get('bank_account_id') as string) || null
  const referenceType = (formData.get('reference_type') as string) || null
  const referenceId = (formData.get('reference_id') as string) || null
  const invoiceId = (formData.get('invoice_id') as string) || null
  const description = (formData.get('description') as string)?.trim() ?? ''
  const paymentMethod = (formData.get('payment_method') as string) || 'bank_transfer'
  const direction = (formData.get('direction') as string) || 'debit'
  const categoryCode = (formData.get('category_code') as string) || null
  const sourcePool = (formData.get('source_pool') as string) || null
  // Phase 7 Step 10: Credit vouchers default to Venture Pool when unspecified.
  const targetPoolRaw = (formData.get('target_pool') as string) || null
  const targetPool = targetPoolRaw ?? (direction === 'credit' ? 'venture_pool' : null)
  const notes = (formData.get('notes') as string) || null
  // Optional loan repayment tagging on Debit vouchers.
  // Business direction: HV repaying a fund_source (subsidiary savings /
  // director loan). fund_source_id is the new canonical field; legacy loan_id
  // is kept NULL for new vouchers but still stored if passed for back-compat.
  const fundSourceId = (formData.get('fund_source_id') as string) || null
  const loanId = (formData.get('loan_id') as string) || null
  const repayPrincipal = parseFloat((formData.get('repayment_principal') as string) ?? '0') || 0
  const repayInterest = parseFloat((formData.get('repayment_interest') as string) ?? '0') || 0
  const repayPenalty = parseFloat((formData.get('repayment_penalty') as string) ?? '0') || 0
  const repaymentBreakdown =
    (fundSourceId || loanId) && (repayPrincipal + repayInterest + repayPenalty > 0)
      ? { principal: repayPrincipal, interest: repayInterest, penalty: repayPenalty }
      : null

  // Validation
  // If company selected but payee_name blank, infer from company
  if (!payeeName && payeeCompanyId) {
    const { data: co } = await supabase
      .from('companies')
      .select('name')
      .eq('id', payeeCompanyId)
      .single()
    if (co) payeeName = co.name
  }

  const VALID_TYPES = ['loan_repayment', 'billing_payment', 'claim_payout', 'expense', 'internal_transfer', 'salary_payout', 'other', 'receive_payment']
  if (!VALID_TYPES.includes(voucherType)) throw new Error('Invalid voucher type')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!payeeName) throw new Error('Payee name is required (select a company or enter manually)')
  if (!description) throw new Error('Description is required')
  if (voucherType === 'billing_payment' && !invoiceId) {
    throw new Error('Billing payment requires a linked invoice')
  }
  if (voucherType === 'billing_payment' && invoiceId) {
    const { data: openInv } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('id', invoiceId)
      .in('status', ['issued', 'draft'])
      .maybeSingle()
    if (!openInv) {
      throw new Error('Invoice is not open for payment (already paid, via netting, or does not exist)')
    }
    const { data: existingVoucher } = await supabase
      .from('payment_vouchers')
      .select('id, voucher_no')
      .eq('invoice_id', invoiceId)
      .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
      .maybeSingle()
    if (existingVoucher) {
      throw new Error(`Voucher ${existingVoucher.voucher_no} already exists for this invoice`)
    }
  }

  // Generate voucher number: HV-PV-YYYYMM-NNNN
  const period = dayjs().format('YYYYMM')
  const { count } = await supabase
    .from('payment_vouchers')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const voucherNo = `HV-PV-${period}-${String(seq).padStart(4, '0')}`

  // Credit (receive) payments are auto-completed — no approval needed.
  // Money flows in immediately on creation.
  const isAutoComplete = direction === 'credit'
  const nowIso = new Date().toISOString()
  const todayStr = dayjs().format('YYYY-MM-DD')

  // Validate loan repayment breakdown if provided (fund_source or legacy loan)
  if (fundSourceId || loanId) {
    if (direction !== 'debit') {
      throw new Error('Loan repayment must be a Debit voucher')
    }
    if (fundSourceId && loanId) {
      throw new Error('Voucher cannot reference both a fund_source and a loan')
    }
    if (repaymentBreakdown) {
      const sum =
        repaymentBreakdown.principal +
        repaymentBreakdown.interest +
        repaymentBreakdown.penalty
      if (Math.abs(sum - amount) > 0.005) {
        throw new Error(
          `Repayment breakdown sum RM ${sum.toFixed(2)} must match voucher total RM ${amount.toFixed(2)}`
        )
      }
    }
    if (fundSourceId) {
      const { data: fs } = await supabase
        .from('fund_sources')
        .select('status')
        .eq('id', fundSourceId)
        .maybeSingle()
      if (!fs) throw new Error('Fund source not found')
      if (fs.status !== 'active' && fs.status !== 'matured') {
        throw new Error(`Cannot repay fund source with status ${fs.status}`)
      }
    }
  }

  const { data, error } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: voucherType as 'loan_repayment' | 'billing_payment' | 'claim_payout' | 'expense' | 'internal_transfer' | 'salary_payout' | 'other' | 'receive_payment',
      direction,
      category_code: categoryCode,
      // Phase 7 Step 16: source_pool deprecated. Debit vouchers get their
      // pools from the payment_voucher_sources subtable (written below);
      // new rows leave source_pool NULL. Credit vouchers still populate
      // target_pool (single destination) as before.
      source_pool: null,
      target_pool: targetPool,
      status: isAutoComplete ? ('paid' as const) : ('draft' as const),
      amount,
      payee_name: payeeName,
      payee_company_id: payeeCompanyId,
      bank_account_id: bankAccountId,
      reference_type: referenceType,
      reference_id: referenceId,
      invoice_id: invoiceId,
      description,
      payment_method: paymentMethod,
      notes,
      loan_id: loanId,
      fund_source_id: fundSourceId,
      repayment_breakdown: repaymentBreakdown,
      created_by: user.id,
      ...(isAutoComplete ? {
        approved_by: user.id,
        approved_at: nowIso,
        executed_by: user.id,
        executed_at: nowIso,
        payment_date: todayStr,
      } : {}),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create voucher: ${error.message}`)

  // Phase 7: write N rows into payment_voucher_sources for debit vouchers.
  // Form sends source_rows[i][pool] + source_rows[i][amount]; legacy callers
  // that only send source_pool fall through to a single-row insert.
  if (direction === 'debit') {
    const rowCount = parseInt((formData.get('source_rows_count') as string) ?? '0', 10)
    const rows: { pool: string; amount: number }[] = []
    if (rowCount > 0) {
      for (let i = 0; i < rowCount; i++) {
        const pool = (formData.get(`source_rows[${i}][pool]`) as string)?.trim() ?? ''
        const amt = parseFloat((formData.get(`source_rows[${i}][amount]`) as string) ?? '0')
        if (pool && amt > 0) rows.push({ pool, amount: amt })
      }
    } else if (sourcePool) {
      rows.push({ pool: sourcePool, amount })
    }
    if (rows.length > 0) {
      const sum = rows.reduce((s, r) => s + r.amount, 0)
      if (Math.abs(sum - amount) > 0.005) {
        throw new Error(`source rows sum (${sum.toFixed(2)}) does not match voucher amount (${amount.toFixed(2)})`)
      }
      if (rows.length > 3) {
        throw new Error('payment_voucher_sources: max 3 source rows per voucher')
      }
      await supabase.from('payment_voucher_sources').insert(
        rows.map(r => ({ voucher_id: data.id, pool: r.pool, amount: r.amount }))
      )
    }
  }

  // Auto-complete credit payments: adjust bank + pool immediately
  if (isAutoComplete) {
    // Bank balance: add
    if (bankAccountId) {
      const { data: bank } = await supabase
        .from('bank_accounts')
        .select('current_balance, gl_account_code')
        .eq('id', bankAccountId)
        .single()
      if (bank) {
        await supabase
          .from('bank_accounts')
          .update({ current_balance: Number(bank.current_balance) + amount })
          .eq('id', bankAccountId)
      }
    }
    // Pool balance: add to target pool
    if (targetPool) {
      await adjustPool(supabase, targetPool, 'in', r2(amount), `PV ${voucherNo}: ${description}`, user.id, null, nowIso)
    }
    // GL journal entry (non-blocking)
    try {
      const bankGlCode = bankAccountId
        ? ((await supabase.from('bank_accounts').select('gl_account_code').eq('id', bankAccountId).single()).data?.gl_account_code ?? '1010')
        : '1010'
      await postJournalEntry(supabase, {
        transactionDate: todayStr,
        description: `PV ${voucherNo}: ${description}`,
        referenceType: 'payment_voucher',
        referenceId: data.id,
        lines: [
          { accountCode: bankGlCode, debit: r2(amount), description: `Bank deposit — ${voucherNo}` },
          { accountCode: '1040', credit: r2(amount), description: `Payment received — ${payeeName}` },
        ],
        createdBy: user.id,
      })
    } catch {
      console.error('GL posting failed for auto-complete credit voucher', data.id)
    }
  }

  // ── Upload attachments to Supabase Storage ──
  const attachmentCount = parseInt((formData.get('attachment_count') as string) ?? '0', 10)
  for (let i = 0; i < attachmentCount; i++) {
    const file = formData.get(`attachment_${i}`) as File | null
    if (!file || file.size === 0) continue

    const ext = file.name.split('.').pop() ?? 'bin'
    const storagePath = `${data.id}/${Date.now()}-${i}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('payment-attachments')
      .upload(storagePath, file, { contentType: file.type })

    if (!uploadError) {
      // Record in payment_attachments table
      await supabase.from('payment_attachments').insert({
        voucher_id: data.id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        uploaded_by: user.id,
      })
    }
  }

  revalidatePath('/payments')
  revalidatePath('/dashboard')
  redirect(`/payments/${data.id}`)
}

// ─── Submit for approval (Finance) ───────────────────────────────────────────

export async function submitForApproval(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Voucher id is required')

  // Fetch voucher
  const { data: voucher, error: fetchError } = await supabase
    .from('payment_vouchers')
    .select('*')
    .eq('id', id)
    .eq('status', 'draft')
    .single()

  if (fetchError || !voucher) throw new Error('Voucher not found or not in draft status')

  // Create approval request
  const { error: approvalError } = await supabase
    .from('approval_requests')
    .insert({
      request_type: 'payment_voucher' as const,
      reference_id: id,
      reference_table: 'payment_vouchers',
      submitted_by: user.id,
      description: `${voucher.voucher_no}: ${voucher.description}`,
      amount: voucher.amount,
      status: 'pending' as const,
      workflow_state: 'submitted' as const,
    })

  if (approvalError) throw new Error(`Failed to submit for approval: ${approvalError.message}`)

  // Update voucher status
  const { error: updateError } = await supabase
    .from('payment_vouchers')
    .update({ status: 'pending_approval' })
    .eq('id', id)
    .eq('status', 'draft')

  if (updateError) throw new Error(`Failed to update voucher status: ${updateError.message}`)

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
}

// ─── Approve voucher (Principal — approve + execute in one step) ────────────
// User directive 2026-04-19: approve = paid. The old 2-step flow (Principal
// approves → Finance executes) was collapsed so Principal's one click moves
// the money + marks the voucher paid in the same action.

export async function approveVoucher(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  const notes = (formData.get('notes') as string) || null
  if (!id) throw new Error('Voucher id is required')

  const paymentDate = dayjs().format('YYYY-MM-DD')
  const nowIso = new Date().toISOString()

  // Fetch full voucher for downstream side effects
  const { data: voucher, error: fetchErr } = await supabase
    .from('payment_vouchers')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending_approval')
    .single()

  if (fetchErr || !voucher) throw new Error('Voucher not found or not pending approval')

  // ── Bank balance check — cannot approve if insufficient funds ──
  if (voucher.bank_account_id && voucher.direction === 'debit') {
    const { data: bank } = await supabase
      .from('bank_accounts')
      .select('current_balance, bank_name')
      .eq('id', voucher.bank_account_id)
      .single()

    if (bank) {
      const balance = Number(bank.current_balance)
      const amount = Number(voucher.amount)
      if (balance < amount) {
        throw new Error(
          `Insufficient bank balance. ${bank.bank_name} has RM ${balance.toFixed(2)} but payment requires RM ${amount.toFixed(2)}.`
        )
      }
    }
  }

  // Flip voucher to paid in one shot — approved_by and executed_by are both
  // the Principal since approve and execute are now the same action.
  const { error: voucherError } = await supabase
    .from('payment_vouchers')
    .update({
      status: 'paid',
      approved_by: user.id,
      approved_at: nowIso,
      executed_by: user.id,
      executed_at: nowIso,
      payment_date: paymentDate,
      notes,
    })
    .eq('id', id)
    .eq('status', 'pending_approval')

  if (voucherError) throw new Error(`Failed to approve voucher: ${voucherError.message}`)

  // Also approve the linked approval_request (must happen BEFORE side effects,
  // because applyVoucherPaidSideEffects looks up the approved row for the
  // dept_pool expense_out approval_id FK.)
  const { data: approvalReq } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('reference_id', id)
    .eq('reference_table', 'payment_vouchers')
    .eq('status', 'pending')
    .single()

  if (approvalReq) {
    await supabase
      .from('approval_requests')
      .update({
        status: 'approved',
        workflow_state: 'approved',
        approved_by: user.id,
        approved_at: nowIso,
        notes,
      })
      .eq('id', approvalReq.id)
  }

  // Apply bank debit, pool adjust, loan/fund-source sync, GL journal
  await applyVoucherPaidSideEffects(supabase, voucher, paymentDate, user.id)

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
}

// ─── Void voucher (Finance, only draft/pending) ─────────────────────────────

export async function voidVoucher(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Voucher id is required')

  const { error } = await supabase
    .from('payment_vouchers')
    .update({ status: 'voided' })
    .eq('id', id)
    .in('status', ['draft', 'pending_approval'])

  if (error) throw new Error(`Failed to void voucher: ${error.message}`)

  // Also reject linked approval if pending
  const { data: approvalReq } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('reference_id', id)
    .eq('reference_table', 'payment_vouchers')
    .eq('status', 'pending')
    .single()

  if (approvalReq) {
    await supabase
      .from('approval_requests')
      .update({
        status: 'rejected',
        workflow_state: 'rejected',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes: 'Voided by Finance',
      })
      .eq('id', approvalReq.id)
  }

  void user
  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
  redirect('/payments')
}

// ─── Create payment category (Finance) ──────────────────────────────────────

export async function createPaymentCategory(formData: FormData) {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const code = (formData.get('code') as string)?.trim() ?? ''
  const label = (formData.get('label') as string)?.trim() ?? ''

  if (!code || !label) throw new Error('Code and label are required')

  const { error } = await supabase
    .from('payment_categories')
    .upsert({ code, label }, { onConflict: 'code' })

  if (error) throw new Error(`Failed to create category: ${error.message}`)

  revalidatePath('/payments/new')
}
