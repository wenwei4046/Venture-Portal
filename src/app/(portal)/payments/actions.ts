'use server'

import { revalidatePath } from 'next/cache'
import { resolveArGlCode } from '@/lib/ar-accounts'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { officeDate } from '@/lib/office-clock'
import { officeTime } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requireApproverOn, requirePermission } from '@/lib/auth'
import { decision } from '@/lib/approval-domains'
import { canSeePayrollPayouts } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import { postJournalEntry, r2 } from '@/lib/journal'
import { adjustPool } from '@/lib/voucher-paid-helpers'
import { ACCOUNT_TYPES, type AccountType } from '@/lib/coa'
import { payerExpenseSplits, type NatureSplit } from '@/lib/inter-billing-nature'
import { segmentForBillingMode, lineAttributions, type SegmentAttribution } from '@/lib/invoice-settlement'

// Nature splits for the inter-billing MIRROR rows (user 2026-07-24) — same
// mapping billing/actions uses for the issue JE, so the dept-pool P&L and the
// GL agree on what the charge was (rent / utilities / salary vs lumped 905x).
async function interBillingNatureSplitsForMirror(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  invoiceTotal: number,
  fallbackCode: string,
): Promise<NatureSplit[]> {
  const [{ data: hdr }, { data: ilines }] = await Promise.all([
    supabase.from('invoices').select('category_code').eq('id', invoiceId).maybeSingle(),
    supabase.from('invoice_lines').select('category_code, amount').eq('invoice_id', invoiceId),
  ])
  const headerCategory = (hdr?.category_code as string | null) ?? null
  const cats = [
    ...new Set(
      [...(ilines ?? []).map((l) => l.category_code as string | null), headerCategory].filter(
        (c): c is string => !!c,
      ),
    ),
  ]
  const { data: coa } = cats.length
    ? await supabase.from('chart_of_accounts').select('code, type').in('code', cats)
    : { data: [] }
  const typeMap = new Map((coa ?? []).map((c) => [c.code as string, c.type as string]))
  const splits = payerExpenseSplits(
    (ilines ?? []).map((l) => ({ category_code: (l.category_code as string | null) ?? null, amount: Number(l.amount) })),
    invoiceTotal,
    headerCategory,
    (code) => typeMap.get(code),
    fallbackCode,
  )
  const sum = r2(splits.reduce((s, x) => s + x.amount, 0))
  // Mirror rows must tie to the voucher amount; fall back to one lumped row
  // rather than fail the settlement over a legacy rounding quirk.
  return Math.abs(sum - invoiceTotal) > 0.005
    ? [{ accountCode: fallbackCode, amount: r2(invoiceTotal) }]
    : splits
}

// ─── Create payment voucher (Finance) ────────────────────────────────────────

