'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

/**
 * Stage E — Finance generates a Payment Voucher against a submitted
 * payroll_payment_request.
 *
 * Task 3: Finance now allocates the payroll total across up to 5 Department
 * Pools (HR / Finance / Director Office / Marketing + a spare slot) in the
 * Generate PV form. Each pool contribution writes one payment_voucher_sources
 * row; the sum is validated to equal request.amount here and again by the
 * pvs_sum_matches_voucher trigger on approval.
 *
 * The PV is created in 'pending_approval' status with:
 *   - voucher_type = 'payroll_bank_transfer'
 *   - direction = 'debit'
 *   - amount = request.amount (locked)
 *   - bank_account_id = source bank picked by Finance
 *   - payment_voucher_sources = up to 5 rows (one per Dept Pool allocation)
 *
 * Pre-checks before insert:
 *   - Source bank balance ≥ request.amount (same check runs again on approval)
 *   - Sum of source allocations == request.amount
 *   - Each source pool has enough balance (operating_pools trigger would also
 *     reject at approval; the UI check gives Finance an early error)
 *
 * On success: redirect to /payments/[voucherId] so Finance can review before
 * submitting to Principal.
 */
export interface PayrollPoolSource {
  pool: string
  amount: number
}

export async function generatePvFromRequest(
  requestId: string,
  sourceBankId: string,
  sources: PayrollPoolSource[],
): Promise<string> {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('At least one source pool allocation is required')
  }
  if (sources.length > 5) {
    throw new Error('Too many source pools — the voucher supports at most 5')
  }
  for (const s of sources) {
    if (!s.pool || typeof s.pool !== 'string') throw new Error('Invalid source pool')
    if (!(s.amount > 0)) throw new Error(`Allocation for ${s.pool} must be positive`)
  }

  // ── Read the request + its linked payroll_run for period context ──────────
  const { data: req, error: reqErr } = await supabase
    .from('payroll_payment_requests')
    .select(
      'id, status, amount, payroll_run_id, target_pool, payroll_runs!inner(period_month)',
    )
    .eq('id', requestId)
    .maybeSingle()

  if (reqErr) throw new Error(`Failed to read request: ${reqErr.message}`)
  if (!req) throw new Error('Payment request not found')
  if (req.status !== 'submitted') {
    throw new Error(
      `Cannot generate PV — request status is ${req.status}. Only 'submitted' requests can be picked up.`,
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodMonth = (req.payroll_runs as any).period_month as string
  const amount = Number(req.amount)

  // ── Validate source allocation sum matches request total ──────────────────
  const allocatedSum = sources.reduce((acc, s) => acc + s.amount, 0)
  const allocatedCents = Math.round(allocatedSum * 100)
  const amountCents = Math.round(amount * 100)
  if (allocatedCents !== amountCents) {
    throw new Error(
      `Source allocation RM ${allocatedSum.toFixed(2)} does not match payroll total RM ${amount.toFixed(2)}`,
    )
  }

  // ── Validate + sufficient-balance check on the source bank ────────────────
  const { data: bank, error: bankErr } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, current_balance, status')
    .eq('id', sourceBankId)
    .maybeSingle()

  if (bankErr) throw new Error(`Failed to read bank: ${bankErr.message}`)
  if (!bank) throw new Error('Source bank not found')
  if (bank.status !== 'active') throw new Error(`Bank ${bank.bank_name} is not active`)

  const balance = Number(bank.current_balance)
  if (balance < amount) {
    throw new Error(
      `Insufficient balance in ${bank.bank_name}: RM ${balance.toFixed(2)} available, ` +
        `payroll needs RM ${amount.toFixed(2)}. ` +
        `Top up the bank before generating the payment voucher.`,
    )
  }

  // ── Generate voucher number matching the existing HV-PV-YYYYMM-NNNN pattern
  const voucherPeriod = dayjs().format('YYYYMM')
  const { count } = await supabase
    .from('payment_vouchers')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const voucherNo = `HV-PV-${voucherPeriod}-${String(seq).padStart(4, '0')}`

  const todayStr = dayjs().format('YYYY-MM-DD')
  const periodLabel = dayjs(periodMonth).format('MMM YYYY')

  // ── Insert the PV (pending_approval so Principal sees it immediately) ─────
  const { data: voucher, error: vErr } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: 'payroll_bank_transfer',
      direction: 'debit',
      status: 'pending_approval',
      amount,
      currency: 'MYR',
      bank_account_id: sourceBankId,
      payee_name: 'HOUZS Venture — HR Pool (Alliance Bank)',
      description: `Payroll bank transfer — ${periodLabel}`,
      payment_method: 'bank_transfer',
      payment_date: todayStr,
      reference_type: 'payroll_payment_request',
      reference_id: requestId,
      created_by: user.id,
    })
    .select('id, voucher_no')
    .single()

  if (vErr || !voucher) {
    throw new Error(`Failed to create PV: ${vErr?.message ?? 'unknown'}`)
  }

  // ── Insert source pool allocations (up to 5 rows) ─────────────────────────
  // Post-mig 238: PVS rows must reference chart_of_accounts via account_code.
  // Payroll bank transfers post to Salary Expense (9030).
  const { error: srcErr } = await supabase
    .from('payment_voucher_sources')
    .insert(
      sources.map(s => ({
        voucher_id: voucher.id,
        pool: s.pool,
        amount: s.amount,
        account_code: '9030',
      })),
    )

  if (srcErr) {
    // Best effort: PV exists but source rows failed. Surface the error so
    // Finance can fix on the detail page before submitting for approval.
    console.error('Failed to insert voucher sources:', srcErr.message)
    throw new Error(
      `PV ${voucher.voucher_no} created but source allocations failed: ${srcErr.message}`,
    )
  }

  // ── Open an approval_requests row so Principal's /approvals queue shows
  //    this PV alongside other pending decisions. Matches the pattern that
  //    createPaymentVoucher → submitForApproval uses when Finance creates
  //    PVs the normal way (payments/actions.ts:277).
  const { error: approvalErr } = await supabase
    .from('approval_requests')
    .insert({
      request_type: 'payment_voucher',
      reference_id: voucher.id,
      reference_table: 'payment_vouchers',
      submitted_by: user.id,
      description: `${voucher.voucher_no}: Payroll bank transfer — ${periodLabel}`,
      amount,
      status: 'pending',
      workflow_state: 'submitted',
    })

  if (approvalErr) {
    // Non-fatal: PV is already marked pending_approval; Principal can find
    // it via /payments?status=pending_approval even without the queue row.
    console.error('Failed to open approval_request for PV:', approvalErr.message)
  }

  // ── Link request → PV and flip state ──────────────────────────────────────
  const { error: linkErr } = await supabase
    .from('payroll_payment_requests')
    .update({
      pv_id: voucher.id,
      status: 'pv_generated',
      source_bank_id: sourceBankId,
    })
    .eq('id', requestId)
    .eq('status', 'submitted')

  if (linkErr) {
    // The PV is already created at this point; surface the linking error but
    // don't roll back — Finance can manually link via SQL if needed.
    throw new Error(
      `PV ${voucher.voucher_no} created, but failed to link back to the request: ${linkErr.message}. ` +
        `Contact an engineer.`,
    )
  }

  // ── Refresh affected surfaces ─────────────────────────────────────────────
  revalidatePath('/payments')
  revalidatePath('/payments/payroll-requests')
  revalidatePath(`/hr-costing/payroll/${periodMonth}`)
  revalidatePath('/hr-costing/payroll')
  revalidatePath('/dashboard')
  revalidatePath('/approvals')

  redirect(`/payments/${voucher.id}`)
}

