'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

/**
 * Stage E — Finance generates a payroll funding Payment Voucher against a
 * payroll_payment_request. Supports PARTIAL funding across several PVs.
 *
 * Mig 20260720 semantics (user ruling): the funding PV is a Hong Leong →
 * Alliance STAGING TRANSFER plus the per-dept salary accrual. On Principal's
 * approval it:
 *   - books Dr 9030 / Cr 4020 per source pool (segment-tagged accrual);
 *   - debits the source bank and credits the Alliance payroll bank (GL 3010),
 *     with a per-pool transfer JE so each dept's per-bank slice follows;
 *   - touches NO dept pool — cash changing banks doesn't change whose it is.
 * Dept pools are drained at Stage-G payout, each department for its own staff.
 *
 * Finance types how much each department contributes THIS round; each pool
 * contribution writes one payment_voucher_sources row and the PV amount = this
 * round's sum (validated == sources by the pvs_sum_matches_voucher trigger).
 *
 * Pre-checks before insert:
 *   - This round's sum is positive and ≤ the request's OUTSTANDING remainder
 *     (request total − already-committed non-voided funding PVs)
 *   - Source bank must cover this round (real cash moves at approval now);
 *     partial rounds keep a thin Hong Leong workable.
 *
 * The request stays fundable (submitted / pv_generated) until the CUMULATIVE
 * paid reaches the total, when the completion trigger flips it to 'completed'.
 *
 * On success: redirect to /payments/[voucherId].
 */
export interface PayrollPoolSource {
  pool: string
  amount: number
}

