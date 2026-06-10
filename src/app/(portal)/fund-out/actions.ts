'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { postJournalEntry } from '@/lib/journal'
import { validateDisbursementAccount } from '@/lib/loan-disbursement'
import { resolveLoansReceivableLeaf } from '@/lib/loans-coa'
import type { PaymentType } from '@/types'
import type { Json } from '@/lib/supabase/database.types'

// ─── Create new loan (Finance) ────────────────────────────────────────────────
//
// Returns `{ error }` for validation/RPC failures so the message survives
// Next.js 15's production error redaction. Only `redirect()` (which throws
// NEXT_REDIRECT internally) propagates as a throw.

export type CreateLoanResult = { error: string } | undefined

export async function createLoan(formData: FormData): Promise<CreateLoanResult> {
  await requireRole(['finance'])
  const supabase = await createClient()

  const companyId = (formData.get('company_id') as string) ?? ''
  const principal = parseFloat((formData.get('principal') as string) ?? '0')
  const tenureMonths = parseInt((formData.get('tenure_months') as string) ?? '', 10)
  const repaymentTerms = (formData.get('repayment_terms') as string) ?? ''
  const loanStartDate = (formData.get('loan_start_date') as string) ?? ''
  const disbursementAccountCode = ((formData.get('disbursement_account_code') as string) ?? '').trim()

  if (!companyId) return { error: 'Company is required' }
  if (isNaN(principal) || principal <= 0) {
    return { error: 'Principal must be greater than 0' }
  }
  if (principal > 100_000_000) {
    return { error: 'Principal exceeds RM 100M ceiling' }
  }
  if (isNaN(tenureMonths) || tenureMonths < 1 || tenureMonths > 12) {
    return { error: 'Tenure must be between 1 and 12 months' }
  }
  if (!loanStartDate || !dayjs(loanStartDate).isValid()) {
    throw new Error('Loan start date is required')
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
    .lte('effective_from', dayjs().format('YYYY-MM-DD'))
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
      p_tenure_months: tenureMonths,
      p_repayment_terms: repaymentTerms || undefined,
      p_company_name: company.name,
      p_disbursement_date: loanStartDate,
      p_disbursement_account_code: disbursementAccountCode,
    }
  )

  if (rpcError || !loanId) {
    return { error: `Failed to create loan: ${rpcError?.message ?? 'unknown'}` }
  }

  revalidatePath('/fund-out')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  redirect(`/fund-out/${loanId}`)
}

// ─── Record repayment (Finance) ───────────────────────────────────────────────

export async function recordRepayment(formData: FormData) {
  const user = await requireRole(['finance'])
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
  if (dayjs(paymentDate).isAfter(dayjs(), 'day')) {
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
  //   - 7000 Interest Income — Loans (other_income)  ← interest + netting
  const creditAccount =
    paymentType === 'principal' ? await resolveLoansReceivableLeaf(supabase, loanId) :
    paymentType === 'penalty'   ? '7010' :
                                  '7000'   // interest + netting

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
  await requireRole(['finance'])
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
    await recordRepayment(fd)
  }

  revalidatePath('/payments')
  revalidatePath('/fund-out')
  revalidatePath('/dashboard')
  redirect(`/fund-out/${loanId}`)
}

// ─── Amend an active loan (Principal — self-service, direct apply) ────────────
// Principal is the top approval authority, so edits apply immediately via the
// amend_loan SECURITY DEFINER RPC (audited by loans.updated_at). Only the
// fields the form sends are changed. Finance-initiated edits that route through
// the approval queue are a separate follow-up.
export async function amendLoan(formData: FormData): Promise<{ error: string } | undefined> {
  await requireRole(['principal'])
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

// ─── Cancel loan (Finance) ───────────────────────────────────────────────────
// Two paths depending on current loan status:
//  - pending_approval → cancel directly via cancel_loan_and_approval (mig 17/107)
//  - active           → file a loan_cancel approval_request (mig 226). Principal
//                        approves, then approveRequest fires execute_loan_cancel
//                        and reverses the bank/venture-pool/JE side.

export async function cancelLoan(formData: FormData) {
  await requireRole(['finance'])
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
  await requireRole(['finance', 'principal'])
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
  await requireRole(['principal', 'finance'])
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