/**
 * Finance cancels a submitted request (misclick, wrong period, etc.).
 * Only submitted (not yet picked up) requests can be cancelled this way.
 */
export async function financeCancelRequest(
  requestId: string,
  reason: string,
): Promise<void> {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const trimmed = reason.trim()
  if (trimmed.length === 0) throw new Error('Cancellation reason is required')

  const { data: req, error: readErr } = await supabase
    .from('payroll_payment_requests')
    .select('id, status, payroll_runs(period_month)')
    .eq('id', requestId)
    .maybeSingle()

  if (readErr) throw new Error(`Failed to read request: ${readErr.message}`)
  if (!req) throw new Error('Request not found')
  if (req.status !== 'submitted') {
    throw new Error(`Cannot cancel — request status is ${req.status}`)
  }

  const { error } = await supabase
    .from('payroll_payment_requests')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancellation_reason: trimmed,
    })
    .eq('id', requestId)
    .eq('status', 'submitted')

  if (error) throw new Error(`Cancel failed: ${error.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodMonth = (req.payroll_runs as any)?.period_month
  if (periodMonth) revalidatePath(`/hr-costing/payroll/${periodMonth}`)
  revalidatePath('/payments/payroll-requests')
  revalidatePath('/hr-costing/payroll')
  revalidatePath('/dashboard')
}
