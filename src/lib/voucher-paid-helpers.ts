// Shared helpers for flipping a payment voucher to 'paid' and applying
// every downstream side effect (bank debit, dept_pool adjust, loan/fund-source
// repayment sync, GL journal entry). Used by:
//   - payments/actions.ts#approveVoucher (Principal approves from voucher page)
//   - approvals/actions.ts#approveRequest (Principal approves from queue)
//
// User directive 2026-04-19: "approve = execute". Principal now does the
// combined step in one click; the old separate Finance-side 'Execute payment'
// button was removed because Principal is typically the same person who
// would operate the Finance side.

import { postJournalEntry, r2 } from './journal'
import { assertPeriodOpen } from './period-lock'
import { createClient } from './supabase/server'

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// ─── Pool adjustment ────────────────────────────────────────────────────────

export async function adjustPool(
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
    if (pool === 'venture_pool') {
      await supabase.from('venture_pool').insert({
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
    } else if (pool.startsWith('dept_pool_')) {
      // All 5 Dept Pools (HR, Finance, Director Office, Marketing, Director)
      // live in dept_pools keyed by department_id. Explicit map because
      // 'dept_pool_director_office' → 'Director Office' needs underscore→space.
      const POOL_TO_DEPT: Record<string, string> = {
        dept_pool_hr: 'HR',
        dept_pool_finance: 'Finance',
        dept_pool_director_office: 'Director Office',
        dept_pool_marketing: 'Marketing',
        dept_pool_director: 'Director',
      }
      const deptName = POOL_TO_DEPT[pool]
      if (deptName) {
        const { data: dept } = await supabase
          .from('departments')
          .select('id')
          .eq('name', deptName)
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
        }
      }
    }
  } catch (err) {
    console.error('Pool adjustment failed:', pool, err)
  }
}

// Iterate payment_voucher_sources rows for a voucher and debit each pool.
// Used on DEBIT direction. Credit direction stays on single target_pool via
// adjustPool directly.
export async function debitVoucherPools(
  supabase: SupabaseClient,
  voucherId: string,
  description: string,
  userId: string,
  approvalId: string | null,
  nowIso: string,
) {
  const { data: rows } = await supabase
    .from('payment_voucher_sources')
    .select('pool, amount')
    .eq('voucher_id', voucherId)

  if (!rows || rows.length === 0) {
    console.warn('debitVoucherPools: no source rows for voucher', voucherId)
    return
  }

  for (const row of rows) {
    await adjustPool(
      supabase,
      row.pool,
      'out',
      r2(Number(row.amount)),
      description,
      userId,
      approvalId,
      nowIso,
    )
  }
}

// ─── Apply all side effects when a voucher transitions to 'paid' ───────────
// Caller is responsible for the status update on payment_vouchers itself
// (we can't do it here because approve vs approve-from-queue need different
// WHERE clauses).

interface PaidVoucherRow {
  id: string
  voucher_no: string | null
  voucher_type: string
  direction: string
  amount: number | string
  description: string | null
  payee_name: string | null
  bank_account_id: string | null
  target_pool: string | null
  fund_source_id: string | null
  loan_id: string | null
  repayment_breakdown: unknown
}