async function createPaymentVoucherInner(formData: FormData) {
  const user = await requireActionOn('/payments', 'treasury', 'create')
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
  // AR is per customer since 2026-09-29, so the receivable leg resolves from
  // the invoice being settled (else the payee) instead of a fixed 3030.
  const arCode = await resolveArGlCode(supabase, {
    invoiceId,
    companyId: payeeCompanyId,
    freetext: payeeName || null,
  })
  const accountCode = rawAccountCode ?? (voucherType === 'billing_payment' ? arCode : null)
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
  // Consolidated payroll invoices carry per-line gl_segments; when set, the
  // credit branch splits the pool credit + GL per department.
  let consolidatedGroups: SegmentAttribution[] | null = null
  // Partial payments (user 2026-08-11): an invoice flips to paid only once
  // its receipts cover the full total. Defaults true so non-invoice paths
  // keep their old behaviour.
  let invoiceFullyPaid = true
  if (voucherType === 'billing_payment' && invoiceId) {
    const { data: openInv } = await supabase
      .from('invoices')
      .select('id, status, billing_mode, total_amount')
      .eq('id', invoiceId)
      .in('status', ['issued', 'draft'])
      .maybeSingle()
    if (!openInv) {
      throw new Error('Invoice is not open for payment (already paid, via netting, or does not exist)')
    }
    settleBillingMode = (openInv as { billing_mode: string | null }).billing_mode ?? null
    // Consolidated payroll invoices carry per-line gl_segments. Load them and
    // group per department so the credit branch below splits the receiving
    // pool credit AND the GL per segment (HR / Finance / Director Office),
    // instead of collapsing everything into one venture/corporate pool.
    if (settleBillingMode === 'payroll_consolidated') {
      const { data: consolLines } = await supabase
        .from('invoice_lines')
        .select('amount, segment')
        .eq('invoice_id', invoiceId)
      const groups = lineAttributions(
        (consolLines ?? []).map((l) => ({ amount: Number(l.amount), segment: (l.segment as string | null) ?? null })),
        settleBillingMode,
      )
      if (groups.length === 0) {
        throw new Error('Consolidated payroll invoice has no lines to settle')
      }
      const groupSum = Math.round(groups.reduce((s, g) => s + g.amount, 0) * 100) / 100
      if (Math.abs(groupSum - amount) > 0.01) {
        throw new Error(
          `Consolidated payroll invoices must be settled in full (invoice lines total RM ${groupSum.toFixed(2)}, voucher amount RM ${amount.toFixed(2)})`,
        )
      }
      consolidatedGroups = groups
    }
    // Partial payments: receipts accumulate against the invoice until the
    // total is covered (replaces the old one-voucher-per-invoice block).
    const invoiceTotal = Math.round(Number((openInv as { total_amount?: number | string }).total_amount ?? 0) * 100) / 100
    const { data: priorReceipts } = await supabase
      .from('payment_vouchers')
      .select('amount')
      .eq('invoice_id', invoiceId)
      .eq('direction', 'credit')
      .neq('status', 'voided')
    const priorPaid =
      Math.round(
        ((priorReceipts ?? []) as Array<{ amount: number }>).reduce(
          (s, r) => s + Number(r.amount),
          0,
        ) * 100,
      ) / 100
    if (priorPaid + amount > invoiceTotal + 0.005) {
      throw new Error(
        `Receipt exceeds the invoice balance: total RM ${invoiceTotal.toFixed(2)}, already received RM ${priorPaid.toFixed(2)}, this receipt RM ${amount.toFixed(2)}`,
      )
    }
    invoiceFullyPaid = priorPaid + amount >= invoiceTotal - 0.005
    if (!invoiceFullyPaid && settleBillingMode === 'payroll_consolidated') {
      throw new Error('Consolidated payroll invoices must be settled in full')
    }
  }

  // Generate voucher number. Debit (outgoing money) → HV-PV-YYYYMM-NNNN
  // (Payment Voucher). Credit (incoming money) → HV-OR-YYYYMM-NNNN
  // (Official Receipt). mig 252 renamed historical credit rows to match.
  const period = officeTime().format('YYYYMM') // the office's month, not UTC's
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
  const todayStr = officeDate()
  // mig 276 / single-settle date: honor a user-chosen payment date when valid,
  // else fall back to today. Drives both payment_date and the settlement JE date.
  // Today means the OFFICE's today: Vercel runs in UTC, so for the eight hours
  // after midnight in KL a UTC date would book the voucher a day early.
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

  // Every line checked BEFORE the voucher is written (2026-10-14): a refusal
  // after the insert left a voucher with no lines behind (a receipt already
  // paid). Debit: the lines, their accounts, their sum. Credit: its account.
  const rows: {
    pool: string
    amount: number
    account_code: string
    override_account_type: AccountType | null
    override_gl_account_code: string | null
    override_reason: string | null
  }[] = []
  if (direction === 'debit') {
    const rowCount = parseInt((formData.get('source_rows_count') as string) ?? '0', 10)
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
    }
  } else if (direction === 'credit' && (targetPool || consolidatedGroups) && !accountCode) {
    throw new Error('Account is required on inbound (credit) vouchers')
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
      // Stored for DEBIT drafts too (2026-06-11): approve_single_voucher /
      // approve_voucher_batch[_partial] now post the GL on this date, so the
      // P&L reflects Finance's stated payment date, not Principal's approval day.
      payment_date: paymentDateStr,
      ...(isAutoComplete ? {
        approved_by: user.id,
        approved_at: nowIso,
        executed_by: user.id,
        executed_at: nowIso,
      } : {}),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create voucher: ${error.message}`)

  // Mig 205: every voucher writes ≥1 payment_voucher_sources row.
  // DEBIT: user-entered rows (pool + category + amount), sum must match voucher total.
  // CREDIT: synthetic single row (pool = target_pool, amount = voucher amount).
  if (direction === 'debit') {
    if (rows.length > 0) {
      // Its answer was not read until 2026-10-22: lines the database refused
      // left a draft with no lines, and the form said it was saved.
      const { error: linesErr } = await supabase.from('payment_voucher_sources').insert(
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
      if (linesErr) {
        const voided = await voidHalfMadeVoucher(supabase, data.id)
        throw new Error(`Failed to save the voucher's lines: ${clause(linesErr.message)}. ${voided
          ? `Draft ${voucherNo} was voided — nothing else was written.`
          : `Draft ${voucherNo} is left without lines and could not be voided — void it on its page.`}`)
      }
    }
  } else if (direction === 'credit' && (targetPool || consolidatedGroups)) {
    // Every PV source row must carry an account — reports route lines by the
    // referenced chart_of_accounts.type. A NULL account_code would crash the
    // P&L / Cash Flow render (see src/lib/cfo-reports.ts:gatherPvSources).
    if (!accountCode) {
      throw new Error('Account is required on inbound (credit) vouchers')
    }
    // role defaults to 'primary' at the DB level (mig 254); no need to set
    // it explicitly here. Consolidated payroll: one source row PER department
    // pool so cash-flow attribution matches the dept_pools + GL split; the
    // per-segment amounts sum to the voucher total (trigger-checked).
    const creditRows = consolidatedGroups
      ? consolidatedGroups.map((g) => ({ voucher_id: data.id, pool: g.pool, amount: g.amount, account_code: accountCode }))
      : [{ voucher_id: data.id, pool: targetPool as string, amount, account_code: accountCode }]
    const { error: primaryInsertErr } = await supabase
      .from('payment_voucher_sources')
      .insert(creditRows)
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
        // Fail loud (2026-06-11): if resolution fails, interBilling stays
        // null and the voucher silently falls through to the BANK settlement
        // path — bank cache bumped + Dr bank / Cr 3030 for money that never
        // moved. A netting settle on a dept_pool invoice must resolve or die.
        if (!dept?.name) {
          throw new Error(
            `Netting settle: paying department ${inv.billable_to_department_id} not found for invoice ${invoiceId}`,
          )
        }
        // Convention from mig 253: '9051 Inter-billing — Marketing',
        // '9052 Inter-billing — Finance', etc. Match by suffix so a
        // renamed dept still works as long as the COA row exists.
        const { data: acct } = await supabase
          .from('chart_of_accounts')
          .select('code, name')
          .eq('type', 'expense')
          .ilike('name', `Inter-billing % ${dept.name}`)
          .maybeSingle()
        if (!acct?.code) {
          throw new Error(
            `Netting settle: no active expense account named "Inter-billing — ${dept.name}" in the COA (9051–9055 range)`,
          )
        }
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
    // Consolidated payroll: split the receiving credit across each department's
    // pool (HR / Finance / Director Office) per the invoice lines' segments.
    if (consolidatedGroups) {
      for (const g of consolidatedGroups) {
        await adjustPool(supabase, g.pool, 'in', r2(g.amount), `PV ${voucherNo}: ${description} [${g.segment}]`, user.id, null, nowIso)
      }
    } else if (targetPool) {
      await adjustPool(supabase, targetPool, 'in', r2(amount), `PV ${voucherNo}: ${description}`, user.id, null, nowIso)
    }
    // Venture (Office) cash overlay for dept→Venture inter-billing.
    //
    // When a REAL dept is billed by Venture (billing_mode='venture_attribution',
    // or any mode mapping to VENTURE_POOL) and settles via netting, the paying
    // dept is debited with an inter_billing_out row below, but the receiving
    // credit landed via adjustPool(VENTURE_POOL,'in',…) into the venture_pool
    // TREASURY/accrual ledger — NOT into a cash-page pool. So the Dept Pool →
    // Cash page showed the paying dept −X with no offsetting +X anywhere, and
    // its grand total under-stated the physical bank by X.
    //
    // Fix: ALSO write a dept_pools np_in against the hidden 'Venture Office'
    // pseudo-department (departments.is_internal=true). The Cash page folds
    // this pseudo-dept's ledger balance into its "Venture (Office)" row, so
    // paying dept −X and Venture Office +X net to zero and the total ties to
    // the bank again. The adjustPool(VENTURE_POOL,…) above is KEPT untouched
    // (it feeds the accrual / treasury P&L view). No GL/JE is posted here and
    // the bank cache is not touched — this is a pure cash-page overlay row.
    //
    // GUARD (own-share 2026-07): this overlay is ONLY for "real dept pays
    // Venture". For the REVERSED own-share invoice (Venture Office is the PAYER,
    // depts are the receivers), the paying-side inter_billing_out below already
    // debits Venture Office, and the depts get np_in via consolidatedGroups — so
    // this overlay must NOT fire (it would credit Venture as a receiver and
    // double-book). Suppress when Venture Office is the payer or when the
    // per-segment consolidated credit already ran.
    if (
      interBilling &&
      targetPool === 'venture_pool' &&
      interBilling.payingPool !== 'dept_pool_venture_office' &&
      !consolidatedGroups
    ) {
      const { data: ventureOffice, error: voErr } = await supabase
        .from('departments')
        .select('id')
        .eq('is_internal', true)
        .eq('name', 'Venture Office')
        .maybeSingle()
      // Fail loud — the pseudo-dept must exist (seeded by migration). Silently
      // skipping would recreate the un-offset paying-dept debit this fix targets.
      if (voErr || !ventureOffice?.id) {
        throw new Error(
          `Venture (Office) cash offset: 'Venture Office' pseudo-department not found (PV ${voucherNo})${voErr ? `: ${voErr.message}` : ''}`,
        )
      }
      const ventureOfficeRow = {
        department_id: ventureOffice.id,
        transaction_type: 'np_in',
        amount: r2(amount),
        description: `PV ${voucherNo}: Venture (Office) cash offset — inter-billing ${description}`,
        created_by: user.id,
      }
      const { error: voInsertErr } = await supabase
        .from('dept_pools')
        .insert(ventureOfficeRow as never)
      if (voInsertErr) {
        throw new Error(
          `Venture (Office) cash offset dept_pools insert failed (PV ${voucherNo}): ${voInsertErr.message}`,
        )
      }
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
        if (consolidatedGroups) {
          // Consolidated payroll: one bank-in JE PER department segment, so the
          // per-bank cash slice + AR clearing attribute to HR / Finance /
          // Director Office (not a single collapsed corporate JE).
          for (const g of consolidatedGroups) {
            await postJournalEntry(supabase, {
              transactionDate: paymentDateStr,
              description: `PV ${voucherNo}: ${description} [${g.segment}]`,
              referenceType: 'payment_voucher',
              referenceId: data.id,
              segment: g.segment,
              lines: [
                { accountCode: glAccountCode, debit: r2(g.amount), description: `Bank deposit — ${voucherNo} (${g.segment})` },
                { accountCode: accountCode ?? arCode, credit: r2(g.amount), description: `Payment received — ${payeeName} (${g.segment})` },
              ],
              createdBy: user.id,
            })
          }
        } else {
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
              { accountCode: accountCode ?? arCode, credit: r2(amount), description: `Payment received — ${payeeName}` },
            ],
            createdBy: user.id,
          })
        }
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
      // Mirror rows now split BY NATURE (user 2026-07-24) so the paying
      // dept's P&L shows Office Rental / utilities / salary share instead of
      // one lumped 905x — same mapping the issue JE uses; the dept's 905x
      // remains the fallback for uncategorised lines.
      // role='mirror' (mig 254 column) is not yet in the generated
      // database.types.ts — cast to bypass the stale type. The DB has the
      // CHECK constraint, so an invalid value still fails loud at runtime.
      const natureSplits = invoiceId
        ? await interBillingNatureSplitsForMirror(supabase, invoiceId, r2(amount), interBilling.expenseCode)
        : [{ accountCode: interBilling.expenseCode, amount: r2(amount) }]
      const mirrorRows = natureSplits.map((s) => ({
        voucher_id: data.id,
        pool: interBilling.payingPool,
        amount: s.amount,
        account_code: s.accountCode,
        role: 'mirror',
      }))
      const { error: mirrorInsertErr } = await supabase
        .from('payment_voucher_sources')
        .insert(mirrorRows as never)
      if (mirrorInsertErr) {
        // Fail loud — silent failure here was the 2026-05-14 bug that left
        // inter-billing expense invisible in the paying dept's P&L.
        throw new Error(
          `Failed to insert inter-billing mirror source rows (paying side, pool=${interBilling.payingPool}): ${mirrorInsertErr.message}`,
        )
      }
    }

    // Mark the invoice as settled — but ONLY once receipts cover the full
    // total (partial payments leave it issued with a reduced balance).
    if (invoiceId && invoiceFullyPaid) {
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

  return { id: data.id as string, voucherNo, user }
}

const isRedirect = (err: unknown) => {
  const digest = (err as { digest?: string })?.digest
  return (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) || (err instanceof Error && err.message.includes('NEXT_REDIRECT'))
}

// Wrapper: every throw inside Inner (validation AND mid-flow fail-louds)
// surfaces as a RETURNED message. In production Next.js strips thrown
// server-action error text down to "An error occurred in the Server
// Components render…", which left Finance staring at a useless red box
// instead of e.g. "Description is required" (user hit this 2026-07-24 while
// building the Alliance→HL payroll offset transfer). redirect() still works —
// its NEXT_REDIRECT signal is rethrown untouched.
export async function createPaymentVoucher(
  formData: FormData
): Promise<{ error: string } | undefined> {
  let made: { id: string; voucherNo: string }
  try {
    made = await createPaymentVoucherInner(formData)
  } catch (err) {
    if (isRedirect(err)) throw err
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
  // Settling an invoice used to end on the voucher page, three screens away
  // from the Billing list the work started on (user, 2026-09-29: "当我 settle
  // invoice 后会自动跳去 payment"). A caller that sends return_to gets sent
  // back there with the receipt number to show. Same-origin paths only — an
  // absolute URL or a protocol-relative // would be an open redirect.
  const rawReturn = ((formData.get('return_to') as string) ?? '').trim()
  const returnTo = /^\/[A-Za-z0-9\-_/]*$/.test(rawReturn) ? rawReturn : null
  if (returnTo) {
    revalidatePath(returnTo)
    redirect(`${returnTo}?receipt=${encodeURIComponent(made.voucherNo)}`)
  }
  redirect(`/payments/${made.id}`)
}

/**
 * Create payment, the dialog's (2026-10-14, the Finance revamp v2 — D07): the
 * same voucher the form page makes (createPaymentVoucherInner, every rule of
 * it), but the dialog stays on Payments — so the answer is words, never a
 * redirect: *HV-PV-… saved as draft*, or *… submitted — waiting for
 * Principal* when `submit=1` sends it on at once (the draft stays, said so,
 * if that second step is refused).
 */
export type DialogPaymentResult =
  | { ok: true; id: string; voucherNo: string; submitted: boolean; note?: string }
  | { ok: false; reason: string }

export async function createPaymentFromDialog(formData: FormData): Promise<DialogPaymentResult> {
  try {
    if (formData.get('direction') !== 'debit') return { ok: false, reason: 'Create payment makes a payment voucher.' }
    if (formData.get('return_to')) formData.delete('return_to')
    const made = await createPaymentVoucherInner(formData)
    if (formData.get('submit') !== '1') return { ok: true, id: made.id, voucherNo: made.voucherNo, submitted: false }
    try {
      const supabase = await createClient()
      await submitDraftForApproval(supabase, made.user.id, made.id)
      return { ok: true, id: made.id, voucherNo: made.voucherNo, submitted: true }
    } catch (err) {
      return {
        ok: true,
        id: made.id,
        voucherNo: made.voucherNo,
        submitted: false,
        note: `Saved as a draft — it was not sent for approval: ${err instanceof Error ? err.message : 'unknown error'}`,
      }
    }
  } catch (err) {
    if (isRedirect(err)) throw err
    return { ok: false, reason: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Settle an invoice on its official receipt, the Finance phone app's sheet
 * (2026-10-16, part E4b — what `/payments/new?invoice_id=` makes: a
 * department pool's or a director's invoice settled by netting): the receipt
 * the form page makes (createPaymentVoucherInner, every rule), answered in
 * words — no redirect back to the hub.
 */
export async function settleInvoiceFromSheet(formData: FormData): Promise<DialogPaymentResult> {
  try {
    if (formData.get('direction') !== 'credit' || formData.get('voucher_type') !== 'billing_payment' || !formData.get('invoice_id')) {
      return { ok: false, reason: 'Settle makes the invoice’s official receipt.' }
    }
    if (formData.get('return_to')) formData.delete('return_to')
    const made = await createPaymentVoucherInner(formData)
    return { ok: true, id: made.id, voucherNo: made.voucherNo, submitted: false }
  } catch (err) {
    if (isRedirect(err)) throw err
    return { ok: false, reason: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Create receipt, Receipt's dialog (2026-10-14, the Finance revamp v2 — D09):
 * the receipt the form page makes (`?mode=receipt` — createPaymentVoucherInner,
 * every rule: received at once, bank and GL posted), answered in words — the
 * design's *HV-OR-… received — bank and GL updated*. Asked on Receipt's page
 * first; the voucher's own create asks Payments' as the form page always has.
 */
export async function createReceiptFromDialog(formData: FormData): Promise<DialogPaymentResult> {
  await requireActionOn('/receipts', 'treasury', 'create')
  try {
    if (formData.get('direction') !== 'credit') return { ok: false, reason: 'Create receipt makes an official receipt.' }
    if (formData.get('invoice_id')) return { ok: false, reason: 'An invoice is settled from Invoice.' }
    formData.set('voucher_type', 'receive_payment')
    if (formData.get('return_to')) formData.delete('return_to')
    const made = await createPaymentVoucherInner(formData)
    return { ok: true, id: made.id, voucherNo: made.voucherNo, submitted: false }
  } catch (err) {
    if (isRedirect(err)) throw err
    return { ok: false, reason: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Submit for approval (Finance) ───────────────────────────────────────────

export async function submitForApproval(formData: FormData) {
  const user = await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'create')
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Voucher id is required')

  await submitDraftForApproval(supabase, user.id, id)
}

/** A draft sent to the approvals: its request, then the voucher pending. The caller has asked Treasury · Create. */
async function submitDraftForApproval(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
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
      submitted_by: userId,
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

// ─── Return a PENDING voucher to draft (mig 20260724020000) ─────────────────
// Escape hatch for a submission made with the wrong account (e.g. Principal
// submitted → no_self_approval leaves nobody able to approve OR reject it).
// The RPC flips the voucher back to draft and closes its pending approval
// card; whoever then clicks Submit for approval becomes the new submitter.
// Nothing financial has posted at pending stage, so this is bookkeeping-free.
export async function returnVoucherToDraft(formData: FormData) {
  await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'edit')
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Voucher id is required')

  const { error } = await supabase.rpc('return_voucher_to_draft' as never, {
    p_voucher_id: id,
  } as never)
  if (error) throw new Error(`退回 Draft 失败: ${error.message}`)

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
  const user = await requireApproverOn(['/payments', '/payments/[id]', '/receipts'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  const notes = (formData.get('notes') as string) || null
  if (!id) throw new Error('Voucher id is required')

  // P0-1: route voucher-page approvals through the same atomic RPC as the
  // approvals-queue path. RPC takes approval_id, so look it up first.
  const { data: approvalReq, error: arErr } = await supabase
    .from('approval_requests')
    .select('id, group_id, request_type, submitted_by')
    .eq('reference_id', id)
    .eq('reference_table', 'payment_vouchers')
    .eq('status', 'pending')
    .single()

  if (arErr || !approvalReq) {
    throw new Error('Voucher has no pending approval request')
  }
  // Treasury · Approve (or the queue's), never your own unless you are the Principal.
  const verdict = decision(user, [approvalReq.request_type], [approvalReq.submitted_by])
  if (!verdict.may) throw new Error(verdict.why)
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
// An invoice link is never copied. A repayment's deal is (2026-10-12, user:
// 三样都做): copied without it, HV-PV-202608-0312 / 0313 — the 4th instalments
// to HOUZS Century — were paid but never reached the fund sources' own records,
// and the Overdue page showed them unpaid. So a repayment's copy repays the same
// fund source (or loan) with the same principal / interest while that deal is
// still live; the amount then stays locked to that split, as on any repayment
// voucher. A deal since repaid gets a plain copy, as before.
export async function copyPaymentVoucher(formData: FormData): Promise<void> {
  const user = await requireActionOn('/payments/[id]', 'treasury', 'create')
  const created = await copyPaymentVoucherWork(user, formData)
  redirect(`/payments/${created.id}/edit`)
}

/**
 * Copy as a new draft, answered in words (2026-10-16, the Finance phone app's
 * voucher): the same gate and work as `copyPaymentVoucher` — the app opens the
 * copy on its own screen, its Edit sheet up, instead of the portal's edit page.
 */
export async function copyPaymentVoucherInWords(formData: FormData): Promise<{ ok: true; id: string; voucherNo: string } | { ok: false; reason: string }> {
  const user = await requireActionOn('/payments/[id]', 'treasury', 'create')
  try {
    const created = await copyPaymentVoucherWork(user, formData)
    return { ok: true, ...created }
  } catch (e) {
    if (isRedirect(e)) throw e
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The copy did not go through.' }
  }
}

async function copyPaymentVoucherWork(user: Awaited<ReturnType<typeof requireActionOn>>, formData: FormData): Promise<{ id: string; voucherNo: string }> {
  const supabase = await createClient()

  const sourceId = (formData.get('voucher_id') as string) ?? ''
  if (!sourceId) throw new Error('Voucher id is required')

  const { data: src, error: srcErr } = await supabase
    .from('payment_vouchers')
    .select('voucher_type, direction, amount, payee_name, payee_company_id, bank_account_id, description, payment_method, target_pool, reference_type, fund_source_id, loan_id, repayment_breakdown')
    .eq('id', sourceId)
    .single()
  if (srcErr || !src) throw new Error('Source voucher not found')
  // A copy carries the payee and the amount into a draft the caller can read.
  if (isPayrollReference(src.reference_type) && !canSeePayrollPayouts(user)) throw new Error('Source voucher not found')

  // The deal a repayment's copy repays — the same one, while it is live.
  let deal: { fund_source_id: string | null; loan_id: string | null; repayment_breakdown: typeof src.repayment_breakdown } = {
    fund_source_id: null,
    loan_id: null,
    repayment_breakdown: null,
  }
  if (src.repayment_breakdown && src.fund_source_id) {
    const { data: fs } = await supabase.from('fund_sources').select('status').eq('id', src.fund_source_id).maybeSingle()
    if (fs && (fs.status === 'active' || fs.status === 'matured')) {
      deal = { fund_source_id: src.fund_source_id, loan_id: null, repayment_breakdown: src.repayment_breakdown }
    }
  } else if (src.repayment_breakdown && src.loan_id) {
    const { data: loan } = await supabase.from('loans').select('status').eq('id', src.loan_id).maybeSingle()
    if (loan && loan.status === 'active') deal = { fund_source_id: null, loan_id: src.loan_id, repayment_breakdown: src.repayment_breakdown }
  }

  // The lines are checked BEFORE the copy is written (2026-10-22): an account
  // that has sub-accounts since takes no posting (pvs_reject_header_account) —
  // 126 receipts are on 3030 Accounts Receivable - Subs, a header now — and a
  // copy refused after its insert left a blank draft behind.
  const { data: srcRows } = await supabase
    .from('payment_voucher_sources')
    .select('pool, amount, account_code, role, override_account_type, override_gl_account_code, override_reason')
    .eq('voucher_id', sourceId)
  const lineCodes = [...new Set((srcRows ?? []).map((r) => r.account_code).filter((c): c is string => !!c))]
  if (lineCodes.length > 0) {
    const { data: subAccounts } = await supabase.from('chart_of_accounts').select('parent_code').in('parent_code', lineCodes)
    const headers = new Set((subAccounts ?? []).map((a) => a.parent_code))
    const at = (srcRows ?? []).findIndex((r) => headers.has(r.account_code))
    if (at >= 0) {
      throw new Error(`Line ${at + 1}'s account ${srcRows![at].account_code} is a header account now (it has sub-accounts) — nothing was copied. Make a new voucher on one of its sub-accounts.`)
    }
  }

  // New voucher number — same scheme as createPaymentVoucher.
  const period = officeTime().format('YYYYMM') // the office's month, not UTC's
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
      ...deal,
      // A copy is a NEW payment, so it gets today rather than the original's
      // date - and never NULL: omitting the column here is how
      // HV-PV-202609-0437 reached pending_approval with no payment date
      // (2026-09-29), leaving the approval no GL date to post on.
      payment_date: officeDate(),
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !created) throw new Error(`Failed to copy voucher: ${insErr?.message ?? 'unknown'}`)

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
      const voided = await voidHalfMadeVoucher(supabase, created.id)
      throw new Error(`Failed to copy the voucher's lines: ${clause(rowsErr.message)}. ${voided
        ? `The new draft ${voucherNo} was voided — nothing else was written.`
        : `The new draft ${voucherNo} is left without lines and could not be voided — void it on its page.`}`)
    }
  }

  revalidatePath('/payments')
  return { id: created.id as string, voucherNo }
}

