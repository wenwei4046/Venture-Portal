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

import { r2 } from './journal'
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
  // Fail loud (2026-06-11 audit): this used to swallow every failure
  // (try/catch → console.error AND unchecked insert errors), which is exactly
  // how dept-pool balances drifted from their GL segments. Any failure here
  // now throws so the caller's action surfaces it instead of half-applying.
  if (pool === 'venture_pool') {
    const { error } = await supabase.from('venture_pool').insert({
      transaction_type: direction === 'out' ? 'expense_out' : 'profit_in',
      amount,
      description,
      reference_table: 'payment_vouchers',
      created_by: userId,
    })
    if (error) throw new Error(`Pool adjustment failed (venture_pool ${direction} ${amount}): ${error.message}`)
  } else if (pool === 'invoice_payout_pool') {
    const { error } = direction === 'out'
      ? await supabase.from('invoice_payout_pool').insert({
          transaction_type: 'release' as const,
          amount,
          description,
          release_approved_by: userId,
          release_approved_at: nowIso,
        })
      : await supabase.from('invoice_payout_pool').insert({
          transaction_type: 'accumulate' as const,
          amount,
          description,
        })
    if (error) throw new Error(`Pool adjustment failed (invoice_payout_pool ${direction} ${amount}): ${error.message}`)
  } else if (pool.startsWith('dept_pool_')) {
    // Dept Pools live in dept_pools keyed by department_id. The five cores
    // keep the explicit name map ('dept_pool_director_office' → 'Director
    // Office' needs underscore→space); dynamically provisioned departments
    // (2026-08-24) resolve by segment_key — their pool key is always
    // 'dept_pool_<segment_key>'.
    const POOL_TO_DEPT: Record<string, string> = {
      dept_pool_hr: 'HR',
      dept_pool_finance: 'Finance',
      dept_pool_director_office: 'Director Office',
      dept_pool_marketing: 'Marketing',
      dept_pool_director: 'Director',
    }
    const deptName = POOL_TO_DEPT[pool]

    const { data: dept, error: deptErr } = deptName
      ? await supabase.from('departments').select('id').eq('name', deptName).single()
      : await supabase.from('departments').select('id').eq('segment_key', pool.slice('dept_pool_'.length)).single()
    if (deptErr || !dept) {
      throw new Error(
        `Pool adjustment failed: unknown dept pool "${pool}"${deptErr ? ` (${deptErr.message})` : ''}`,
      )
    }

    const { error } = await supabase.from('dept_pools').insert({
      department_id: dept.id,
      transaction_type: direction === 'out' ? 'expense_out' : 'np_in',
      amount,
      description,
      approval_id: direction === 'out' ? approvalId : null,
      created_by: userId,
    })
    if (error) throw new Error(`Pool adjustment failed (${pool} ${direction} ${amount}): ${error.message}`)
  } else if (pool) {
    throw new Error(`Pool adjustment failed: unknown pool "${pool}"`)
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

// applyVoucherPaidSideEffects was removed 2026-06-11: zero callers (approve
// paths inline their own side-effect handling in payments/actions.ts and
// approvals/actions.ts) and its swallowed-error style predated the fail-loud
// audit. Recover from git history if a shared paid-transition helper is ever
// wanted again — and make it throw.
