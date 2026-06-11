'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { postJournalEntry, r2 } from '@/lib/journal'
import { adjustPool } from '@/lib/voucher-paid-helpers'
import { ACCOUNT_TYPES, type AccountType } from '@/lib/coa'
import { segmentForBillingMode } from '@/lib/invoice-settlement'

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
  // For billing_payment (settling an invoice) the journal is purely
  //   dr Bank / cr 3030 AR
  // The user-facing form doesn't need to ask for an account — revenue was
  // already recognised at invoice issue. Auto-fill with AR — Subs (3030).
  const rawAccountCode = (formData.get('account_code') as string) || null
  const accountCode = rawAccountCode
    ?? (voucherType === 'billing_payment' ? '3030' : null)
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
  // Mig 242/251: every voucher that actually moves money must declare the
  // bank it touches, so the approval RPC's cache-update block fires and
  // bank_accounts.current_balance stays in sync with the bank GL. Without
  // this guard, six paid billing_payment credit vouchers slipped through
  // earlier and built a 33,500 cache-vs-GL drift on Hong Leong before the
  // audit caught it. Netting transactions are the only legitimate case
  // where bank stays NULL — no real money moves.
  if (paymentMethod !== 'netting' && !bankAccountId) {
    throw new Error(
      direction === 'debit'
        ? 'Bank account is required for debit (outgoing) vouchers'
        : 'Bank account is required (which account is receiving the money?)',
    )
  }
  if (voucherType === 'billing_payment' && !invoiceId) {
    throw new Error('Billing payment requires a linked invoice')
  }
  let settleBillingMode: string | null = null
  if (voucherType === 'billing_payment' && invoiceId) {
    const { data: openInv } = await supabase
      .from('invoices')
      .select('id, status, billing_mode')
      .eq('id', invoiceId)
      .in('status', ['issued', 'draft'])
      .maybeSingle()
    if (!openInv) {
      throw new Error('Invoice is not open for payment (already paid, via netting, or does not exist)')
    }
    settleBillingMode = (openInv as { billing_mode: string | null }).billing_mode ?? null
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

  // Generate voucher number. Debit (outgoing money) → HV-PV-YYYYMM-NNNN
  // (Payment Voucher). Credit (incoming money) → HV-OR-YYYYMM-NNNN
  // (Official Receipt). mig 252 renamed historical credit rows to match.
  const period = dayjs().format('YYYYMM')
  const { count } = await supabase
    .from('payment_vouchers')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const prefix = direction === 'credit' ? 'HV-OR-' : 'HV-PV-'
  const voucherNo = `${prefix}${period}-${String(seq).padStart(4, '0')}`

  // Credit (receive) payments are auto-completed — no approval needed.
  // Money flows in immediately on creation.
  const isAutoComplete = direction === 'credit'
  const nowIso = new Date().toISOString()
  const todayStr = dayjs().format('YYYY-MM-DD')
  // mig 276 / single-settle date: honor a user-chosen payment date when valid,
  // else fall back to today. Drives both payment_date and the settlement JE date.
  const rawPaymentDate = (formData.get('payment_date') as string)?.trim()
  const paymentDateStr = rawPaymentDate && /^\d{4}-\d{2}-\d{2}$/.test(rawPaymentDate)
    ? rawPaymentDate
    : todayStr

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
      voucher_type: voucherType as 'loan_repayment' | 'billing_payment' | 'claim_payout' | 'expense' | 'internal_transfer' | 'salary_payout' | 'other' | 'receive_payment' | 'payroll_bank_transfer',
      direction,
      // Mig 205: category_code moved to payment_voucher_sources (per-row).
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
        payment_date: paymentDateStr,
      } : {}),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create voucher: ${error.message}`)

  // Mig 205: every voucher writes ≥1 payment_voucher_sources row.
  // DEBIT: user-entered rows (pool + category + amount), sum must match voucher total.
  // CREDIT: synthetic single row (pool = target_pool, amount = voucher amount).
  if (direction === 'debit') {
    const rowCount = parseInt((formData.get('source_rows_count') as string) ?? '0', 10)
    const rows: {
      pool: string
      amount: number
      account_code: string
      override_account_type: AccountType | null
      override_gl_account_code: string | null
      override_reason: string | null
    }[] = []
    if (rowCount > 0) {
      for (let i = 0; i < rowCount; i++) {
        const pool = (formData.get(`source_rows[${i}][pool]`) as string)?.trim() ?? ''
        const amt = parseFloat((formData.get(`source_rows[${i}][amount]`) as string) ?? '0')
        const acct = (formData.get(`source_rows[${i}][account_code]`) as string)?.trim() || ''
        const ovType = (formData.get(`source_rows[${i}][override_account_type]`) as string)?.trim() ?? ''
        const ovGl   = (formData.get(`source_rows[${i}][override_gl_account_code]`) as string)?.trim() ?? ''
        const ovRsn  = (formData.get(`source_rows[${i}][override_reason]`) as string)?.trim() ?? ''
        const isOverride = !!ovType && !!ovGl && !!ovRsn
        if (!isOverride && (ovType || ovGl || ovRsn)) {
          throw new Error(`source row ${i + 1}: override requires account type, GL, AND reason — fill all three or clear all`)
        }
        if (isOverride && !ACCOUNT_TYPES.includes(ovType as AccountType)) {
          throw new Error(`source row ${i + 1}: invalid override account type "${ovType}"`)
        }
        if (pool && amt > 0) {
          if (!acct) {
            throw new Error(`source row ${i + 1}: account is required (every PV source row must reference a chart_of_accounts code)`)
          }
          rows.push({
            pool, amount: amt, account_code: acct,
            override_account_type: isOverride ? (ovType as AccountType) : null,
            override_gl_account_code: isOverride ? ovGl : null,
            override_reason: isOverride ? ovRsn : null,
          })
        }
      }
    } else if (sourcePool) {
      // Legacy single-source form path — account falls back to the voucher-level
      // field name still sent by older UIs.
      if (!accountCode) {
        throw new Error('Account is required on debit voucher source rows')
      }
      rows.push({
        pool: sourcePool, amount, account_code: accountCode,
        override_account_type: null, override_gl_account_code: null, override_reason: null,
      })
    }
    if (rows.length > 0) {
      const sum = rows.reduce((s, r) => s + r.amount, 0)
      if (Math.abs(sum - amount) > 0.005) {
        throw new Error(`source rows sum (${sum.toFixed(2)}) does not match voucher amount (${amount.toFixed(2)})`)
      }
      await supabase.from('payment_voucher_sources').insert(
        rows.map(r => ({
          voucher_id: data.id,
          pool: r.pool,
          amount: r.amount,
          account_code: r.account_code,
          override_account_type: r.override_account_type,
          override_gl_account_code: r.override_gl_account_code,
          override_reason: r.override_reason,
        })),
      )
    }
  } else if (direction === 'credit' && targetPool) {
    // Every PV source row must carry an account — reports route lines by the
    // referenced chart_of_accounts.type. A NULL account_code would crash the
    // P&L / Cash Flow render (see src/lib/cfo-reports.ts:gatherPvSources).
    if (!accountCode) {
      throw new Error('Account is required on inbound (credit) vouchers')
    }
    // role defaults to 'primary' at the DB level (mig 254); no need to set
    // it explicitly here.
    const { error: primaryInsertErr } = await supabase
      .from('payment_voucher_sources')
      .insert({
        voucher_id: data.id,
        pool: targetPool,
        amount,
        account_code: accountCode,
      })
    if (primaryInsertErr) {
      throw new Error(`Failed to insert credit voucher source row: ${primaryInsertErr.message}`)
    }
  }

  // Auto-complete credit payments: adjust bank + pool immediately.
  // Two flows:
  //   (a) Real bank settlement (subsidiary / freetext with payment_method
  //       != netting) → Dr Bank / Cr AR, bank cache bumped.
  //   (b) Inter-billing settlement (invoice issued to a dept_pool, voucher
  //       with payment_method='netting') → Dr <paying dept inter-billing
  //       expense> / Cr AR, no bank touched. A 2nd payment_voucher_sources
  //       row is also inserted tagged with the paying dept's pool so the
  //       expense lands on the paying side's P&L (mig 253). Without this,
  //       only the receiving dept saw revenue and group net profit was
  //       over-stated by the invoiced amount.
  if (isAutoComplete) {
    // Detect inter-billing first so we know which JE path to take below.
    // We resolve THREE things from the invoice's billable_to_department_id:
    //   - expenseCode: 9051-9055 leaf to debit in the JE + record on the
    //     paying-side PV source row (drives the paying dept's P&L expense).
    //   - payingPool: the dept_pool_* key used to tag the PV source so
    //     the report layer attributes the expense to that pool.
    //   - partyLabel: dept name for the JE description.
    let interBilling: {
      expenseCode: string
      payingPool: string
      partyLabel: string
    } | null = null
    if (paymentMethod === 'netting' && invoiceId) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('billable_to_type, billable_to_department_id')
        .eq('id', invoiceId)
        .maybeSingle()
      if (inv && inv.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
        const { data: dept } = await supabase
          .from('departments')
          .select('name')
          .eq('id', inv.billable_to_department_id)
          .maybeSingle()
        if (dept?.name) {
          // Convention from mig 253: '9051 Inter-billing — Marketing',
          // '9052 Inter-billing — Finance', etc. Match by suffix so a
          // renamed dept still works as long as the COA row exists.
          const { data: acct } = await supabase
            .from('chart_of_accounts')
            .select('code, name')
            .eq('type', 'expense')
            .ilike('name', `Inter-billing % ${dept.name}`)
            .maybeSingle()
          if (acct?.code) {
            // Pool key follows the dept_pool_<slug> convention used by
            // INVOICE_BILLING_MODE_TO_POOL ('dept_pool_marketing',
            // 'dept_pool_director_office', etc).
            const payingPool = `dept_pool_${dept.name.toLowerCase().replace(/\s+/g, '_')}`
            interBilling = {
              expenseCode: acct.code,
              payingPool,
              partyLabel: dept.name,
            }
          }
        }
      }
    }

    // Bank cache: bump only for real bank settlements. Inter-billing skips
    // because no money actually entered the bank account.
    if (bankAccountId && !interBilling) {
      const { error: bumpErr } = await supabase.rpc('bump_bank_for_paid_credit', {
        p_voucher_id: data.id,
      })
      if (bumpErr) {
        // Fail loud (2026-06-11 audit): a swallowed bump drifts the bank
        // cache vs GL until an approval bounces on "insufficient balance".
        throw new Error(`Receipt ${voucherNo} created but bank balance update failed: ${bumpErr.message}`)
      }
    }
    // Pool balance: add to target pool (the receiving side — e.g. Marketing
    // pool gets the revenue regardless of how the paying side settled).
    if (targetPool) {
      await adjustPool(supabase, targetPool, 'in', r2(amount), `PV ${voucherNo}: ${description}`, user.id, null, nowIso)
    }
    // Inter-billing: mirror the dept_pools ledger for the paying side. The
    // /dept-pool views read In/Out figures from dept_pools.transaction_type,
    // NOT from payment_voucher_sources, so without this row the paying
    // dept's Pool view shows 0 movement even though the PV source mirror
    // row (mig 254) is present.
    //
    // Direct insert with transaction_type='inter_billing_out' (mig 255)
    // instead of adjustPool() — adjustPool writes 'expense_out', which
    // hits the check_dept_pool_sufficient trigger and rejects when the
    // pool balance < amount. Inter-billing is a forced obligation
    // (Marketing billed HR; HR has no veto), so the sufficiency check
    // shouldn't apply.
    if (interBilling) {
      const { data: payingDept } = await supabase
        .from('departments')
        .select('id')
        .eq('name', interBilling.partyLabel)
        .maybeSingle()
      // Fail loud — when interBilling is truthy the paying dept MUST be
      // resolvable. Silently skipping the deduction (the old implicit else)
      // is the bug that left HR/Director Office un-debited with zero error
      // trace; the inter_billing_out row must be inserted OR this throws.
      if (!payingDept?.id) {
        throw new Error(
          `Inter-billing paying dept "${interBilling.partyLabel}" not found (PV ${voucherNo}) — cannot post inter_billing_out`,
        )
      }
      const interBillingRow = {
        department_id: payingDept.id,
        transaction_type: 'inter_billing_out',
        amount: r2(amount),
        description: `PV ${voucherNo}: Inter-billing — ${interBilling.partyLabel} (settles ${description})`,
        created_by: user.id,
      }
      // Cast: mig 255 added the new enum value; auto-generated types are
      // regenerated separately, so TS still only knows 'np_in' | 'expense_out'.
      const { error: deptPoolErr } = await supabase
        .from('dept_pools')
        .insert(interBillingRow as never)
      if (deptPoolErr) {
        // Fail loud — silent skip here was the bug that landed receiving-side
        // np_in + the role='mirror' row but never debited the paying dept,
        // an invisible financially-wrong partial settlement.
        throw new Error(
          `Inter-billing paying-side dept_pool insert failed for ${interBilling.partyLabel} (PV ${voucherNo}): ${deptPoolErr.message}`,
        )
      }
    }
    // GL journal entry (non-blocking). Inter-billing skips because the
    // expense JE (Dr 9051-9055 / Cr 3030) was already posted at invoice
    // issue in billing/actions.ts — posting again here would double-count
    // the expense and leave AR negative.
    if (!interBilling) {
      try {
        const glAccountCode = bankAccountId
          ? ((await supabase.from('bank_accounts').select('gl_account_code').eq('id', bankAccountId).single()).data?.gl_account_code ?? '3000')
          : '3000'
        await postJournalEntry(supabase, {
          transactionDate: paymentDateStr,
          description: `PV ${voucherNo}: ${description}`,
          referenceType: 'payment_voucher',
          referenceId: data.id,
          ...(invoiceId && settleBillingMode
            ? { segment: segmentForBillingMode(settleBillingMode) }
            : {}),
          lines: [
            { accountCode: glAccountCode, debit: r2(amount), description: `Bank deposit — ${voucherNo}` },
            // The form's account picker drives the GL credit (user decision
            // 2026-06-03 / fixed 2026-06-11): a receipt against a non-3030
            // receivable (e.g. 3071 Other Debtor) credits THAT account —
            // hardcoding 3030 made AR absorb every receipt.
            { accountCode: accountCode ?? '3030', credit: r2(amount), description: `Payment received — ${payeeName}` },
          ],
          createdBy: user.id,
        })
      } catch (jeErr) {
        // Fail loud (2026-06-11 audit): a swallowed JE leaves the receipt's
        // cash missing from the GL.
        const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
        throw new Error(`Receipt ${voucherNo} created but GL posting failed: ${msg}`)
      }
    }

    // Inter-billing: insert a SECOND payment_voucher_sources row tagged with
    // the paying dept's pool + expense account. classifyRows routes this as
    // the paying dept's P&L expense (mig 253). Without this row, only the
    // receiving dept (target_pool, written earlier in the credit branch
    // above) shows the transaction.
    //
    // role='mirror' (mig 254) tells the pvs_enforce_sum_matches_voucher
    // trigger to exclude this row from the sum-vs-voucher.amount check —
    // mirror rows represent the OTHER side of the same transaction, not a
    // split of the voucher amount. Without role='mirror' the trigger would
    // see sum=2N (primary N + this row N) ≠ voucher.amount N and reject.
    if (interBilling) {
      // role='mirror' (mig 254 column) is not yet in the generated
      // database.types.ts — cast to bypass the stale type. The DB has the
      // CHECK constraint, so an invalid value still fails loud at runtime.
      const mirrorRow = {
        voucher_id: data.id,
        pool: interBilling.payingPool,
        amount: r2(amount),
        account_code: interBilling.expenseCode,
        role: 'mirror',
      }
      const { error: mirrorInsertErr } = await supabase
        .from('payment_voucher_sources')
        .insert(mirrorRow as never)
      if (mirrorInsertErr) {
        // Fail loud — silent failure here was the 2026-05-14 bug that left
        // inter-billing expense invisible in the paying dept's P&L.
        throw new Error(
          `Failed to insert inter-billing mirror source row (paying side, pool=${interBilling.payingPool}, account=${interBilling.expenseCode}): ${mirrorInsertErr.message}`,
        )
      }
    }

    // Mark the invoice as settled so the Billing list stops showing "Settle →"
    // and guards against duplicate settlement attempts.
    if (invoiceId) {
      const newInvStatus = paymentMethod === 'netting' ? 'paid_via_netting' : 'paid'
      await supabase
        .from('invoices')
        .update({ status: newInvStatus })
        .eq('id', invoiceId)
        .in('status', ['issued', 'draft'])
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

  // P0-1: route voucher-page approvals through the same atomic RPC as the
  // approvals-queue path. RPC takes approval_id, so look it up first.
  const { data: approvalReq, error: arErr } = await supabase
    .from('approval_requests')
    .select('id, group_id')
    .eq('reference_id', id)
    .eq('reference_table', 'payment_vouchers')
    .eq('status', 'pending')
    .single()

  if (arErr || !approvalReq) {
    throw new Error('Voucher has no pending approval request')
  }
  if (approvalReq.group_id) {
    throw new Error('Voucher is part of a combined approval — approve it from the Approvals queue.')
  }

  const { error: rpcErr } = await supabase.rpc('approve_single_voucher', {
    p_approval_id: approvalReq.id,
    p_user_id: user.id,
    p_notes: notes ?? '',
  })
  if (rpcErr) throw new Error(`Approval failed: ${rpcErr.message}`)

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
}

// ─── Update voucher (Finance + Principal, only pending_approval / draft) ───
// Lets the operator fix typos, wrong amount, wrong category, etc. before
// Principal approves. Once approved/paid/voided the voucher is frozen —
// edits would mean reversing the GL posting which we don't allow.
//
// Editable: payee, bank, amount, description, notes, payment_method,
// payment_reference, target_pool (credit), source rows (pool/category/amount/override).
// NOT editable: voucher_no, voucher_type, direction, fund_source_id, loan_id,
// repayment_breakdown, invoice_id, status, audit fields.

// ─── Copy a payment voucher into a new DRAFT ─────────────────────────────────
// Recurring expense PVs repeat with small tweaks, so let Finance duplicate one
// into a fresh draft (header + source rows) and edit it before submitting.
// Transaction-specific links (invoice/loan/fund_source/repayment_breakdown) are
// deliberately NOT copied — a copy is a new expense, not a re-run of a repayment.
export async function copyPaymentVoucher(formData: FormData): Promise<void> {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const sourceId = (formData.get('voucher_id') as string) ?? ''
  if (!sourceId) throw new Error('Voucher id is required')

  const { data: src, error: srcErr } = await supabase
    .from('payment_vouchers')
    .select('voucher_type, direction, amount, payee_name, payee_company_id, bank_account_id, description, payment_method, target_pool')
    .eq('id', sourceId)
    .single()
  if (srcErr || !src) throw new Error('Source voucher not found')

  // New voucher number — same scheme as createPaymentVoucher.
  const period = dayjs().format('YYYYMM')
  const { count } = await supabase.from('payment_vouchers').select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const prefix = src.direction === 'credit' ? 'HV-OR-' : 'HV-PV-'
  const voucherNo = `${prefix}${period}-${String(seq).padStart(4, '0')}`

  const { data: created, error: insErr } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: src.voucher_type,
      direction: src.direction,
      status: 'draft' as const,
      amount: src.amount,
      payee_name: src.payee_name,
      payee_company_id: src.payee_company_id,
      bank_account_id: src.bank_account_id,
      description: src.description,
      payment_method: src.payment_method,
      target_pool: src.target_pool,
      source_pool: null,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !created) throw new Error(`Failed to copy voucher: ${insErr?.message ?? 'unknown'}`)

  const { data: srcRows } = await supabase
    .from('payment_voucher_sources')
    .select('pool, amount, account_code, role, override_account_type, override_gl_account_code, override_reason')
    .eq('voucher_id', sourceId)
  if (srcRows && srcRows.length > 0) {
    const { error: rowsErr } = await supabase.from('payment_voucher_sources').insert(
      srcRows.map((r) => ({
        voucher_id: created.id,
        pool: r.pool,
        amount: r.amount,
        account_code: r.account_code,
        role: r.role,
        override_account_type: r.override_account_type,
        override_gl_account_code: r.override_gl_account_code,
        override_reason: r.override_reason,
      })),
    )
    if (rowsErr) {
      await supabase.from('payment_vouchers').delete().eq('id', created.id).eq('status', 'draft')
      throw new Error(`Failed to copy voucher sources (rolled back): ${rowsErr.message}`)
    }
  }

  revalidatePath('/payments')
  redirect(`/payments/${created.id}/edit`)
}

export async function updatePaymentVoucher(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Voucher id is required')

  // Load current voucher to validate state + lock direction/voucher_type
  const { data: current } = await supabase
    .from('payment_vouchers')
    .select('id, status, direction, voucher_type, fund_source_id, loan_id, repayment_breakdown, invoice_id')
    .eq('id', id)
    .single()
  if (!current) throw new Error('Voucher not found')
  if (current.status !== 'pending_approval' && current.status !== 'draft') {
    throw new Error(`Cannot edit voucher in status "${current.status}" — only pending_approval / draft are editable`)
  }

  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  let payeeName = ((formData.get('payee_name') as string) ?? '').trim()
  const payeeCompanyId = (formData.get('payee_company_id') as string) || null
  const bankAccountId = (formData.get('bank_account_id') as string) || null
  const description = ((formData.get('description') as string) ?? '').trim()
  const paymentMethod = (formData.get('payment_method') as string) || 'bank_transfer'
  const targetPool = (formData.get('target_pool') as string) || null
  const notes = ((formData.get('notes') as string) ?? '').trim() || null

  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!description) throw new Error('Description is required')
  // Mig 242: debit vouchers must declare a bank — same rule as createPaymentVoucher.
  if (current.direction === 'debit' && !bankAccountId) {
    throw new Error('Bank account is required for debit (outgoing) vouchers')
  }

  if (!payeeName && payeeCompanyId) {
    const { data: co } = await supabase.from('companies').select('name').eq('id', payeeCompanyId).single()
    if (co) payeeName = co.name
  }
  if (!payeeName) throw new Error('Payee name is required')

  // Loan-repayment vouchers are locked: amount must match the stored
  // repayment_breakdown sum because changing it desyncs the principal /
  // interest / penalty allocation. Operator must void + recreate instead.
  if (current.repayment_breakdown && (current.fund_source_id || current.loan_id)) {
    const bd = current.repayment_breakdown as { principal: number; interest: number; penalty: number }
    const sum = Number(bd.principal ?? 0) + Number(bd.interest ?? 0) + Number(bd.penalty ?? 0)
    if (Math.abs(sum - amount) > 0.005) {
      throw new Error(
        `This is a loan repayment voucher with a fixed breakdown (RM ${sum.toFixed(2)}). Changing amount requires voiding and recreating.`,
      )
    }
  }

  // .select() forces Supabase to return the matched rows so we can detect
  // the TOCTOU race where Principal approves between our SELECT and UPDATE.
  // Without this, UPDATE matches 0 rows (status no longer in our filter set)
  // and updErr stays null — we'd silently corrupt the now-paid voucher.
  const { data: updated, error: updErr } = await supabase
    .from('payment_vouchers')
    .update({
      amount,
      payee_name: payeeName,
      payee_company_id: payeeCompanyId,
      bank_account_id: bankAccountId,
      description,
      payment_method: paymentMethod,
      notes,
      target_pool: current.direction === 'credit' ? targetPool : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['pending_approval', 'draft'])
    .select('id')

  if (updErr) throw new Error(`Failed to update voucher: ${updErr.message}`)
  if (!updated || updated.length === 0) {
    throw new Error('Voucher status changed mid-edit (already approved or voided) — refresh and try again')
  }

  // Replace source rows. Mig 205: every voucher carries ≥1 PVS row;
  // sum must match amount; per-row override constraint enforced at DB.
  if (current.direction === 'debit') {
    const rowCount = parseInt((formData.get('source_rows_count') as string) ?? '0', 10)
    const rows: {
      pool: string
      amount: number
      account_code: string
      override_account_type: AccountType | null
      override_gl_account_code: string | null
      override_reason: string | null
    }[] = []
    for (let i = 0; i < rowCount; i++) {
      const pool = (formData.get(`source_rows[${i}][pool]`) as string)?.trim() ?? ''
      const amt = parseFloat((formData.get(`source_rows[${i}][amount]`) as string) ?? '0')
      const acct = (formData.get(`source_rows[${i}][account_code]`) as string)?.trim() || ''
      const ovType = (formData.get(`source_rows[${i}][override_account_type]`) as string)?.trim() ?? ''
      const ovGl = (formData.get(`source_rows[${i}][override_gl_account_code]`) as string)?.trim() ?? ''
      const ovRsn = (formData.get(`source_rows[${i}][override_reason]`) as string)?.trim() ?? ''
      const isOverride = !!ovType && !!ovGl && !!ovRsn
      if (!isOverride && (ovType || ovGl || ovRsn)) {
        throw new Error(`source row ${i + 1}: override requires account type, GL, AND reason`)
      }
      if (isOverride && !ACCOUNT_TYPES.includes(ovType as AccountType)) {
        throw new Error(`source row ${i + 1}: invalid override account type "${ovType}"`)
      }
      if (pool && amt > 0) {
        if (!acct) {
          throw new Error(`source row ${i + 1}: account is required (every PV source row must reference a chart_of_accounts code)`)
        }
        rows.push({
          pool, amount: amt, account_code: acct,
          override_account_type: isOverride ? (ovType as AccountType) : null,
          override_gl_account_code: isOverride ? ovGl : null,
          override_reason: isOverride ? ovRsn : null,
        })
      }
    }
    if (rows.length === 0) throw new Error('At least one source row is required for a debit voucher')
    const sum = rows.reduce((s, r) => s + r.amount, 0)
    if (Math.abs(sum - amount) > 0.005) {
      throw new Error(`source rows sum (${sum.toFixed(2)}) does not match voucher amount (${amount.toFixed(2)})`)
    }

    // Replace source rows. Mig 221 broadens RLS to allow DELETE on
    // pending_approval vouchers (was draft-only); confirm post-delete that
    // the voucher truly has zero PVS rows before we INSERT — catches RLS
    // regressions and any future status restriction.
    const { error: delErr } = await supabase
      .from('payment_voucher_sources')
      .delete()
      .eq('voucher_id', id)
    if (delErr) throw new Error(`Failed to clear old source rows: ${delErr.message}`)

    const { count: leftover } = await supabase
      .from('payment_voucher_sources')
      .select('*', { count: 'exact', head: true })
      .eq('voucher_id', id)
    if ((leftover ?? 0) > 0) {
      throw new Error(`PVS RLS blocked delete (status=${current.status}) — ${leftover} stale rows remain. Apply mig 221 or contact Principal.`)
    }

    const { error: insErr } = await supabase.from('payment_voucher_sources').insert(
      rows.map(r => ({
        voucher_id: id,
        pool: r.pool,
        amount: r.amount,
        account_code: r.account_code,
        override_account_type: r.override_account_type,
        override_gl_account_code: r.override_gl_account_code,
        override_reason: r.override_reason,
      })),
    )
    if (insErr) throw new Error(`Failed to write new source rows: ${insErr.message}`)
  } else if (current.direction === 'credit') {
    if (!targetPool) throw new Error('Target pool is required for credit voucher')
    const accountCode = (formData.get('account_code') as string)?.trim() || null

    const { error: delErr } = await supabase
      .from('payment_voucher_sources')
      .delete()
      .eq('voucher_id', id)
    if (delErr) throw new Error(`Failed to clear old source rows: ${delErr.message}`)

    const { count: leftover } = await supabase
      .from('payment_voucher_sources')
      .select('*', { count: 'exact', head: true })
      .eq('voucher_id', id)
    if ((leftover ?? 0) > 0) {
      throw new Error(`PVS RLS blocked delete (status=${current.status}) — ${leftover} stale rows remain.`)
    }

    // See comment on create path: credit vouchers must carry an account.
    if (!accountCode) {
      throw new Error('Account is required on inbound (credit) vouchers')
    }
    const { error: insErr } = await supabase.from('payment_voucher_sources').insert({
      voucher_id: id,
      pool: targetPool,
      amount,
      account_code: accountCode,
    })
    if (insErr) throw new Error(`Failed to write new source rows: ${insErr.message}`)
  }

  // Audit trail: who edited (best-effort — schema mismatch shouldn't block edit)
  await supabase
    .from('access_log')
    .insert({
      user_id: user.id,
      action: 'update_payment_voucher',
      resource_type: 'payment_voucher',
      resource_id: id,
      metadata: { status_at_edit: current.status, voucher_type: current.voucher_type },
    })
    .then(() => {/* ok */}, () => {/* ignore audit failure */})

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
  redirect(`/payments/${id}`)
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

// ─── Void a PAID receipt / billing-payment (reverse all effects) ────────────
// A paid credit voucher (Official Receipt) already moved money — bank cache,
// pool ledgers, GL, and the invoice(s) it settled. The plain voidVoucher only
// flips draft/pending status; this one fully REVERSES a paid credit voucher so
// a wrong receipt can be undone. Steps: reverse bank cache, reverse each linked
// GL entry, reverse the pool credits, un-settle the invoice(s), mark voided.
export async function voidPaidReceipt(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Voucher id is required')

  const { data: v } = await supabase
    .from('payment_vouchers')
    .select('id, voucher_no, direction, voucher_type, status, amount, bank_account_id, target_pool, invoice_id, payee_name, payment_method')
    .eq('id', id)
    .single()
  if (!v) throw new Error('Voucher not found')
  if (v.status !== 'paid') throw new Error(`Only paid vouchers can be reversed (status=${v.status})`)
  if (v.direction !== 'credit') throw new Error('Only incoming receipts (credit) can be reversed here')

  const amount = r2(Number(v.amount))
  // Netting settlement never touched the bank (no money moved — the paying
  // dept was debited via an inter_billing_out pool row instead), so the void
  // must not touch it either.
  const isNetting = v.payment_method === 'netting'

  // 1) Reverse bank cache (the receipt had added to it). Via bump_bank_balance
  // RPC (mig 20260610000000) — the old direct update was silently blocked by
  // RLS when Finance ran the void (bank_accounts UPDATE policy is
  // principal-only), leaving the cache overstated vs GL.
  if (v.bank_account_id && !isNetting) {
    const { error: bumpErr } = await supabase.rpc('bump_bank_balance', {
      p_bank_account_id: v.bank_account_id,
      p_delta: -amount,
    })
    if (bumpErr) {
      throw new Error(`Failed to reverse bank balance: ${bumpErr.message}`)
    }
  }

  // 2) Reverse every GL entry posted for this voucher (swap debit/credit, keep segment)
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, entry_no, segment, description')
    .eq('reference_type', 'payment_voucher')
    .eq('reference_id', id)
  for (const e of entries ?? []) {
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('account_code, debit, credit, description')
      .eq('entry_id', e.id)
    if (!lines || lines.length === 0) continue
    try {
      await postJournalEntry(supabase, {
        transactionDate: dayjs().format('YYYY-MM-DD'),
        description: `VOID ${v.voucher_no}: reversal of ${e.description ?? ''}`.trim(),
        referenceType: 'payment_voucher_void',
        referenceId: id,
        segment: (e.segment as string) ?? undefined,
        lines: lines.map((l) => ({
          accountCode: l.account_code as string,
          debit: l.credit ? Number(l.credit) : undefined,
          credit: l.debit ? Number(l.debit) : undefined,
          description: `Reversal — ${l.description ?? ''}`.trim(),
        })),
        createdBy: user.id,
      })
    } catch (jeErr) {
      // Fail loud (2026-06-11 audit): a swallowed reversal leaves the voided
      // receipt's GL standing — books overstate cash/AR with zero trace.
      const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
      throw new Error(`Void ${v.voucher_no}: GL reversal failed (${e.entry_no ?? e.id}): ${msg}`)
    }
  }

  // 3) Reverse every pool row this voucher wrote, via the
  // reverse_voucher_pool_rows RPC (mig 20260611010000). One call covers all
  // shapes: consolidated per-invoice dept-pool credits, single target_pool
  // credit, AND the paying-side inter_billing_out row a netting settlement
  // leaves behind. SECURITY DEFINER because the old adjustPool('out', …,
  // approvalId=null) reversal was silently rejected by the
  // expense_has_approval CHECK + RLS — voided receipts never actually
  // un-credited dept pools.
  // Cast: mig 20260611010000 RPC is not yet in the generated database.types.ts.
  const { error: poolRevErr } = await supabase.rpc('reverse_voucher_pool_rows' as never, {
    p_voucher_no: v.voucher_no,
  } as never)
  if (poolRevErr) {
    throw new Error(`Void ${v.voucher_no}: pool reversal failed: ${poolRevErr.message}`)
  }

  // 4) Un-settle the invoice(s) back to issued
  const { data: linked } = await supabase
    .from('invoices')
    .select('id')
    .eq('settlement_voucher_id', id)
  if (linked && linked.length > 0) {
    const { error: unsettleErr } = await supabase
      .from('invoices')
      .update({ status: 'issued', settlement_voucher_id: null } as never)
      .eq('settlement_voucher_id', id)
    if (unsettleErr) throw new Error(`Void ${v.voucher_no}: invoice un-settle failed: ${unsettleErr.message}`)
  } else if (v.invoice_id) {
    const { error: unsettleErr } = await supabase
      .from('invoices')
      .update({ status: 'issued' })
      .eq('id', v.invoice_id)
      .in('status', ['paid', 'paid_via_netting'])
    if (unsettleErr) throw new Error(`Void ${v.voucher_no}: invoice un-settle failed: ${unsettleErr.message}`)
  }

  // 5) Mark the voucher voided (race-guarded on still-paid)
  const { error: updErr } = await supabase
    .from('payment_vouchers')
    .update({ status: 'voided' })
    .eq('id', id)
    .eq('status', 'paid')
  if (updErr) throw new Error(`Failed to void voucher: ${updErr.message}`)

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/billing')
  revalidatePath('/statements')
  revalidatePath('/dashboard')
  revalidatePath('/dept-pool')
  redirect('/payments')
}

// NOTE: createPaymentCategory / updatePaymentCategory were removed by the
// unified-COA migration (237/238). The Chart of Accounts IS the GL now —
// create/edit accounts via createAccount / updateAccount in settings/actions.ts.

// ─── Attachment signed URL (Principal + Finance) ────────────────────────────
// Defense-in-depth: the storage bucket policy allows any authenticated user to
// read, but `payment_attachments` table RLS limits SELECT to Principal/Finance.
// By fetching the row first we re-assert authz before signing a URL.

export async function getAttachmentSignedUrl(
  attachmentId: string,
): Promise<{ url: string; fileName: string }> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { data: attachment, error } = await supabase
    .from('payment_attachments')
    .select('storage_path, file_name')
    .eq('id', attachmentId)
    .single()

  if (error || !attachment) {
    throw new Error('Attachment not found or access denied')
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from('payment-attachments')
    .createSignedUrl(attachment.storage_path, 60)

  if (signErr || !signed) {
    throw new Error(`Failed to sign attachment URL: ${signErr?.message ?? 'unknown'}`)
  }

  return { url: signed.signedUrl, fileName: attachment.file_name }
}

// ─── Upload voucher attachment (Principal + Finance) ────────────────────────

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls (legacy, accepted because some bank receipts use it)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // doc
  'text/csv',
]
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls', '.docx', '.doc', '.csv']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function uploadVoucherAttachment(formData: FormData): Promise<{ count: number }> {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const voucherId = (formData.get('voucher_id') as string) ?? ''
  const description = ((formData.get('description') as string) ?? '').trim() || null
  if (!voucherId) throw new Error('voucher_id is required')

  const { data: voucher } = await supabase
    .from('payment_vouchers')
    .select('id, status')
    .eq('id', voucherId)
    .single()

  if (!voucher) throw new Error('Voucher not found')
  if (!['draft', 'pending_approval'].includes(voucher.status)) {
    throw new Error(`Cannot upload attachments when voucher status is "${voucher.status}"`)
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) throw new Error('No files provided')

  let uploaded = 0
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      throw new Error(`File "${file.name}" is larger than 10 MB`)
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new Error(`File "${file.name}" has disallowed MIME type: ${file.type}`)
    }
    const lowerName = file.name.toLowerCase()
    const dotIdx = lowerName.lastIndexOf('.')
    const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : ''
    if (!ALLOWED_EXT.includes(ext)) {
      throw new Error(`File "${file.name}" has disallowed extension: ${ext || '(none)'}`)
    }

    const key = `${voucherId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage
      .from('payment-attachments')
      .upload(key, buf, { contentType: file.type, upsert: false })

    if (upErr) throw new Error(`Upload failed for "${file.name}": ${upErr.message}`)

    const { error: insErr } = await supabase.from('payment_attachments').insert({
      voucher_id: voucherId,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: key,
      description,
      uploaded_by: user.id,
    })

    if (insErr) {
      // Best effort: rollback the storage object so we don't leak orphans
      await supabase.storage.from('payment-attachments').remove([key]).catch(() => {})
      throw new Error(`Attachment record insert failed: ${insErr.message}`)
    }

    uploaded++
  }

  revalidatePath(`/payments/${voucherId}`)
  revalidatePath('/approvals')
  return { count: uploaded }
}