/**
 * A voucher whose lines the database refused is voided, never deleted (2026-10-22):
 * payment_vouchers refuses every session's DELETE (pv_no_delete USING (false)) and
 * answers with no error, so Copy's "rolled back" delete left the blank draft where it
 * was. Only while it is still a draft — nothing has posted, so no money moves. True
 * when it was voided.
 */
async function voidHalfMadeVoucher(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('payment_vouchers')
    .update({ status: 'voided' })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
  return !error && (data?.length ?? 0) > 0
}

/** The database's message as a clause of ours: its closing full stop dropped. */
function clause(message: string): string {
  return message.trim().replace(/\.+$/, '')
}

export async function updatePaymentVoucher(formData: FormData) {
  const user = await requireActionOn('/payments', 'treasury', 'edit')
  await updatePaymentVoucherWork(user.id, formData)
  redirect(`/payments/${formData.get('id') as string}`)
}

/**
 * A voucher's Edit answered in words (2026-10-16, the Finance phone app's
 * sheet): the same gate and work as `updatePaymentVoucher`, without the
 * redirect to the portal's voucher page.
 */
export async function updatePaymentVoucherInWords(formData: FormData): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = await requireActionOn('/payments', 'treasury', 'edit')
  try {
    await updatePaymentVoucherWork(user.id, formData)
    return { ok: true }
  } catch (e) {
    if (isRedirect(e)) throw e
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The voucher could not be saved.' }
  }
}

