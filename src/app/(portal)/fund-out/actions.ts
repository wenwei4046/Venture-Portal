'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requirePermission } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { officeToday } from '@/lib/office-time'
import { postJournalEntry } from '@/lib/journal'
import { validateDisbursementAccount } from '@/lib/loan-disbursement'
import {
  resolveLoansReceivableLeaf,
  resolveInterestSuspenseLeaf,
  INTEREST_INCOME_CODE,
  INTEREST_SUSPENSE_PARENT,
} from '@/lib/loans-coa'
import type { PaymentType } from '@/types'
import type { Json } from '@/lib/supabase/database.types'

// ─── Create new loan (Finance) ────────────────────────────────────────────────
//
// Returns `{ error }` for validation/RPC failures so the message survives
// Next.js 15's production error redaction. Only `redirect()` (which throws
// NEXT_REDIRECT internally) propagates as a throw.

export type CreateLoanResult = { error: string } | undefined

export async function createLoan(formData: FormData): Promise<CreateLoanResult> {
  await requireActionOn('/fund-out', 'treasury', 'create')
  const supabase = await createClient()

  const companyId = (formData.get('company_id') as string) ?? ''
  const principal = parseFloat((formData.get('principal') as string) ?? '0')
  const rawTenure = (formData.get('tenure_months') as string) ?? ''
  const tenureMonths = parseInt(rawTenure, 10)
  // Tenure is OPTIONAL (2026-06-12): blank = 无固定期限. Interest still accrues
  // from the loan start date. Match the existing no-term convention — store
  // tenure_months=1 as a placeholder and mark repayment_terms 未定 so
  // isLoanUnscheduled() routes it to the compounding / no-fixed-term bucket.
  const noFixedTerm = rawTenure.trim() === ''
  let repaymentTerms = (formData.get('repayment_terms') as string) ?? ''
  const loanStartDate = (formData.get('loan_start_date') as string) ?? ''
  const disbursementAccountCode = ((formData.get('disbursement_account_code') as string) ?? '').trim()

  if (!companyId) return { error: 'Company is required' }
  if (isNaN(principal) || principal <= 0) {
    return { error: 'Principal must be greater than 0' }
  }
  if (principal > 100_000_000) {
    return { error: 'Principal exceeds RM 100M ceiling' }
  }
  // 1..120 like fund sources (2026-09-22, mig 20260922020000 lifted the RPC's 12).
  if (!noFixedTerm && (isNaN(tenureMonths) || tenureMonths < 1 || tenureMonths > 120)) {
    return { error: 'Repayment period must be between 1 and 120 months (or leave blank for no fixed term)' }
  }
  if (!loanStartDate || !dayjs(loanStartDate).isValid()) {
    throw new Error('Loan start date is required')
  }
  // 首期还款日 (2026-09-22, "首期日 fund in 和 fund out 要一样"): optional, on or
  // after the start date; only its month matters (repayment_start_month).
  const repaymentStartDate = ((formData.get('repayment_start_date') as string) ?? '').trim()
  if (repaymentStartDate) {
    if (!dayjs(repaymentStartDate).isValid()) return { error: 'Expected repayment date is not a valid date' }
    if (dayjs(repaymentStartDate).isBefore(dayjs(loanStartDate), 'day')) {
      return { error: 'Expected repayment date must be on or after the loan start date' }
    }
  }
  const effectiveTenure = noFixedTerm ? 1 : tenureMonths
  if (noFixedTerm) {
    // Ensure the schedule treats it as unscheduled even if the user left
    // Repayment terms blank (isLoanUnscheduled keys on this text).
    repaymentTerms = repaymentTerms.trim()
      ? `未定还款 · ${repaymentTerms.trim()}`
      : '利滚利挂账(未定还款) · 利息从放款日起算'
  }

  // 资金来源 rides inside repayment_terms as a `· 资金来源: X` suffix —
  // fundingSourceFromTerms() parses it back out for the SC badge. `·` is the
  // segment delimiter of that parser, so it can't appear in the value.
  const fundingSource = ((formData.get('funding_source') as string) ?? '')
    .replace(/[·\r\n]+/g, ' ')
    .trim()
  if (fundingSource) {
    repaymentTerms = repaymentTerms.trim()
      ? `${repaymentTerms.trim()} · 资金来源: ${fundingSource}`
      : `资金来源: ${fundingSource}`
  }

  // Surface period-lock conflicts at creation time rather than at approval
  // time — the auto-generated disbursement PV will be dated loanStartDate
  // and would otherwise fail on approval if its period is locked. Mirrors
  // the assertPeriodOpen call in recordRepayment.
  await assertPeriodOpen(supabase, loanStartDate)

  // Validate the disbursement account: must exist, be active, and be
  // BS-classified (asset / fixed_asset / liability / equity in the unified
  // COA). This guarantees the loan principal can never leak into the P&L via
  // the auto-created disbursement PV.
  const { data: acctRows, error: acctErr } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, is_active, parent_code')
  if (acctErr) return { error: `Account lookup failed: ${acctErr.message}` }
  const acctErrMsg = validateDisbursementAccount(
    disbursementAccountCode,
    (acctRows ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      account_type: r.type as string,
      is_active: r.is_active,
      parent_code: r.parent_code ?? null,
    })),
  )
  if (acctErrMsg) return { error: acctErrMsg }

  // ─── Look up active base rate ───
  const { data: baseRate, error: brError } = await supabase
    .from('base_rate_history')
    .select('base_rate, effective_from, effective_to')
    .not('approved_at', 'is', null)
    .lte('effective_from', officeToday())
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (brError) return { error: `Base rate lookup failed: ${brError.message}` }
  if (!baseRate) {
    return {
      error:
        'No approved base rate found. Principal must approve a base rate before loans can be created.',
    }
  }

  // ─── Look up company ───
  const { data: company, error: cError } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .eq('is_active', true)
    .single()

  if (cError || !company) return { error: 'Company not found or inactive' }

  // Custom interest rate from form (% per month → decimal)
  const customRatePercent = parseFloat((formData.get('custom_rate_percent') as string) ?? '0')
  if (isNaN(customRatePercent) || customRatePercent < 0 || customRatePercent >= 100) {
    return { error: 'Custom interest rate must be between 0 and 100%' }
  }
  const customRate = customRatePercent / 100

  const base = Number(baseRate.base_rate)
  const premium = customRate
  const effective = base + premium

  // Bank balance check moved to approval/disbursement time. At creation the
  // loan is only pending_approval — no money moves — so blocking Finance
  // here was premature (the bank can be capitalised between submit and
  // Principal's approval).

  // ─── Atomic loan + approval creation (M1 fix) ───
  // Mig 239: the 10-arg create_loan_with_approval RPC accepts the BS account
  // code and writes it on the disbursement PV source row in a single
  // transaction. No post-RPC patch needed.
  const { data: loanId, error: rpcError } = await supabase.rpc(
    'create_loan_with_approval',
    {
      p_company_id: companyId,
      p_principal: principal,
      p_base_rate: base,
      p_risk_premium: premium,
      p_effective_rate: effective,
      p_tenure_months: effectiveTenure,
      p_repayment_terms: repaymentTerms || undefined,
      p_company_name: company.name,
      p_disbursement_date: loanStartDate,
      p_disbursement_account_code: disbursementAccountCode,
      // Mig 20260612040000: which bank pays out (empty = primary).
      p_bank_account_id: ((formData.get('bank_account_id') as string) || null) as never,
    }
  )

  if (rpcError || !loanId) {
    return { error: `Failed to create loan: ${rpcError?.message ?? 'unknown'}` }
  }

  // 利滚利 / 最低还息 — settable at creation (2026-06-12 / 2026-09-04). The RPC
  // doesn't take them, so flag the just-created loan. Safe: it's still
  // pending_approval (no GL/cash yet), and both flags only affect the
  // schedule/tracking math, not the disbursement.
  const creationFlags: { compound_interest?: boolean; min_pay_interest?: boolean; repayment_start_month?: string } = {}
  if (formData.get('compound_interest') === 'on') creationFlags.compound_interest = true
  if (formData.get('min_pay_interest') === 'on') creationFlags.min_pay_interest = true
  // First installment month, same field the detail page's 还款起始月 editor sets.
  if (repaymentStartDate) creationFlags.repayment_start_month = dayjs(repaymentStartDate).startOf('month').format('YYYY-MM-DD')
  if (Object.keys(creationFlags).length > 0) {
    const { error: cErr } = await supabase
      .from('loans')
      .update(creationFlags)
      .eq('id', loanId as string)
      .eq('status', 'pending_approval')
    if (cErr) return { error: `Loan created but marking 利滚利/最低还息/首期 failed: ${cErr.message}` }
  }

  revalidatePath('/fund-out')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  redirect(`/fund-out/${loanId}`)
}

