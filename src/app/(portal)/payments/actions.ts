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
  const invoiceId = (formData.get('invoice_id') as string) || null
  const description = (formData.get('description') as string)?.trim() ?? ''
  const paymentMethod = (formData.get('payment_method') as string) || 'bank_transfer'
  const direction = (formData.get('direction') as string) || 'debit'
  const categoryCode = (formData.get('category_code') as string) || null
  const sourcePool = (formData.get('source_pool') as string) || null
  const targetPool = (formData.get('target_pool') as string) || null
  const notes = (formData.get('notes') as string) || null

  // Validation
  const VALID_TYPES = ['loan_repayment', 'billing_payment', 'claim_payout', 'expense', 'internal_transfer', 'salary_payout', 'other', 'receive_payment']
  if (!VALID_TYPES.includes(voucherType)) throw new Error('Invalid voucher type')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!payeeName) throw new Error('Payee name is required')
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

  const { data, error } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: voucherType as 'loan_repayment' | 'billing_payment' | 'claim_payout' | 'expense' | 'internal_transfer' | 'salary_payout' | 'other' | 'receive_payment',
      direction,
      category_code: categoryCode,
      source_pool: sourcePool,
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

// ─── Execute payment (Finance — marks as paid, adjusts bank + pool) ─────────

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
    .select('*')
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

  // ── Auto-adjust bank balance (debit = subtract, credit = add) ──
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

  // ── Auto-adjust pool balance ──
  const amount = r2(Number(voucher.amount))
  const poolDescription = `PV ${voucher.voucher_no}: ${voucher.description}`

  // Find linked approval_request (needed for dept_pool expense_out)
  const { data: linkedApproval } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('reference_id', id)
    .eq('reference_table', 'payment_vouchers')
    .eq('status', 'approved')
    .single()

  if (!isCredit && voucher.source_pool) {
    // DEBIT: deduct from source pool
    await adjustPool(supabase, voucher.source_pool, 'out', amount, poolDescription, user.id, linkedApproval?.id ?? null, nowIso)
  } else if (isCredit && voucher.target_pool) {
    // CREDIT: add to target pool
    await adjustPool(supabase, voucher.target_pool, 'in', amount, poolDescription, user.id, linkedApproval?.id ?? null, nowIso)
  }

  // ── Post GL journal entry (double-entry) ──
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
    console.error('GL journal posting failed for voucher', id)
  }

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/dashboard')
}

// ─── Pool adjustment helper ─────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function adjustPool(
  supabase: SupabaseClient,
  pool: string,
  direction: 'in' | 'out',
  amount: number,
  description: string,
  userId: string,
  approvalId: string | null,
  nowIso: string,
) {
  try {
    if (pool === 'hv_operating_fund') {
      await supabase.from('hv_operating_fund').insert({
        transaction_type: direction === 'out' ? 'expense_out' : 'profit_in',
        amount,
        description,
        reference_table: 'payment_vouchers',
        created_by: userId,
      })
    } else if (pool === 'invoice_payout_pool') {
      if (direction === 'out') {
        await supabase.from('invoice_payout_pool').insert({
          transaction_type: 'release' as const,
          amount,
          description,
          release_approved_by: userId,
          release_approved_at: nowIso,
        })
      } else {
        await supabase.from('invoice_payout_pool').insert({
          transaction_type: 'accumulate' as const,
          amount,
          description,
        })
      }
    } else if (pool === 'salary_pool') {
      // salary_pool is a monthly snapshot table — skip auto-adjustment
      // Salary pool adjustments happen through the Director Salary Engine
    } else if (pool.startsWith('dept_pool_')) {
      // e.g. dept_pool_marketing → department name = "Marketing"
      const deptName = pool.replace('dept_pool_', '')
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .ilike('name', deptName)
        .single()

      if (dept) {
        await supabase.from('dept_pools').insert({
          department_id: dept.id,
          transaction_type: direction === 'out' ? 'expense_out' : 'np_in',
          amount,
          description,
          approval_id: direction === 'out' ? approvalId : null,
          created_by: userId,
        })

        // When money flows OUT of a dept pool, it flows INTO Venture Pool
        if (direction === 'out') {
          await supabase.from('hv_operating_fund').insert({
            transaction_type: 'profit_in' as const,
            amount,
            description: `Dept pool transfer: ${description}`,
            reference_table: 'dept_pools',
            created_by: userId,
          })
        }
      }
    }
  } catch (err) {
    // Pool adjustment is non-blocking — payment already executed
    console.error('Pool adjustment failed:', pool, err)
  }
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