async function updatePaymentVoucherWork(userId: string, formData: FormData): Promise<void> {
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Voucher id is required')

  // Load current voucher to validate state + lock direction/voucher_type — and,
  // since only what the form sends is written (lib/voucher-edit, 2026-10-16),
  // what the rest stands at.
  const { data: current } = await supabase
    .from('payment_vouchers')
    .select('id, status, direction, voucher_type, fund_source_id, loan_id, repayment_breakdown, invoice_id, reference_type, amount, payee_name, payee_company_id, bank_account_id, description, payment_method, notes, target_pool')
    .eq('id', id)
    .single()
  if (!current) throw new Error('Voucher not found')
  if (current.status !== 'pending_approval' && current.status !== 'draft') {
    throw new Error(`Cannot edit voucher in status "${current.status}" — only pending_approval / draft are editable`)
  }

  if (current.reference_type === 'payroll_statutory' || current.reference_type === 'payroll_disbursement') {
    // Snapshot-backed payroll PVs retain every financial detail, including
    // salary components and receiving accounts. Metadata edits never replace sources.
    const salaryPayment = current.reference_type === 'payroll_disbursement'
    const snapshotTable = salaryPayment ? 'payroll_voucher_lines' : 'payroll_statutory_voucher_lines'
    const detailsLabel = salaryPayment ? 'salary payment details' : 'statutory contributions'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: coverage, error: coverageError } = await (supabase as any)
      .from(snapshotTable).select('id').eq('voucher_id', id).limit(1)
    if (coverageError) throw new Error(`Unable to verify the recorded ${detailsLabel}. Please refresh and try again.`)
    if (coverage?.length) {
      const allowed = new Set(['id', 'payment_date', 'notes'])
      if (Array.from(formData.keys()).some((key) => !allowed.has(key))) {
        throw new Error(salaryPayment
          ? 'This salary PV has recorded employee payments and receiving accounts. Only its payment date and notes can be edited. To change people, salary components, amounts, payee, banks or source accounts, void it and generate a new PV from HR Payment.'
          : 'This statutory PV has recorded employee contributions. Only its payment date and notes can be edited. To change people, amounts, payee, bank or source accounts, void it and generate a new PV from HR Payment.')
      }
      const updates: { payment_date?: string; notes?: string | null; updated_at: string } = { updated_at: new Date().toISOString() }
      if (formData.has('payment_date')) {
        const date = String(formData.get('payment_date') ?? '').trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
          throw new Error('Choose a valid payment date')
        }
        updates.payment_date = date
      }
      if (formData.has('notes')) updates.notes = String(formData.get('notes') ?? '').trim() || null
      const { data: updated, error: updateError } = await supabase.from('payment_vouchers')
        .update(updates).eq('id', id).in('status', ['pending_approval', 'draft']).select('id')
      if (updateError) throw new Error(`Failed to update ${salaryPayment ? 'salary' : 'statutory'} PV: ${updateError.message}`)
      if (!updated?.length) throw new Error('Voucher status changed mid-edit (already approved or voided) — refresh and try again')
      await supabase.from('access_log').insert({
        user_id: userId, action: 'update_payment_voucher', resource_type: 'payment_voucher', resource_id: id,
        metadata: { status_at_edit: current.status, voucher_type: current.voucher_type, ...(salaryPayment ? { salary_details_preserved: true } : { statutory_details_preserved: true }) },
      }).then(() => { /* best-effort audit */ }, () => { /* do not block the completed edit */ })
      revalidatePath(`/payments/${id}`)
      revalidatePath('/payments')
      revalidatePath('/approvals')
      revalidatePath('/hr-costing/payment')
      return
    }
  }

  // What the form sent, over what the voucher stands at (only what changed is sent).
  const sent = (key: string) => formData.has(key)
  const text = (key: string) => (formData.get(key) as string) ?? ''
  const stored = current as typeof current & {
    amount: number | string | null
    payee_name: string | null
    payee_company_id: string | null
    bank_account_id: string | null
    description: string | null
    payment_method: string | null
    notes: string | null
    target_pool: string | null
  }
  const amount = sent('amount') ? parseFloat(text('amount') || '0') : Number(stored.amount)
  let payeeName = sent('payee_name') ? text('payee_name').trim() : (stored.payee_name ?? '').trim()
  const payeeCompanyId = sent('payee_company_id') ? text('payee_company_id') || null : (stored.payee_company_id ?? null)
  const bankAccountId = sent('bank_account_id') ? text('bank_account_id') || null : (stored.bank_account_id ?? null)
  const description = sent('description') ? text('description').trim() : (stored.description ?? '').trim()
  const paymentMethod = sent('payment_method') ? text('payment_method') || 'bank_transfer' : (stored.payment_method ?? 'bank_transfer')
  const targetPool = sent('target_pool') ? text('target_pool') || null : (stored.target_pool ?? null)
  const notes = sent('notes') ? text('notes').trim() || null : (stored.notes ?? null)
  // Editable while draft/pending: drives the approval-time GL date (see create).
  const rawEditPaymentDate = (formData.get('payment_date') as string)?.trim()
  const editPaymentDate = rawEditPaymentDate && /^\d{4}-\d{2}-\d{2}$/.test(rawEditPaymentDate)
    ? rawEditPaymentDate
    : null
  // Clearing the field used to save silently (the old date stayed), which
  // reads as accepted. If the form sent the field at all it has to be a real
  // date - the approval posts the GL on it.
  if (formData.has('payment_date') && !editPaymentDate) {
    throw new Error('Choose a valid payment date')
  }

  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!description) throw new Error('Description is required')
  // Mig 242: debit vouchers must declare a bank — same rule as createPaymentVoucher.
  if (current.direction === 'debit' && !bankAccountId) {
    throw new Error('Bank account is required for debit (outgoing) vouchers')
  }

  let payeeFromCompany = false
  if (!payeeName && payeeCompanyId) {
    const { data: co } = await supabase.from('companies').select('name').eq('id', payeeCompanyId).single()
    if (co) {
      payeeName = co.name
      payeeFromCompany = true
    }
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

  // The source rows, checked before anything is written (mig 205: every
  // voucher carries ≥1 PVS row; the sum must match the amount; the per-row
  // override constraint is enforced at the DB too).
  type SourceRowIn = {
    pool: string
    amount: number
    account_code: string
    override_account_type: AccountType | null
    override_gl_account_code: string | null
    override_reason: string | null
  }
  let debitRows: SourceRowIn[] | null = null
  let creditRow: { pool: string; account_code: string } | null = null
  if (current.direction === 'debit') {
    if (sent('source_rows_count')) {
      const rowCount = parseInt((formData.get('source_rows_count') as string) ?? '0', 10)
      const rows: SourceRowIn[] = []
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
      debitRows = rows
    } else if (sent('amount')) {
      // The amount moved and the pools were not sent: the ones standing must still add up to it.
      const { data: standing } = await supabase.from('payment_voucher_sources').select('amount').eq('voucher_id', id)
      const sum = (standing ?? []).reduce((s, r) => s + Number(r.amount), 0)
      if (Math.abs(sum - amount) > 0.005) {
        throw new Error(`source rows sum (${sum.toFixed(2)}) does not match voucher amount (${amount.toFixed(2)})`)
      }
    }
  } else if (current.direction === 'credit' && (sent('amount') || sent('target_pool') || sent('account_code'))) {
    if (!targetPool) throw new Error('Target pool is required for credit voucher')
    let accountCode = sent('account_code') ? text('account_code').trim() || null : null
    if (!sent('account_code')) {
      const { data: standing } = await supabase.from('payment_voucher_sources').select('account_code').eq('voucher_id', id).limit(1)
      accountCode = ((standing ?? [])[0] as { account_code: string | null } | undefined)?.account_code ?? null
    }
    // See comment on create path: credit vouchers must carry an account.
    if (!accountCode) {
      throw new Error('Account is required on inbound (credit) vouchers')
    }
    creditRow = { pool: targetPool, account_code: accountCode }
  }

  // Only the columns sent are written (and a payee filled from its company).
  const updates: {
    amount?: number
    payee_name?: string
    payee_company_id?: string | null
    bank_account_id?: string | null
    description?: string
    payment_method?: string
    notes?: string | null
    target_pool?: string | null
    payment_date?: string
    updated_at: string
  } = { updated_at: new Date().toISOString() }
  if (sent('amount')) updates.amount = amount
  if (sent('payee_name') || payeeFromCompany) updates.payee_name = payeeName
  if (sent('payee_company_id')) updates.payee_company_id = payeeCompanyId
  if (sent('bank_account_id')) updates.bank_account_id = bankAccountId
  if (sent('description')) updates.description = description
  if (sent('payment_method')) updates.payment_method = paymentMethod
  if (sent('notes')) updates.notes = notes
  if (current.direction === 'credit' ? sent('target_pool') : stored.target_pool != null) {
    updates.target_pool = current.direction === 'credit' ? targetPool : null
  }
  if (editPaymentDate) updates.payment_date = editPaymentDate

  // .select() forces Supabase to return the matched rows so we can detect
  // the TOCTOU race where Principal approves between our SELECT and UPDATE.
  // Without this, UPDATE matches 0 rows (status no longer in our filter set)
  // and updErr stays null — we'd silently corrupt the now-paid voucher.
  const { data: updated, error: updErr } = await supabase
    .from('payment_vouchers')
    .update(updates)
    .eq('id', id)
    .in('status', ['pending_approval', 'draft'])
    .select('id')

  if (updErr) throw new Error(`Failed to update voucher: ${updErr.message}`)
  if (!updated || updated.length === 0) {
    throw new Error('Voucher status changed mid-edit (already approved or voided) — refresh and try again')
  }

  // Replace source rows — only when they were sent (or a receipt's pool,
  // account or amount moved). Mig 221 broadens RLS to allow DELETE on
  // pending_approval vouchers (was draft-only); confirm post-delete that
  // the voucher truly has zero PVS rows before we INSERT — catches RLS
  // regressions and any future status restriction.
  if (debitRows || creditRow) {
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

    const { error: insErr } = debitRows
      ? await supabase.from('payment_voucher_sources').insert(
          debitRows.map(r => ({
            voucher_id: id,
            pool: r.pool,
            amount: r.amount,
            account_code: r.account_code,
            override_account_type: r.override_account_type,
            override_gl_account_code: r.override_gl_account_code,
            override_reason: r.override_reason,
          })),
        )
      : await supabase.from('payment_voucher_sources').insert({
          voucher_id: id,
          pool: creditRow!.pool,
          amount,
          account_code: creditRow!.account_code,
        })
    if (insErr) throw new Error(`Failed to write new source rows: ${insErr.message}`)
  }

  // Audit trail: who edited (best-effort — schema mismatch shouldn't block edit)
  await supabase
    .from('access_log')
    .insert({
      user_id: userId,
      action: 'update_payment_voucher',
      resource_type: 'payment_voucher',
      resource_id: id,
      metadata: { status_at_edit: current.status, voucher_type: current.voucher_type },
    })
    .then(() => {/* ok */}, () => {/* ignore audit failure */})

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
}