// ─── Record repayment (Finance) ───────────────────────────────────────────────

export async function recordRepayment(formData: FormData) {
  const user = await requireActionOn('/fund-out', 'treasury', 'create')
  const supabase = await createClient()

  const loanId = (formData.get('loan_id') as string) ?? ''
  const paymentType = (formData.get('payment_type') as PaymentType) ?? 'interest'
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const paymentDate = (formData.get('payment_date') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (!loanId) throw new Error('Loan id is required')
  if (!['principal', 'interest', 'penalty', 'netting'].includes(paymentType)) {
    throw new Error('Invalid payment type')
  }
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  if (!paymentDate) {
    throw new Error('Payment date is required')
  }
  if (dayjs(paymentDate).isAfter(officeToday(), 'day')) {
    throw new Error('Payment date cannot be in the future')
  }

  await assertPeriodOpen(supabase, paymentDate)

  // Check loan is active and amount doesn't exceed outstanding for principal payments
  const { data: loan, error: loanError } = await supabase
    .from('loans')
    .select('status, principal')
    .eq('id', loanId)
    .single()

  if (loanError || !loan) throw new Error('Loan not found')
  if (loan.status !== 'active') {
    throw new Error(`Cannot record repayment on ${loan.status} loan`)
  }

  // For principal payments, check against outstanding via the view
  if (paymentType === 'principal') {
    const { data: outstanding } = await supabase
      .from('loan_outstanding')
      .select('outstanding')
      .eq('loan_id', loanId)
      .single()

    const currentOutstanding = Number(outstanding?.outstanding ?? loan.principal)
    if (amount > currentOutstanding) {
      throw new Error(
        `Principal payment ${amount} exceeds outstanding ${currentOutstanding}`
      )
    }
  }

  const { error: insertError } = await supabase.from('repayments').insert({
    loan_id: loanId,
    amount,
    payment_type: paymentType,
    payment_date: paymentDate,
    notes,
    created_by: user.id,
  })

  if (insertError) {
    throw new Error(`Failed to record repayment: ${insertError.message}`)
  }

  // Venture Pool cash ledger: only principal repayments return capital to HV
  // (Phase 10 / mig 192, Q3=A). Interest/penalty/netting are revenue streams,
  // not cash-back, and don't hit venture_pool.
  if (paymentType === 'principal') {
    const { error: vpError } = await supabase.from('venture_pool').insert({
      transaction_type: 'loan_repayment_in',
      amount,
      description: `Loan principal repayment — ${loanId}`,
      reference_id: loanId,
      reference_table: 'loans',
      created_by: user.id,
    })
    if (vpError) {
      throw new Error(`Repayment recorded but venture_pool loan_repayment_in failed: ${vpError.message}`)
    }
  }

  // Mig 197/P1-7: post matching GL journal for the direct recordRepayment
  // path. PV-driven repayments already write JE via approve_single_voucher;
  // this path only fires when Finance records a repayment outside the PV
  // flow (rare), so we add the JE here for symmetry.
  //
  //   principal → dr Bank / cr 1020 Loans Receivable
  //   interest  → dr Bank / cr 4010 Interest Income — Loans
  //   penalty   → dr Bank / cr 4020 Penalty Income
  //   netting   → dr Bank / cr 4010 (treated as interest-style gain)
  // Honor a caller-supplied bank (e.g. the receive form's bank picker); else
  // fall back to the primary active bank (the loan-detail RepaymentForm path).
  const bankAccountIdParam = (formData.get('bank_account_id') as string) || null
  const { data: primaryBank } = bankAccountIdParam
    ? await supabase.from('bank_accounts').select('id, gl_account_code, current_balance').eq('id', bankAccountIdParam).maybeSingle()
    : await supabase.from('bank_accounts').select('id, gl_account_code, current_balance').eq('is_primary', true).eq('status', 'active').maybeSingle()

  const bankGl = primaryBank?.gl_account_code ?? '3000'

  // Bank cache: a repayment received increases the bank balance. The GL Dr Bank
  // is posted below, but the cached current_balance must move too (it's not
  // trigger-maintained), else the dashboard/settings bank figure understates.
  // Via bump_bank_balance RPC (mig 20260610000000): the old direct
  // bank_accounts.update was silently blocked by RLS for Finance (UPDATE policy
  // is principal-only, PostgREST returns success with 0 rows) — cache drifted
  // vs GL on every Finance-recorded repayment.
  if (primaryBank?.id) {
    const { error: bumpErr } = await supabase.rpc('bump_bank_balance', {
      p_bank_account_id: primaryBank.id,
      p_delta: amount,
    })
    if (bumpErr) {
      throw new Error(`Repayment recorded but bank balance update failed: ${bumpErr.message}`)
    }
  }
  // Mig 238 unified COA + 2026-05-15 fix:
  //   - principal → <borrower's leaf under 3020 Loans Receivable>. The user
  //     split 3020 into a header + per-borrower leaves (`3051 Amount Due
  //     From - <code>`); posting directly to 3020 silently dropped from
  //     Trial Balance and tripped mig 256's header-rejection trigger.
  //     resolveLoansReceivableLeaf() does the per-borrower lookup.
  //   - 7010 Penalty Income (other_income)
  //   - 5027 Interest Income — Loans (revenue) ← interest + netting.
  //     User 2026-06-15: interest income belongs in Revenue (it's the core
  //     lending revenue), so it was reclassed 7000 → 5027 (revenue range).
  //   - interest may instead draw down the borrower's Interest-in-Suspense
  //     leaf (3060 family) when the caller says so — the 300k back-to-back
  //     carved the whole term's interest out of the receivable up front, so
  //     crediting 5027 again would double-count the income (user 2026-07-31).
  //     Only 5027 or a 3060 child is accepted; anything else is rejected
  //     rather than silently posted somewhere odd.
  let interestCredit = INTEREST_INCOME_CODE
  const requestedInterestAccount = ((formData.get('interest_account_code') as string) ?? '').trim()
  if (paymentType === 'interest' && requestedInterestAccount && requestedInterestAccount !== INTEREST_INCOME_CODE) {
    const { data: acc } = await supabase
      .from('chart_of_accounts')
      .select('code, parent_code, is_active')
      .eq('code', requestedInterestAccount)
      .maybeSingle()
    if (!acc?.is_active || acc.parent_code !== INTEREST_SUSPENSE_PARENT) {
      throw new Error(
        `利息科目 ${requestedInterestAccount} 不可用 — 只能选 ${INTEREST_INCOME_CODE} 利息收入,或 ${INTEREST_SUSPENSE_PARENT} 底下的利息挂账科目`,
      )
    }
    interestCredit = acc.code
  }
  const creditAccount =
    paymentType === 'principal' ? await resolveLoansReceivableLeaf(supabase, loanId) :
    paymentType === 'penalty'   ? '7010' :
                                  interestCredit   // interest + netting

  try {
    await postJournalEntry(supabase, {
      transactionDate: paymentDate,
      description: `Loan ${paymentType} repayment — ${loanId}`,
      referenceType: 'repayment',
      referenceId: loanId,
      createdBy: user.id,
      lines: [
        { accountCode: bankGl, debit: amount, description: `Bank — ${paymentType} received` },
        { accountCode: creditAccount, credit: amount, description: `${paymentType} repayment offset` },
      ],
    })
  } catch (jeErr) {
    const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
    throw new Error(`Repayment recorded but JE post failed: ${msg}`)
  }

  revalidatePath(`/fund-out/${loanId}`)
  revalidatePath('/fund-out')
  revalidatePath('/dashboard')
}

// ─── Record a loan repayment RECEIVED, from the receive (收款) form ──────────
// Thin wrapper so the unified receive form can record an incoming loan
// repayment (sub → HV) with a principal / interest / penalty split, reusing the
// proven recordRepayment logic (one call per non-zero type). Mirrors the
// outgoing payment form's "this is a loan repayment" option.
export async function recordLoanRepaymentReceived(formData: FormData) {
  await requireActionOn('/payments/new', 'treasury', 'create')
  const loanId = await recordReceivedParts(formData)
  redirect(`/fund-out/${loanId}`)
}

/**
 * Loan repayment received, Receipt's dialog (2026-10-14, the Finance revamp v2 —
 * D09): the same parts the form page records (recordReceivedParts), answered in
 * words — the dialog stays on Receipt. Asked on Receipt's page; each part's own
 * record asks Fund OUT's, as the form page's always has.
 */
export async function recordLoanRepaymentFromDialog(formData: FormData): Promise<{ ok: true; total: number } | { ok: false; reason: string }> {
  await requireActionOn('/receipts', 'treasury', 'create')
  try {
    await recordReceivedParts(formData)
    const total = ['repayment_principal', 'repayment_interest', 'repayment_penalty'].reduce((n, k) => n + (parseFloat((formData.get(k) as string) ?? '0') || 0), 0)
    return { ok: true, total: Math.round(total * 100) / 100 }
  } catch (err) {
    const digest = (err as { digest?: string })?.digest
    if ((typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) || (err instanceof Error && err.message.includes('NEXT_REDIRECT'))) throw err
    return { ok: false, reason: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/** A received repayment's parts, each its own record — interest and penalty first, the principal last. */
async function recordReceivedParts(formData: FormData): Promise<string> {
  const loanId = (formData.get('loan_id') as string) ?? ''
  const paymentDate = (formData.get('payment_date') as string) ?? ''
  const bankAccountId = (formData.get('bank_account_id') as string) || ''
  const notes = (formData.get('notes') as string) || ''
  if (!loanId) throw new Error('Loan is required')
  if (!paymentDate) throw new Error('Payment date is required')

  // ORDER MATTERS: record interest + penalty BEFORE principal. A principal
  // repayment that clears the outstanding balance flips the loan to
  // `fully_repaid` (DB trigger), after which recordRepayment's active-loan
  // guard rejects any further repayment. So principal MUST be last — otherwise
  // a combined principal+interest payment that fully settles the loan records
  // the principal, then throws "Cannot record repayment on fully_repaid loan"
  // on the interest leg, leaving a half-posted transaction.
  const parts: Array<[PaymentType, number]> = [
    ['interest', parseFloat((formData.get('repayment_interest') as string) ?? '0') || 0],
    ['penalty', parseFloat((formData.get('repayment_penalty') as string) ?? '0') || 0],
    ['principal', parseFloat((formData.get('repayment_principal') as string) ?? '0') || 0],
  ]
  const nonZero = parts.filter(([, amt]) => amt > 0)
  if (nonZero.length === 0) throw new Error('Enter at least one of principal / interest / penalty')

  for (const [type, amt] of nonZero) {
    const fd = new FormData()
    fd.set('loan_id', loanId)
    fd.set('payment_type', type)
    fd.set('amount', String(amt))
    fd.set('payment_date', paymentDate)
    if (bankAccountId) fd.set('bank_account_id', bankAccountId)
    if (notes) fd.set('notes', notes)
    // Interest may be routed to the borrower's Interest-in-Suspense leaf.
    if (type === 'interest') {
      const acct = ((formData.get('interest_account_code') as string) ?? '').trim()
      if (acct) fd.set('interest_account_code', acct)
    }
    await recordRepayment(fd)
  }

  revalidatePath('/payments')
  revalidatePath('/receipts')
  revalidatePath('/fund-out')
  revalidatePath('/dashboard')
  return loanId
}

// ─── Repayment start (Finance self-service, mig 20260724050000) ─────────────
// The agreed first instalment for the schedules. NULL = default (the month
// after disbursement, on its day). Display/schedule metadata only.
// 2026-10-12 (user: 现在只能选月份不能选日期): a date — the first instalment's,
// every later one on its day. The RPC keeps it as repayment_start_date with
// its month as the start month (p_month carries the whole date).
export async function setLoanRepaymentStart(
  id: string,
  date: string
): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-out', 'treasury', 'edit')
  const supabase = await createClient()

  if (!id) return { error: 'Loan id is required' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dayjs(date).isValid()) return { error: 'Pick a date' }

  const { data: loan } = await supabase.from('loans').select('disbursement_date').eq('id', id).maybeSingle()
  if (!loan) return { error: 'Loan not found' }
  const disbursed = (loan as { disbursement_date: string | null }).disbursement_date
  if (disbursed && date < disbursed) {
    return { error: `The repayment cannot start before the disbursement, ${dayjs(disbursed).format('D MMM YYYY')}` }
  }

  const { error } = await supabase.rpc('set_loan_repayment_start' as never, {
    p_loan_id: id,
    p_month: date,
  } as never)
  if (error) return { error: `Could not save: ${error.message}` }

  revalidatePath(`/fund-out/${id}`)
  revalidatePath('/fund-out')
  revalidatePath('/dashboard')
  revalidatePath('/reports/loan-aging')
  revalidatePath('/repayment-schedule')
  return undefined
}

// ─── 最低还息单 toggle (user 2026-09-04) ─────────────────────────────────────
// Flagged = "本金可以慢慢还，但每月利息一定要还". Drives the minimum-interest
// tracking on /repayment-schedule and the note on the company statement.
// Display/tracking metadata only — no GL impact.
export async function setLoanMinPayInterest(
  id: string,
  value: boolean
): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-out', 'treasury', 'edit')
  const supabase = await createClient()

  if (!id) return { error: 'Loan id is required' }

  const { error } = await supabase.rpc('set_loan_min_pay_interest' as never, {
    p_loan_id: id,
    p_value: value,
  } as never)
  if (error) return { error: `保存失败: ${error.message}` }

  revalidatePath(`/fund-out/${id}`)
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports/company-statement')
  return undefined
}

// ─── Void a recorded repayment (2026-08-20) ──────────────────────────────────
// One atomic SECURITY DEFINER RPC (mig 20260819050000) reverses everything a
// mis-keyed recordRepayment did: mirror JE (both legs flagged is_reversed so
// reports drop the pair), bank-cache bump-down, venture_pool VOID counter-row
// for principal, repayments row deleted, fully_repaid un-flipped when needed.
// Built after a Hookka repayment landed on the wrong loan — void here, then
// re-record on the right one.
export async function voidRepayment(formData: FormData): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-out', 'treasury', 'void')
  const supabase = await createClient()

  const repaymentId = (formData.get('repayment_id') as string) ?? ''
  const loanId = (formData.get('loan_id') as string) ?? ''
  if (!repaymentId) return { error: 'Repayment id is required' }

  const { error } = await supabase.rpc('void_loan_repayment' as never, {
    p_repayment_id: repaymentId,
  } as never)
  if (error) return { error: `撤销失败: ${error.message}` }

  if (loanId) revalidatePath(`/fund-out/${loanId}`)
  revalidatePath('/fund-out')
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports/loan-aging')
  revalidatePath('/dashboard')
  return undefined
}

// ─── Amend a recorded repayment's AMOUNT (2026-09-03) ────────────────────────
// User: "不能直接点开receipt 的单去edit?" — in-place fix for a mis-keyed
// amount, without voiding the whole thing. One atomic RPC adjusts the
// repayments row, its GL entry (audit note stamped), the bank cache delta,
// venture_pool counter + loan status for principal. Ambiguous cases (no or
// several matching JEs) error out and the void + re-record path applies.
export async function amendRepayment(
  formData: FormData,
): Promise<{ error?: string; old?: number; newAmount?: number }> {
  await requireActionOn(['/payments', '/receipts'], 'treasury', 'edit')
  const supabase = await createClient()

  const repaymentId = ((formData.get('repayment_id') as string) ?? '').trim()
  const newAmount = parseFloat((formData.get('new_amount') as string) ?? '')
  const reason = ((formData.get('reason') as string) ?? '').trim()
  if (!repaymentId) return { error: 'Repayment id is required' }
  if (!Number.isFinite(newAmount) || newAmount <= 0) return { error: '金额必须大于 0' }
  if (!reason) return { error: '写一句原因(会记进 GL 的审计注记)' }

  const { data, error } = await supabase.rpc('amend_loan_repayment' as never, {
    p_repayment_id: repaymentId,
    p_new_amount: newAmount,
    p_reason: reason,
  } as never)
  if (error) return { error: error.message }

  const res = (data ?? {}) as { old?: number; new?: number }
  revalidatePath('/receipts')
  revalidatePath('/fund-out')
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports')
  revalidatePath('/dashboard')
  return { old: Number(res.old ?? 0), newAmount: Number(res.new ?? newAmount) }
}

// ─── Amend a recorded repayment's DATE (2026-10-02) ──────────────────────────
// User: "这个日期我录错了怎么办？能自己改吗？" — the same in-place fix as the
// amount, for the day. One atomic RPC moves the repayments row and its one GL
// entry (transaction date + period, audit note stamped); the amount, the bank
// and the pool are not touched. It refuses a closed month, a future date and a
// repayment already matched in a bank reconciliation.
export async function amendRepaymentDate(
  formData: FormData,
): Promise<{ error?: string; old?: string; newDate?: string }> {
  await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'edit')
  const supabase = await createClient()

  const repaymentId = ((formData.get('id') as string) ?? '').trim()
  const newDate = ((formData.get('new_date') as string) ?? '').trim()
  const reason = ((formData.get('reason') as string) ?? '').trim()
  if (!repaymentId) return { error: 'Repayment id is required' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { error: '选一个日期' }
  if (!reason) return { error: '写一句原因(会留在记录里)' }

  const { data, error } = await supabase.rpc('amend_loan_repayment_date' as never, {
    p_repayment_id: repaymentId,
    p_new_date: newDate,
    p_reason: reason,
  } as never)
  if (error) return { error: error.message }

  const res = (data ?? {}) as { old?: string; new?: string }
  revalidatePath('/receipts')
  revalidatePath('/fund-out')
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports')
  revalidatePath('/dashboard')
  return { old: res.old, newDate: res.new ?? newDate }
}

// ─── Amend an active loan (Principal — self-service, direct apply) ────────────
// Principal is the top approval authority, so edits apply immediately via the
// amend_loan SECURITY DEFINER RPC (audited by loans.updated_at). Only the
// fields the form sends are changed. Finance-initiated edits that route through
// the approval queue are a separate follow-up.
export async function amendLoan(formData: FormData): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-out', 'treasury', 'approve')
  const supabase = await createClient()

  const loanId = (formData.get('loan_id') as string) ?? ''
  if (!loanId) return { error: 'Loan id is required' }

  const ratePctRaw = (formData.get('effective_rate_percent') as string) ?? ''
  const tenureRaw = (formData.get('tenure_months') as string) ?? ''
  const disbursementDate = (formData.get('disbursement_date') as string) || null
  const repaymentTerms = (formData.get('repayment_terms') as string) ?? ''
  const compound = formData.get('compound_interest') === 'on'

  const payload: Record<string, Json> = { compound_interest: compound }

  if (ratePctRaw.trim() !== '') {
    const ratePct = parseFloat(ratePctRaw)
    if (isNaN(ratePct) || ratePct < 0 || ratePct >= 100) return { error: '利率必须在 0–100% 之间' }
    payload.effective_rate = Math.round((ratePct / 100) * 1e6) / 1e6
  }
  if (tenureRaw.trim() !== '') {
    const tenure = parseInt(tenureRaw, 10)
    if (isNaN(tenure) || tenure < 1 || tenure > 120) return { error: '期数必须在 1–120 之间' }
    payload.tenure_months = tenure
  }
  if (disbursementDate) payload.disbursement_date = disbursementDate
  if (repaymentTerms.trim()) payload.repayment_terms = repaymentTerms.trim()

  const { error } = await supabase.rpc('amend_loan', { p_loan_id: loanId, p_payload: payload })
  if (error) return { error: `修改失败: ${error.message}` }

  revalidatePath(`/fund-out/${loanId}`)
  revalidatePath('/fund-out')
  revalidatePath('/repayment-schedule')
  revalidatePath('/dashboard')
  redirect(`/fund-out/${loanId}`)
}