export async function applyVoucherPaidSideEffects(
  supabase: SupabaseClient,
  voucher: PaidVoucherRow,
  paymentDate: string,
  userId: string,
) {
  await assertPeriodOpen(supabase, paymentDate)

  const isCredit = voucher.direction === 'credit'
  const amount = r2(Number(voucher.amount))
  const nowIso = new Date().toISOString()

  // ── Bank balance (debit = subtract, credit = add) ──
  let bankGlCode = '3000'
  if (voucher.bank_account_id) {
    const { data: bank } = await supabase
      .from('bank_accounts')
      .select('current_balance, gl_account_code')
      .eq('id', voucher.bank_account_id)
      .single()

    if (bank) {
      bankGlCode = bank.gl_account_code ?? '3000'
      const newBalance = isCredit
        ? Number(bank.current_balance) + amount
        : Number(bank.current_balance) - amount
      await supabase
        .from('bank_accounts')
        .update({ current_balance: newBalance })
        .eq('id', voucher.bank_account_id)
    }
  }

  // ── Pool adjust ──
  const poolDescription = `PV ${voucher.voucher_no}: ${voucher.description}`
  const { data: linkedApproval } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('reference_id', voucher.id)
    .eq('reference_table', 'payment_vouchers')
    .eq('status', 'approved')
    .single()

  if (!isCredit) {
    await debitVoucherPools(
      supabase,
      voucher.id,
      poolDescription,
      userId,
      linkedApproval?.id ?? null,
      nowIso,
    )
  } else if (voucher.target_pool) {
    await adjustPool(
      supabase,
      voucher.target_pool,
      'in',
      amount,
      poolDescription,
      userId,
      linkedApproval?.id ?? null,
      nowIso,
    )
  }

  // ── Loan / fund source repayment sync ──
  if (voucher.repayment_breakdown && (voucher.fund_source_id || voucher.loan_id)) {
    const utcToday = new Date().toISOString().slice(0, 10)
    const repayDate = paymentDate > utcToday ? utcToday : paymentDate
    const breakdown = voucher.repayment_breakdown as {
      principal?: number
      interest?: number
      penalty?: number
    }
    const entries = [
      { payment_type: 'principal' as const, amt: Number(breakdown.principal ?? 0) },
      { payment_type: 'interest' as const, amt: Number(breakdown.interest ?? 0) },
      { payment_type: 'penalty' as const, amt: Number(breakdown.penalty ?? 0) },
    ].filter((e) => e.amt > 0)

    if (voucher.fund_source_id) {
      for (const e of entries) {
        const { error: repErr } = await supabase.from('fund_source_repayments').insert({
          fund_source_id: voucher.fund_source_id,
          amount: e.amt,
          payment_type: e.payment_type,
          payment_date: repayDate,
          notes: `Auto-synced from voucher ${voucher.voucher_no}`,
          payment_voucher_id: voucher.id,
          created_by: userId,
        })
        if (repErr) {
          console.error(`fund_source_repayments insert failed (${e.payment_type}):`, repErr.message)
        }
      }
    } else if (voucher.loan_id) {
      for (const e of entries) {
        const { error: repErr } = await supabase.from('repayments').insert({
          loan_id: voucher.loan_id,
          amount: e.amt,
          payment_type: e.payment_type,
          payment_date: repayDate,
          notes: `Auto-synced from voucher ${voucher.voucher_no}`,
          created_by: userId,
        })
        if (repErr) {
          console.error(`repayments insert failed (${e.payment_type}):`, repErr.message)
        }
      }

      const { data: pendingOverdue } = await supabase
        .from('overdue_records')
        .select('id, period_month')
        .eq('loan_id', voucher.loan_id)
        .eq('status', 'pending')
        .order('period_month', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pendingOverdue) {
        await supabase
          .from('overdue_records')
          .update({ status: 'paid' })
          .eq('id', pendingOverdue.id)
      }
    }
  }

  // ── GL journal (double-entry, non-blocking) ──
  // Mig 238 unified COA — accounts remapped to new ranges. See coa.ts for the
  // full type/range map. This fallback is the catch-all when a PV doesn't
  // have a more specific account_code on its source row.
  const expenseAccount: Record<string, string> = {
    loan_repayment: '4000',     // Fund Sources Payable (liability ↓)
    billing_payment: '4050',    // AP — General (liability ↓)
    claim_payout: '9000',       // G&A Expense (no dedicated claims account in seed)
    expense: '9000',            // G&A Expense
    internal_transfer: '3010',  // Alliance Bank (the other bank account)
    salary_payout: '4020',      // Salary Payable (liability ↓)
    other: '9000',              // G&A Expense
  }
  const debitAccount = expenseAccount[voucher.voucher_type] ?? '9000'

  try {
    const lines = isCredit
      ? [
          { accountCode: bankGlCode, debit: amount, description: `Bank deposit — ${voucher.voucher_no}` },
          { accountCode: '3030', credit: amount, description: `Payment received — ${voucher.payee_name}` },
        ]
      : [
          { accountCode: debitAccount, debit: amount, description: `${voucher.voucher_type} — ${voucher.payee_name}` },
          { accountCode: bankGlCode, credit: amount, description: `Bank payment — ${voucher.voucher_no}` },
        ]

    const journalId = await postJournalEntry(supabase, {
      transactionDate: paymentDate,
      description: `PV ${voucher.voucher_no}: ${voucher.description}`,
      referenceType: 'payment_voucher',
      referenceId: voucher.id,
      lines,
      createdBy: userId,
    })

    await supabase
      .from('payment_vouchers')
      .update({ journal_entry_id: journalId })
      .eq('id', voucher.id)
  } catch {
    console.error('GL journal posting failed for voucher', voucher.id)
  }
}
