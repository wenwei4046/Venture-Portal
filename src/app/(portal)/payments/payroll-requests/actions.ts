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
 * The PV is created in 'pending_approval' status (goes straight to Principal,
 * no draft step) with:
 *   - voucher_type = 'payroll_bank_transfer'
 *   - direction = 'debit'
 *   - amount = request.amount (locked)
 *   - bank_account_id = source bank picked by Finance
 *   - payment_voucher_sources = one row with the source pool picked by Finance
 *
 * Sufficient-balance check is enforced here (user constraint 2026-04-17):
 *   - source bank balance ≥ request amount — otherwise the server action
 *     aborts before inserting the PV. The same bank-balance check runs again
 *     in approveVoucher when Principal approves, so this is a pre-check to
 *     give Finance an early error instead of a failed approval later.
 *
 * On success:
 *   - PV row inserted with reference_type='payroll_payment_request', reference_id=requestId
 *   - payroll_payment_requests.pv_id + status='pv_generated' + source_bank_id set
 *   - Finance is redirected to /payments/[voucherId] so they can review and
 *     edit source pools before Principal sees it.
 *
 * Multi-pool sourcing: this action sets ONE source pool. If the payroll needs
 * to draw from multiple operating pools (HR OPEX + Finance OPEX + etc.),
 * Finance opens the PV detail page and adds more rows to payment_voucher_sources
 * before submitting to Principal. This keeps the queue UI minimal.
 */
export async function generatePvFromRequest(
  requestId: string,
  sourceBankId: string,
  sourcePool: string,
): Promise<string> {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

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

  // ── Add the source pool row. Finance can add more pools on the PV detail ──
  const { error: srcErr } = await supabase
    .from('payment_voucher_sources')
    .insert({
      voucher_id: voucher.id,
      pool: sourcePool,
      amount,
    })

  if (srcErr) {
    // Best effort: PV exists but source row failed. Warn Finance to fix on
    // the detail page before submitting for approval.
    console.error('Failed to insert voucher source:', srcErr.message)
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