// ─── 「从某月起生效」 (user 2026-09-21) ────────────────────────────────────────
// Principal-only like amendLoan, but the months before the chosen one keep
// their old terms (treasury_terms_history + lib/treasury-terms).
export async function amendLoanFrom(formData: FormData): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-out', 'treasury', 'approve')
  const supabase = await createClient()

  const loanId = (formData.get('loan_id') as string) ?? ''
  if (!loanId) return { error: 'Loan id is required' }
  const fromYM = ((formData.get('effective_from') as string) ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(fromYM)) return { error: '请选生效月' }

  const ratePctRaw = ((formData.get('effective_rate_percent') as string) ?? '').trim()
  let rate: number | null = null
  if (ratePctRaw !== '') {
    const ratePct = parseFloat(ratePctRaw)
    if (isNaN(ratePct) || ratePct < 0 || ratePct >= 100) return { error: '利率必须在 0–100% 之间' }
    rate = Math.round((ratePct / 100) * 1e6) / 1e6
  }
  const remainingRaw = ((formData.get('remaining_months') as string) ?? '').trim()
  let remaining: number | null = null
  if (remainingRaw !== '') {
    const n = parseInt(remainingRaw, 10)
    if (isNaN(n) || n < 1 || n > 120) return { error: '剩余期数必须在 1–120,或留空保持原到期月' }
    remaining = n
  }
  const compound = formData.get('compound_interest') === 'on'
  const reason = ((formData.get('reason') as string) ?? '').trim()
  const noFixedTerm = formData.get('no_fixed_term') === 'on'

  const { error } = await supabase.rpc('amend_loan_from', {
    p_loan_id: loanId,
    p_effective_from: `${fromYM}-01`,
    p_effective_rate: rate,
    p_remaining_months: noFixedTerm ? null : remaining,
    p_compound_interest: compound,
    p_reason: reason || null,
    p_no_fixed_term: noFixedTerm,
  })
  if (error) return { error: `修改失败: ${error.message}` }

  revalidatePath(`/fund-out/${loanId}`)
  revalidatePath('/fund-out')
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports/company-statement')
  revalidatePath('/reports/loan-aging')
  revalidatePath('/dashboard')
  redirect(`/fund-out/${loanId}`)
}