// ─── Amend a PAID voucher's date (Finance) ──────────────────────────────────
// User 2026-10-02: "这个日期我录错了怎么办？能自己改吗？". A draft or pending
// voucher is re-dated with Edit; a paid one — and a receipt is paid the moment
// it is made — had only void + record again. amend_voucher_date moves the
// voucher, every journal entry it posted, and the repayment rows its approval
// wrote, to the right day, and notes it on each. Amount, bank and pools stay.
// The RPC guards roles, period locks (both months), bank reconciliation
// matches, and payroll vouchers (those are HR Payment's to re-date).
export async function amendVoucherDate(
  formData: FormData,
): Promise<{ error?: string; old?: string; newDate?: string }> {
  await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'edit')
  const supabase = await createClient()

  const id = ((formData.get('id') as string) ?? '').trim()
  const newDate = ((formData.get('new_date') as string) ?? '').trim()
  const reason = ((formData.get('reason') as string) ?? '').trim()
  if (!id) return { error: 'Voucher id is required' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { error: '选一个日期' }
  if (!reason) return { error: '写一句原因(会留在记录里)' }

  const { data, error } = await supabase.rpc('amend_voucher_date' as never, {
    p_voucher_id: id,
    p_new_date: newDate,
    p_reason: reason,
  } as never)
  if (error) return { error: error.message }

  const res = (data ?? {}) as { old?: string; new?: string }
  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/receipts')
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports')
  revalidatePath('/dashboard')
  return { old: res.old, newDate: res.new ?? newDate }
}