export async function generatePvFromRequest(
  requestId: string,
  sourceBankId: string,
  sources: PayrollPoolSource[],
  paymentDate: string,
): Promise<string> {
  const user = await requireRole(['finance', 'principal'])
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

  // Payment date drives the voucher + (at approval) the GL posting date. Default
  // today; the approval RPC period-lock guards the chosen month.
  const payDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate ?? '')
    ? paymentDate
    : dayjs().format('YYYY-MM-DD')

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
  if (req.status !== 'submitted' && req.status !== 'pv_generated') {
    throw new Error(
      `Cannot generate PV — request status is ${req.status}. Only open requests can be funded.`,
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodMonth = (req.payroll_runs as any).period_month as string
  const amount = Number(req.amount)

  // ── Partial funding: this round funds some/all of the OUTSTANDING remainder ──
  // Committed = sum of amounts on prior non-voided funding PVs for this request.
  const { data: priorPvs, error: priorErr } = await supabase
    .from('payment_vouchers')
    .select('amount')
    .eq('reference_type', 'payroll_payment_request')
    .eq('reference_id', requestId)
    .neq('status', 'voided')
  if (priorErr) throw new Error(`Failed to read prior funding PVs: ${priorErr.message}`)

  const committedCents = (priorPvs ?? []).reduce(
    (acc, p) => acc + Math.round(Number(p.amount) * 100),
    0,
  )
  const amountCents = Math.round(amount * 100)
  const remainingCents = amountCents - committedCents

  const allocatedSum = sources.reduce((acc, s) => acc + s.amount, 0)
  const allocatedCents = Math.round(allocatedSum * 100)
  const roundAmount = Number((allocatedCents / 100).toFixed(2))
  const isPartial = allocatedCents < amountCents

  if (allocatedCents <= 0) {
    throw new Error('This round must fund a positive amount')
  }
  if (allocatedCents > remainingCents) {
    throw new Error(
      `This round funds RM ${allocatedSum.toFixed(2)} but only RM ${(remainingCents / 100).toFixed(2)} ` +
        `is still outstanding on this payroll.`,
    )
  }

  // ── Validate + sufficient-balance check on the source bank ────────────────
  const { data: bank, error: bankErr } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, status, current_balance, gl_account_code')
    .eq('id', sourceBankId)
    .maybeSingle()

  if (bankErr) throw new Error(`Failed to read bank: ${bankErr.message}`)
  if (!bank) throw new Error('Source bank not found')
  if (bank.status !== 'active') throw new Error(`Bank ${bank.bank_name} is not active`)
  if (bank.gl_account_code === '3010') {
    throw new Error(
      `${bank.bank_name} is the Alliance payroll destination — pick the bank the cash comes FROM.`,
    )
  }
  // Mig 20260720: the funding PV moves real cash at approval (HL → Alliance
  // staging transfer), so this round must fit in the source bank. Approval
  // re-checks with a row lock; this early check just fails fast for Finance.
  if (Number(bank.current_balance ?? 0) < roundAmount) {
    throw new Error(
      `${bank.bank_name} holds RM ${Number(bank.current_balance ?? 0).toFixed(2)} but this round needs ` +
        `RM ${roundAmount.toFixed(2)}. Fund a smaller round now and the rest when cash arrives.`,
    )
  }

  // ── Generate voucher number matching the existing HV-PV-YYYYMM-NNNN pattern
  const voucherPeriod = dayjs(payDate).format('YYYYMM')
  const { count } = await supabase
    .from('payment_vouchers')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const voucherNo = `HV-PV-${voucherPeriod}-${String(seq).padStart(4, '0')}`

  const periodLabel = dayjs(periodMonth).format('MMM YYYY')

  // ── Insert the PV (pending_approval so Principal sees it immediately) ─────
  const { data: voucher, error: vErr } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: 'payroll_bank_transfer',
      direction: 'debit',
      status: 'pending_approval',
      amount: roundAmount,
      currency: 'MYR',
      bank_account_id: sourceBankId,
      payee_name: 'HOUZS Venture — Payroll staging (Alliance Bank)',
      description: `Payroll bank transfer — ${periodLabel}${isPartial ? ' (partial)' : ''}`,
      payment_method: 'bank_transfer',
      payment_date: payDate,
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
    // PV exists but source rows failed. Surface the error so Finance can fix
    // on the detail page before submitting for approval.
    throw new Error(
      `PV ${voucher.voucher_no} created but source allocations failed: ${srcErr.message}`,
    )
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
    .in('status', ['submitted', 'pv_generated'])

  if (linkErr) {
    // The PV is already created at this point; surface the linking error but
    // don't roll back — Finance can manually link via SQL if needed.
    throw new Error(
      `PV ${voucher.voucher_no} created, but failed to link back to the request: ${linkErr.message}. ` +
        `Contact an engineer.`,
    )
  }

  // ── Open an approval_requests row so Principal's /approvals queue shows
  //    this PV alongside other pending decisions. Matches the pattern that
  //    createPaymentVoucher → submitForApproval uses when Finance creates
  //    PVs the normal way. Runs AFTER the request→PV link on purpose: the
  //    link flips the request off 'submitted', so a failure here can't be
  //    retried into a duplicate PV. Fail loud (2026-06-11 audit) — without
  //    the queue row the PV silently never reaches Principal's /approvals.
  const { error: approvalErr } = await supabase
    .from('approval_requests')
    .insert({
      request_type: 'payment_voucher',
      reference_id: voucher.id,
      reference_table: 'payment_vouchers',
      submitted_by: user.id,
      description: `${voucher.voucher_no}: Payroll bank transfer — ${periodLabel}${isPartial ? ' (partial)' : ''}`,
      amount: roundAmount,
      status: 'pending',
      workflow_state: 'submitted',
    })

  if (approvalErr) {
    throw new Error(
      `PV ${voucher.voucher_no} created and linked, but opening the approval queue entry failed: ${approvalErr.message}. ` +
        `Principal can still approve it from /payments (status: pending approval).`,
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
  const user = await requireRole(['finance', 'principal'])
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

/**
 * Mig 20260720 — one-click statutory vouchers (KWSP / PERKESO / LHDN) for a
 * payroll period, split per staff department pool (each dept pays its own
 * people's statutory). Created as pending approvals with payment_date NULL:
 * the actual payment date is uncertain, so Finance edits it on the PV before
 * Principal approves (the GL date follows the payment date, mig 20260611).
 */
export interface StatutoryResult {
  count: number
  total: number
  vouchers: { id: string; voucher_no: string; payee: string; amount: number }[]
}

export async function generateStatutoryVouchers(
  period: string,
  bankAccountId: string,
  splitByDept = false,
): Promise<StatutoryResult> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error('Invalid period')
  if (!bankAccountId) throw new Error('Pick the bank the statutory payments go out from')

  // RPC added in mig 20260720100000 (+ p_split_by_dept, mig 20260720120000);
  // database.types.ts not regenerated (same escape hatch as
  // create_payroll_disbursement_vouchers).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(
    'create_payroll_statutory_vouchers',
    { p_period: period, p_bank_account_id: bankAccountId, p_split_by_dept: splitByDept },
  )

  if (error) throw new Error(error.message)

  revalidatePath('/payments')
  revalidatePath('/payments/payroll-requests')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')

  return data as unknown as StatutoryResult
}