// ─── 资金来源 (Finance self-service, mig 20260722000000) ─────────────────────
// Unlike amendLoan (Principal-only, whole-terms edit), this may be called by
// Finance too: the set_loan_funding_source RPC rewrites ONLY the
// `· 资金来源: X` segment inside repayment_terms — rates, tenure, dates and
// the rest of the terms text are untouchable through this path. Empty value
// removes the segment (badge disappears).
export async function setLoanFundingSource(
  formData: FormData
): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-out', 'treasury', 'edit')
  const supabase = await createClient()

  const loanId = (formData.get('loan_id') as string) ?? ''
  if (!loanId) return { error: 'Loan id is required' }
  // `·` is the segment delimiter the badge parser splits on — strip it here
  // too so what the user sees submitted matches what the RPC stores.
  const source = ((formData.get('funding_source') as string) ?? '')
    .replace(/[·\r\n]+/g, ' ')
    .trim()
  if (source.length > 60) return { error: '资金来源最多 60 个字' }

  const { error } = await supabase.rpc('set_loan_funding_source' as never, {
    p_loan_id: loanId,
    p_source: source,
  } as never)
  if (error) return { error: `保存失败: ${error.message}` }

  revalidatePath(`/fund-out/${loanId}`)
  revalidatePath('/fund-out')
  revalidatePath('/repayment-schedule')
  return undefined
}