// ─── Reassign GL account on an approved/paid voucher (Finance) ──────────────
// User 2026-08-24: "gl account 放错，我希望approve 了我还能改". Edits the
// posted journal lines IN PLACE via the reassign_voucher_gl_account RPC —
// same entries/amounts/dates, only the non-bank leg's account moves, so P&L,
// cash-flow drill-downs and trial balance all follow. The RPC guards roles,
// bank/3030 legs, period locks, and appends an audit note to each JE.

export async function reassignVoucherGlAccount(
  formData: FormData,
): Promise<{ error?: string; changed?: number }> {
  try {
    await requireActionOn('/payments/[id]', 'treasury', 'edit')
    const supabase = await createClient()

    const id = ((formData.get('id') as string) ?? '').trim()
    const oldAccount = ((formData.get('old_account') as string) ?? '').trim()
    const newAccount = ((formData.get('new_account') as string) ?? '').trim()
    const reason = ((formData.get('reason') as string) ?? '').trim()
    if (!id || !oldAccount || !newAccount) {
      return { error: 'Voucher, current account and new account are all required' }
    }
    if (!reason) return { error: 'Reason is required (goes into the audit note)' }

    const { data, error } = await supabase.rpc('reassign_voucher_gl_account' as never, {
      p_voucher_id: id,
      p_old_account: oldAccount,
      p_new_account: newAccount,
      p_reason: reason,
    } as never)
    if (error) return { error: error.message }

    revalidatePath(`/payments/${id}`)
    revalidatePath('/payments')
    revalidatePath('/reports')
    return { changed: Number(data ?? 0) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Void voucher (Finance, only draft/pending) ─────────────────────────────

export async function voidVoucher(formData: FormData) {
  const user = await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'void')
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Voucher id is required')

  const { error } = await supabase
    .from('payment_vouchers')
    .update({ status: 'voided' })
    .eq('id', id)
    .in('status', ['draft', 'pending_approval'])

  if (error) throw new Error(`Failed to void voucher: ${error.message}`)

  // Reject the linked pending approval(s) via SECURITY DEFINER RPC — the old
  // inline update ran under the caller's RLS: Finance isn't allowed to update
  // approval_requests, PostgREST reported success with 0 rows, and voided PVs
  // stayed PENDING in Principal's queue (mig 20260721020000; 17 live orphans
  // cleaned 2026-07-21). Fail loud, never silently.
  const { error: closeErr } = await supabase.rpc(
    'close_approvals_for_voided_voucher' as never,
    { p_voucher_id: id } as never,
  )
  if (closeErr) {
    throw new Error(
      `Voucher voided, but clearing its approval from the queue failed: ${closeErr.message}`,
    )
  }

  void user
  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/approvals')
  redirect('/payments')
}

/**
 * Void a voucher, void a paid receipt, reverse a paid payment — answered in
 * words (2026-10-16, the Finance phone app's voucher): the same gate and work
 * as voidVoucher / voidPaidReceipt / reversePaidPayment. Their way back to the
 * portal's Payments (the redirect at their end, reached once the work is done)
 * is the desktop's, so here it is not followed.
 */
export async function voidVoucherStepInWords(
  kind: 'void' | 'void_receipt' | 'reverse',
  formData: FormData,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'void')
  try {
    if (kind === 'void') await voidVoucher(formData)
    else if (kind === 'void_receipt') await voidPaidReceipt(formData)
    else await reversePaidPayment(formData)
    return { ok: true }
  } catch (e) {
    if (isRedirect(e)) return { ok: true }
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'That did not go through.' }
  }
}

