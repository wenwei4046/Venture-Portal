'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { postJournalEntry, r2 } from '@/lib/journal'
import { assertPeriodOpen } from '@/lib/period-lock'

// ─── Create payment voucher (Finance) ────────────────────────────────────────

export async function createPaymentVoucher(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const voucherType = formData.get('voucher_type') as string
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const payeeName = (formData.get('payee_name') as string)?.trim() ?? ''
  const payeeCompanyId = (formData.get('payee_company_id') as string) || null
  const bankAccountId = (formData.get('bank_account_id') as string) || null
  const referenceType = (formData.get('reference_type') as string) || null
  const referenceId = (formData.get('reference_id') as string) || null
  const description = (formData.get('description') as string)?.trim() ?? ''
  const paymentMethod = (formData.get('payment_method') as string) || 'bank_transfer'
  const direction = (formData.get('direction') as string) || 'debit'
  const notes = (formData.get('notes') as string) || null

  // Validation
  const VALID_TYPES = ['loan_repayment', 'billing_payment', 'claim_payout', 'expense', 'internal_transfer', 'salary_payout', 'other', 'receive_payment']
  if (!VALID_TYPES.includes(voucherType)) throw new Error('Invalid voucher type')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!payeeName) throw new Error('Payee name is required')
  if (!description) throw new Error('Description is required')

  // Generate voucher number: HV-PV-YYYYMM-NNNN
  const period = dayjs().format('YYYYMM')
  const { count } = await supabase
    .from('payment_vouchers')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const voucherNo = `HV-PV-${period}-${String(seq).padStart(4, '0')}`

  const { data, error } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: voucherType as 'loan_repayment' | 'billing_payment' | 'claim_payout' | 'expense' | 'internal_transfer' | 'salary_payout' | 'other' | 'receive_payment',
      direction,
      status: 'draft' as const,
      amount,
      payee_name: payeeName,
      payee_company_id: payeeCompanyId,
      bank_account_id: bankAccountId,
      reference_type: referenceType,
      reference_id: referenceId,
      description,
      payment_method: paymentMethod,
      notes,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create voucher: ${error.message}`)

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

// ─── Approve voucher (Principal) ─────────────────────────────────────────────

export async function approveVoucher(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  const notes = (formData.get('notes') as string) || null
  if (!id) throw new Error('Voucher id is required')

  const nowIso = new Date().toISOString()

  // Fetch the voucher to check bank balance
  const { data: voucher, error: fetchErr } = await supabase
    .from('payment_vouchers')
    .select('amount, bank_account_id, voucher_type')
    .eq('id', id)
    .eq('status', 'pending_approval')
    .single()

  if (fetchErr || !voucher) throw new Error('Voucher not found or not pending approval')

  // ── Bank balance check — cannot approve if insufficient funds ──
  if (voucher.bank_account_id) {
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

  // Update voucher
  const { error: voucherError } = await supabase
    .from('payment_vouchers')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: nowIso,
      notes,
    })
    .eq('id', id)
    .eq('status', 'pending_approval')

  if (voucherError) throw new Error(`Failed to approve voucher: ${voucherError.message}`)

  // Also approve the linked approval_request
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

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
}

// ─── Execute payment (Finance — marks as paid, deducts bank balance) ─────────

export async function executeVoucher(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  const paymentDate = (formData.get('payment_date') as string) || dayjs().format('YYYY-MM-DD')
  const paymentReference = (formData.get('payment_reference') as string) || null
  if (!id) throw new Error('Voucher id is required')

  if (dayjs(paymentDate).isAfter(dayjs(), 'day')) {
    throw new Error('Payment date cannot be in the future')
  }

  // Check period is open
  await assertPeriodOpen(supabase, paymentDate)

  // Fetch the voucher
  const { data: voucher, error: fetchError } = await supabase
    .from('payment_vouchers')
    .select('*, direction')
    .eq('id', id)
    .eq('status', 'approved')
    .single()

  if (fetchError || !voucher) throw new Error('Voucher not found or not approved')

  const nowIso = new Date().toISOString()

  // Mark voucher as paid
  const { error: updateError } = await supabase
    .from('payment_vouchers')
    .update({
      status: 'paid',
      executed_by: user.id,
      executed_at: nowIso,
      payment_date: paymentDate,
      payment_reference: paymentReference,
    })
    .eq('id', id)
    .eq('status', 'approved')

  if (updateError) throw new Error(`Failed to execute voucher: ${updateError.message}`)

  // Auto-adjust bank balance (debit = subtract, credit = add)
  const isCredit = voucher.direction === 'credit'
  let bankGlCode = '1010' // default: Hong Leong
  if (voucher.bank_account_id) {
    const { data: bank } = await supabase
      .from('bank_accounts')
      .select('current_balance, gl_account_code')
      .eq('id', voucher.bank_account_id)
      .single()

    if (bank) {
      bankGlCode = bank.gl_account_code ?? '1010'
      const newBalance = isCredit
        ? Number(bank.current_balance) + Number(voucher.amount)
        : Number(bank.current_balance) - Number(voucher.amount)
      await supabase
        .from('bank_accounts')
        .update({ current_balance: newBalance })
        .eq('id', voucher.bank_account_id)
    }
  }

  // ── Post GL journal entry (double-entry) ──
  // Debit: expense/payable account (based on voucher type)
  // Credit: bank account
  const expenseAccount: Record<string, string> = {
    loan_repayment: '2010',      // Fund Sources Payable
    billing_payment: '2060',     // AP General
    claim_payout: '5060',        // Claims Expense
    expense: '5050',             // G&A Expenses
    internal_transfer: '1011',   // Cash — Alliance (debit the receiving bank)
    salary_payout: '2030',       // Salary Payable
    other: '5050',               // G&A Expenses
  }

  const debitAccount = expenseAccount[voucher.voucher_type] ?? '5050'
  const amount = r2(Number(voucher.amount))

  try {
    // For credit (receive), reverse: debit bank, credit revenue/receivable
    const lines = isCredit
      ? [
          { accountCode: bankGlCode, debit: amount, description: `Bank deposit — ${voucher.voucher_no}` },
          { accountCode: '1040', credit: amount, description: `Payment received — ${voucher.payee_name}` },
        ]
      : [
          { accountCode: debitAccount, debit: amount, description: `${voucher.voucher_type} — ${voucher.payee_name}` },
          { accountCode: bankGlCode, credit: amount, description: `Bank payment — ${voucher.voucher_no}` },
        ]

    const journalId = await postJournalEntry(supabase, {
      transactionDate: paymentDate,
      description: `PV ${voucher.voucher_no}: ${voucher.description}`,
      referenceType: 'payment_voucher',
      referenceId: id,
      lines,
      createdBy: user.id,
    })

    // Link journal entry to voucher
    await supabase
      .from('payment_vouchers')
      .update({ journal_entry_id: journalId })
      .eq('id', id)
  } catch {
    // GL posting is non-blocking — voucher is already marked paid
    // Log but don't fail the execution
    console.error('GL journal posting failed for voucher', id)
  }

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
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