// ─── Cancel loan (Finance) ───────────────────────────────────────────────────
// Two paths depending on current loan status:
//  - pending_approval → cancel directly via cancel_loan_and_approval (mig 17/107)
//  - active           → file a loan_cancel approval_request (mig 226). Principal
//                        approves, then approveRequest fires execute_loan_cancel
//                        and reverses the bank/venture-pool/JE side.

export async function cancelLoan(formData: FormData) {
  await requireActionOn('/fund-out', 'treasury', 'void')
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  const reason = ((formData.get('reason') as string) ?? '').trim() || null
  if (!id) throw new Error('Loan id is required')

  const { data: loan, error: loanErr } = await supabase
    .from('loans')
    .select('status')
    .eq('id', id)
    .single()
  if (loanErr || !loan) throw new Error('Loan not found')

  if (loan.status === 'pending_approval') {
    const { error: rpcErr } = await supabase.rpc('cancel_loan_and_approval', {
      p_loan_id: id,
    })
    if (rpcErr) throw new Error(`Failed to cancel loan: ${rpcErr.message}`)
    revalidatePath('/fund-out')
    revalidatePath('/approvals')
    revalidatePath('/dashboard')
    redirect('/fund-out')
  }

  if (loan.status === 'active') {
    // Item 3: active-loan cancellation requires Principal approval. RPC files
    // the approval_request and refuses if any repayment is recorded.
    const { error: reqErr } = await supabase.rpc('request_loan_cancel', {
      p_loan_id: id,
      p_reason: reason ?? undefined,
    })
    if (reqErr) {
      throw new Error(`Failed to file cancellation request: ${reqErr.message}`)
    }
    revalidatePath(`/fund-out/${id}`)
    revalidatePath('/approvals')
    return
  }

  throw new Error(`Cannot cancel a ${loan.status} loan`)
}