// ─── Void a PAID receipt / billing-payment (reverse all effects) ────────────
// A paid credit voucher (Official Receipt) already moved money — bank cache,
// pool ledgers, GL, and the invoice(s) it settled. The plain voidVoucher only
// flips draft/pending status; this one fully REVERSES a paid credit voucher so
// a wrong receipt can be undone. Steps: reverse bank cache, reverse each linked
// GL entry, reverse the pool credits, un-settle the invoice(s), mark voided.
export async function voidPaidReceipt(formData: FormData) {
  const user = await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'void')
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Voucher id is required')

  const { data: v } = await supabase
    .from('payment_vouchers')
    .select('id, voucher_no, direction, voucher_type, status, amount, bank_account_id, target_pool, invoice_id, payee_name, payment_method, payment_date')
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

  // Date the reversal in the receipt's own month so it nets there (not a later
  // month). Fall back to today if that period is locked.
  const origDate =
    typeof v.payment_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.payment_date)
      ? v.payment_date
      : officeDate()
  const { data: lockRow } = await supabase
    .from('period_locks')
    .select('id')
    .eq('period_month', dayjs(origDate).startOf('month').format('YYYY-MM-DD'))
    .eq('is_locked', true)
    .maybeSingle()
  const reversalDate = lockRow ? officeDate() : origDate

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
      const reversalId = await postJournalEntry(supabase, {
        transactionDate: reversalDate,
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
      // Flag BOTH legs (mig 20260730000000) so every `is_reversed = false`
      // report filter drops the cancelled pair — the pair nets to zero, so no
      // total moves; the ledger and drill-downs just stop showing the noise.
      // je_no_update blocks a direct update, hence the SECURITY DEFINER RPC.
      const { error: flagErr } = await supabase.rpc('mark_journal_entry_reversed' as never, {
        p_original_id: e.id,
        p_reversal_id: reversalId,
      } as never)
      if (flagErr) {
        throw new Error(`reversal posted but flagging the pair failed: ${flagErr.message}`)
      }
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

// ─── Reverse a PAID outgoing payment (debit voucher) ────────────────────────
// Symmetric to voidPaidReceipt but for money that went OUT. A paid debit voucher
// already debited the bank, posted GL, and (for pooled payments) debited a pool.
// This fully REVERSES it so a wrong payment (e.g. amount keyed wrong) can be
// undone and re-entered correctly. Steps mirror the receipt reversal: add the
// bank back, reverse each GL entry, reverse the pool rows, un-settle any linked
// invoice, mark voided — then remove the fund-source repayments approval synced
// from it (reopening the source they closed).
//
// Voucher types that have their OWN dedicated unwind are BLOCKED here with a
// pointer to the right flow — reversing them generically would leave their
// downstream records (loans, payroll accruals, claims, dept requests) dangling.
export async function reversePaidPayment(formData: FormData) {
  const user = await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'void')
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Voucher id is required')

  const { data: v } = await supabase
    .from('payment_vouchers')
    .select('id, voucher_no, direction, voucher_type, status, amount, bank_account_id, invoice_id, fund_source_id, loan_id, reference_type, payment_method, payment_date')
    .eq('id', id)
    .single()
  if (!v) throw new Error('Voucher not found')
  if (v.status !== 'paid') throw new Error(`Only paid vouchers can be reversed (status=${v.status})`)
  if (v.direction !== 'debit') throw new Error('This reverses outgoing payments — use the receipt reversal for incoming credits')

  // Block types with a dedicated unwind flow (generic reversal would orphan their downstream rows).
  if (v.loan_id && v.voucher_type !== 'loan_repayment') {
    throw new Error('This is a loan disbursement — cancel it via the loan cancellation flow instead.')
  }
  if (v.voucher_type === 'loan_repayment' && v.loan_id) {
    throw new Error('Loan-repayment vouchers tied to a loan can’t be reversed here — void and recreate.')
  }
  // Salary component status updates also reconcile payroll coverage. This
  // multi-request reversal cannot atomically unwind that lifecycle: reject
  // before changing bank/GL/pools, including salary PVs typed as 'other'.
  if (v.voucher_type === 'payroll_bank_transfer' || v.voucher_type === 'salary_payout' || v.reference_type === 'payroll_disbursement') {
    throw new Error('Payroll / salary payments must be reversed through the payroll flow.')
  }
  if (v.reference_type === 'dept_payment_request') {
    throw new Error('Department payment settlements — cancel via the department request instead.')
  }
  if (v.voucher_type === 'claim_payout') {
    throw new Error('Claim payouts can’t be auto-reversed yet — reopen the claim, then void/recreate manually.')
  }

  const amount = r2(Number(v.amount))
  const isNetting = v.payment_method === 'netting'

  // Date the reversal in the ORIGINAL payment's month so it nets there instead
  // of splitting into a later month (e.g. a May payment reversed in June should
  // cancel within May). If that month is already locked, fall back to today.
  const origDate =
    typeof v.payment_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.payment_date)
      ? v.payment_date
      : officeDate()
  const { data: lockRow } = await supabase
    .from('period_locks')
    .select('id')
    .eq('period_month', dayjs(origDate).startOf('month').format('YYYY-MM-DD'))
    .eq('is_locked', true)
    .maybeSingle()
  const reversalDate = lockRow ? officeDate() : origDate

  // 1) Reverse bank cache — the payment REDUCED it, so add it back. Via
  //    bump_bank_balance RPC (bank_accounts UPDATE is principal-only under RLS).
  if (v.bank_account_id && !isNetting) {
    const { error: bumpErr } = await supabase.rpc('bump_bank_balance', {
      p_bank_account_id: v.bank_account_id,
      p_delta: amount,
    })
    if (bumpErr) throw new Error(`Failed to reverse bank balance: ${bumpErr.message}`)
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
      const reversalId = await postJournalEntry(supabase, {
        transactionDate: reversalDate,
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
      // Flag BOTH legs (mig 20260730000000) so every `is_reversed = false`
      // report filter drops the cancelled pair — the pair nets to zero, so no
      // total moves; the ledger and drill-downs just stop showing the noise.
      // je_no_update blocks a direct update, hence the SECURITY DEFINER RPC.
      const { error: flagErr } = await supabase.rpc('mark_journal_entry_reversed' as never, {
        p_original_id: e.id,
        p_reversal_id: reversalId,
      } as never)
      if (flagErr) {
        throw new Error(`reversal posted but flagging the pair failed: ${flagErr.message}`)
      }
    } catch (jeErr) {
      const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
      throw new Error(`Reverse ${v.voucher_no}: GL reversal failed (${e.entry_no ?? e.id}): ${msg}`)
    }
  }

  // 3) Reverse every pool row this voucher wrote (expense_out → void_in, etc.)
  const { error: poolRevErr } = await supabase.rpc('reverse_voucher_pool_rows' as never, {
    p_voucher_no: v.voucher_no,
  } as never)
  if (poolRevErr) throw new Error(`Reverse ${v.voucher_no}: pool reversal failed: ${poolRevErr.message}`)

  // 4) Un-settle any invoice this payment closed (billing_payment)
  const { data: linked } = await supabase
    .from('invoices')
    .select('id')
    .eq('settlement_voucher_id', id)
  if (linked && linked.length > 0) {
    const { error: unsettleErr } = await supabase
      .from('invoices')
      .update({ status: 'issued', settlement_voucher_id: null } as never)
      .eq('settlement_voucher_id', id)
    if (unsettleErr) throw new Error(`Reverse ${v.voucher_no}: invoice un-settle failed: ${unsettleErr.message}`)
  } else if (v.invoice_id) {
    const { error: unsettleErr } = await supabase
      .from('invoices')
      .update({ status: 'issued' })
      .eq('id', v.invoice_id)
      .in('status', ['paid', 'paid_via_netting'])
    if (unsettleErr) throw new Error(`Reverse ${v.voucher_no}: invoice un-settle failed: ${unsettleErr.message}`)
  }

  // 5) Mark the voucher voided (race-guarded on still-paid)
  const { error: updErr } = await supabase
    .from('payment_vouchers')
    .update({ status: 'voided' })
    .eq('id', id)
    .eq('status', 'paid')
  if (updErr) throw new Error(`Failed to void voucher: ${updErr.message}`)

  // 6) Remove the fund-source repayment rows approval synced from this voucher
  //    (HV repaying a fund source), reopening the source they had closed —
  //    reverse_voucher_fund_source_repayments (mig 20261022100000), which takes
  //    only a voided voucher. Never a .delete() here: fund_source_repayments
  //    refuses every session's DELETE (fsr_no_delete USING (false)) without an
  //    error, so the rows stayed and the source still read repaid (2026-10-21).
  if (v.fund_source_id) {
    const { error: fsrErr } = await supabase.rpc('reverse_voucher_fund_source_repayments', { p_voucher_id: id })
    if (fsrErr) {
      throw new Error(`Reverse ${v.voucher_no}: the voucher is voided, but removing its fund-source repayments failed: ${fsrErr.message}`)
    }
  }

  // Reset any dangling approval / payroll funding request via SECURITY DEFINER
  // RPC (mig 20260722100000) — a reversed funding PV otherwise leaves its
  // payroll_payment_requests row stuck at pv_generated and the HR Payment page
  // showing "awaiting Principal" for a dead voucher.
  const { error: closeErr } = await supabase.rpc(
    'close_approvals_for_voided_voucher' as never,
    { p_voucher_id: id } as never,
  )
  if (closeErr) {
    throw new Error(
      `Voucher voided, but resetting its approval/funding request failed: ${closeErr.message}`,
    )
  }

  revalidatePath(`/payments/${id}`)
  revalidatePath('/payments')
  revalidatePath('/billing')
  revalidatePath('/statements')
  revalidatePath('/dashboard')
  revalidatePath('/dept-pool')
  revalidatePath('/venture-pool')
  revalidatePath('/hr-costing/payment')
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
  await requirePermission('treasury')
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

// ─── Inline previews (Principal + Finance) ──────────────────────────────────
// Batch-sign the previewable attachments of a voucher (images + PDFs) so the
// detail page / batch modal can render them inline — no per-file Download
// click. Other types (xlsx, docx, csv, …) are skipped and keep the Download
// link. Longer TTL than getAttachmentSignedUrl because the reviewer keeps the
// page open while deciding; one createSignedUrls round-trip instead of N.

function isPreviewableType(fileType: string): boolean {
  const t = fileType ?? ''
  return t.startsWith('image/') || t === 'application/pdf'
}

export async function getAttachmentPreviewUrls(
  attachmentIds: string[],
): Promise<{ id: string; url: string }[]> {
  await requirePermission('treasury')
  if (attachmentIds.length === 0) return []
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('payment_attachments')
    .select('id, storage_path, file_type')
    .in('id', attachmentIds)

  if (error || !rows) {
    throw new Error('Attachments not found or access denied')
  }

  const previewable = rows.filter((r) => isPreviewableType(r.file_type ?? ''))
  if (previewable.length === 0) return []

  const { data: signed, error: signErr } = await supabase.storage
    .from('payment-attachments')
    .createSignedUrls(
      previewable.map((r) => r.storage_path),
      60 * 60,
    )

  if (signErr || !signed) {
    throw new Error(`Failed to sign preview URLs: ${signErr?.message ?? 'unknown'}`)
  }

  const urlByPath = new Map(
    signed
      .filter((s): s is typeof s & { signedUrl: string } => !!s.signedUrl)
      .map((s) => [s.path as string, s.signedUrl]),
  )

  return previewable
    .map((r) => ({ id: r.id, url: urlByPath.get(r.storage_path) ?? '' }))
    .filter((x) => x.url.length > 0)
}

// ─── Delete voucher attachment (Principal + Finance, 2026-09-15) ─────────────
// Same window as upload: only while the PV is draft / pending_approval. The
// RPC (SECURITY DEFINER — table RLS is pa_no_delete) removes the row and
// returns the storage path; the object is then removed under the matching
// storage DELETE policy. A failed object removal leaves an orphan file that
// nothing can sign a URL for — logged, not fatal.

export async function deleteVoucherAttachment(
  attachmentId: string,
): Promise<{ voucherId: string }> {
  await requireActionOn(['/approvals', '/payments/[id]'], 'treasury', 'edit')
  const supabase = await createClient()
  if (!attachmentId) throw new Error('attachment id is required')

  const { data: att } = await supabase
    .from('payment_attachments')
    .select('voucher_id')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!att) throw new Error('Attachment not found or access denied')

  const { data: storagePath, error } = await supabase.rpc('delete_voucher_attachment', {
    p_attachment_id: attachmentId,
  })
  if (error) throw new Error(`删除失败：${error.message}`)

  if (storagePath) {
    const { error: rmErr } = await supabase.storage
      .from('payment-attachments')
      .remove([storagePath as string])
    if (rmErr) console.error('attachment object removal failed (orphan left):', storagePath, rmErr.message)
  }

  revalidatePath(`/payments/${att.voucher_id}`)
  revalidatePath('/approvals')
  return { voucherId: att.voucher_id as string }
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
// A file can be ADDED to a voucher until it is voided — including after it is
// approved or paid (2026-10-05: two paid PVs had been made without their
// receipts; user: "做第 2 条"). Nothing is ever REMOVED from a decided voucher:
// the delete RPC and the storage DELETE policy both stop at pending_approval.
const UPLOADABLE_STATUSES = ['draft', 'pending_approval', 'approved', 'paid']
const UNDECIDED_STATUSES = ['draft', 'pending_approval']

export async function uploadVoucherAttachment(formData: FormData): Promise<{ count: number }> {
  const user = await requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'edit')
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
  if (!UPLOADABLE_STATUSES.includes(voucher.status)) {
    throw new Error(`Cannot upload attachments when voucher status is "${voucher.status}"`)
  }
  const afterDecision = !UNDECIDED_STATUSES.includes(voucher.status)

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

  // Something added to a voucher that was already decided: the row says who
  // and when, and this is the entry the Audit log reads. The files are in
  // place either way, so a failure here is reported, not thrown.
  if (afterDecision) {
    const { error: logErr } = await supabase.from('access_log').insert({
      user_id: user.id,
      action: 'add_attachment',
      resource_type: 'payment_voucher',
      resource_id: voucherId,
      metadata: { voucher_status: voucher.status, count: uploaded, files: files.map((f) => f.name) },
    })
    if (logErr) console.error('add_attachment audit row failed:', voucherId, logErr.message)
  }

  revalidatePath(`/payments/${voucherId}`)
  revalidatePath('/approvals')
  return { count: uploaded }
}