// ─── List loans payable via debit voucher (Finance) — Phase 7 Step 12b ──────
//
// Active loans with outstanding > 0 + enriched with current-period overdue
// flag. Used by the "this is a loan repayment" checkbox in the voucher form.

export async function listPayableLoans() {
  await requirePermission('treasury')
  const supabase = await createClient()

  const [{ data: loans }, { data: outstanding }, { data: overdues }, { data: companies }] =
    await Promise.all([
      supabase
        .from('loans')
        .select('id, company_id, principal, effective_rate, status, disbursement_date')
        .eq('status', 'active'),
      supabase.from('loan_outstanding').select('loan_id, outstanding'),
      supabase
        .from('overdue_records')
        .select('loan_id, period_month, is_overdue, status')
        .eq('status', 'pending'),
      supabase.from('companies').select('id, name, short_code'),
    ])

  const outstandingMap = new Map(
    (outstanding ?? []).map((o) => [o.loan_id, Number(o.outstanding)])
  )
  const overdueMap = new Map<string, { period_month: string; count: number }>()
  for (const o of overdues ?? []) {
    const prev = overdueMap.get(o.loan_id)
    if (!prev) {
      overdueMap.set(o.loan_id, { period_month: o.period_month, count: 1 })
    } else {
      prev.count += 1
      if (o.period_month > prev.period_month) prev.period_month = o.period_month
    }
  }
  const companyMap = new Map((companies ?? []).map((c) => [c.id, c.name as string]))

  return (loans ?? [])
    .map((l) => ({
      id: l.id,
      company_id: l.company_id,
      company_name: companyMap.get(l.company_id) ?? '—',
      principal: Number(l.principal),
      effective_rate: Number(l.effective_rate),
      outstanding: outstandingMap.get(l.id) ?? Number(l.principal),
      overdue_count: overdueMap.get(l.id)?.count ?? 0,
      latest_overdue_period: overdueMap.get(l.id)?.period_month ?? null,
    }))
    .filter((l) => l.outstanding > 0)
    .sort((a, b) => b.overdue_count - a.overdue_count)
}

// ─── Export loan portfolio as CSV ─────────────────────────────────────────────

export async function exportLoansCSV(): Promise<string> {
  await requireActionOn('/fund-out', 'treasury', 'export')
  const supabase = await createClient()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, companies(name, short_code)')
    .order('status')
    .order('disbursement_date', { ascending: false })

  if (!loans || loans.length === 0) throw new Error('No loans to export')

  const header = 'Company,Short Code,Principal (RM),Base Rate (%/mo),Risk Premium (%/mo),Effective Rate (%/mo),Disbursement Date,Status'
  const rows = loans.map(l => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const co = (l as any).companies
    return [
      `"${co?.name ?? ''}"`,
      co?.short_code ?? '',
      Number(l.principal).toFixed(2),
      (Number(l.base_rate) * 100).toFixed(3),
      (Number(l.risk_premium) * 100).toFixed(3),
      (Number(l.effective_rate) * 100).toFixed(3),
      l.disbursement_date ?? '',
      l.status,
    ].join(',')
  })

  return [header, ...rows].join('\n')
}
