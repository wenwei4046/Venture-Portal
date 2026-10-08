import Link from 'next/link'
import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import { requirePermission } from '@/lib/auth'
import { fundingSourceFromTerms } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/coa'
import NewPaymentForm from '../_components/NewPaymentForm'
import LoanRepaymentReceivedForm from '../_components/LoanRepaymentReceivedForm'
import { listPayableFundSources } from '../../fund-in/actions'
import { invoicePoolForBillingMode } from '@/lib/cfo-reports'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { registryPoolOptions } from '@/lib/payment-pools'
import { fetchAllRows } from '@/lib/paginate'
import { loanInstallmentCount } from '@/lib/installment-count'
import { fetchTermsHistory, isLoanPrincipal, principalPaidByMonth, termsForLoan } from '@/lib/treasury-terms-data'

// Settlement routing: when a sub pays an invoice, the money logically lands
// in the dept pool that generated the service. Delegates to the canonical
// map in cfo-reports.ts so the same lookup drives both the settle-invoice
// pool prefill AND the income-statement aggregation — single source of
// truth. Previously this file had its own switch that only handled
// marketing / director / director_office and silently fell back to
// venture_pool for hr_attribution + finance_attribution, so HR / Finance
// invoices were routed to the wrong pool.
function poolForBillingMode(mode: string): string {
  return invoicePoolForBillingMode(mode)
}

interface Props {
  searchParams: Promise<{ invoice_id?: string; preset?: string; mode?: string; return_to?: string }>
}

export default async function NewPaymentPage({ searchParams }: Props) {
  await requirePermission('treasury')
  const supabase = await createClient()

  const { invoice_id: invoiceId, preset, mode, return_to: returnToRaw } = await searchParams
  // Where to land after saving, when the caller wants the user back (Billing
  // sends /billing). A path, never a URL — the action re-checks it too.
  const returnTo = returnToRaw && /^\/[A-Za-z0-9\-_/]*$/.test(returnToRaw) ? returnToRaw : null
  const nonBillablePreset = preset === 'non_billable'

  // Dedicated flow: record a loan repayment RECEIVED (sub → HV).
  if (mode === 'loan_repayment') {
    const [{ data: loans }, { data: loanOut }, { data: cos }, { data: banks }, { data: suspenseAccts }, { data: suspenseLines }] = await Promise.all([
      supabase.from('loans').select('id, company_id, principal, effective_rate, tenure_months, repayment_terms, disbursement_date, compound_interest, repayment_start_month, terms_effective_from').eq('status', 'active'),
      supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
      supabase.from('companies').select('id, short_code, name'),
      supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
      // Interest-in-Suspense leaves + their live balances, so the form can
      // offer "draw down the suspense" instead of booking income twice.
      supabase.from('chart_of_accounts').select('code, name').eq('parent_code', '3060').eq('is_active', true),
      // Every suspense line ever posted, in 1000-row pages (2026-10-08): these
      // are running balances, and a balance summed from a read PostgREST
      // stopped at 1000 rows is short without a word. A failed read still
      // shows no suspense, as before.
      fetchAllRows((lo, hi) =>
        supabase
          .from('journal_lines')
          .select('account_code, debit, credit, journal_entries!inner(is_reversed)')
          .like('account_code', '306%')
          .order('id', { ascending: true })
          .range(lo, hi),
      ).then((data) => ({ data }), () => ({ data: null })),
    ])
    const suspenseBalance = new Map<string, number>()
    for (const l of (suspenseLines ?? []) as unknown as Array<{
      account_code: string; debit: number | null; credit: number | null
      journal_entries: { is_reversed: boolean }
    }>) {
      if (l.journal_entries?.is_reversed) continue
      const cur = suspenseBalance.get(l.account_code) ?? 0
      suspenseBalance.set(l.account_code, cur + Number(l.debit ?? 0) - Number(l.credit ?? 0))
    }
    // Match a suspense leaf to a borrower the same way resolveInterestSuspenseLeaf does.
    const suspenseFor = (co: { name?: string | null; short_code?: string | null } | null | undefined) => {
      if (!co) return null
      const hay = (s: string) => s.toLowerCase()
      return (suspenseAccts ?? []).find((a) => {
        const n = hay(a.name as string)
        return (co.name && n.includes(hay(co.name))) || (co.short_code && n.includes(hay(co.short_code)))
      }) ?? null
    }
    const outMap = new Map((loanOut ?? []).map((o) => [o.loan_id as string, Number(o.outstanding)]))
    const principalPaidMap = new Map((loanOut ?? []).map((o) => [o.loan_id as string, Number(o.total_principal_paid ?? 0)]))
    const coMap = new Map((cos ?? []).map((c) => [c.id as string, c]))
    // 期数 / 还剩 for the picker (2026-10-02). A loan whose terms changed
    // mid-life counts from the segment in force now, which needs its principal
    // repayments month by month — read only for those loans.
    const loanIds = (loans ?? []).map((l) => l.id as string)
    const termsHistory = await fetchTermsHistory(supabase, 'loan', loanIds)
    const changedIds = (loans ?? [])
      .filter((l) => termsHistory.has(l.id as string) || l.terms_effective_from != null)
      .map((l) => l.id as string)
    const changedRepayments =
      changedIds.length === 0
        ? []
        : await fetchAllRows((lo, hi) =>
            supabase
              .from('repayments')
              .select('loan_id, amount, payment_date, payment_type')
              .in('loan_id', changedIds)
              .order('id', { ascending: true })
              .range(lo, hi),
          )
    const principalByMonth = principalPaidByMonth(
      changedRepayments.map((rp) => ({
        id: rp.loan_id as string,
        amount: Number(rp.amount),
        payment_date: rp.payment_date as string,
        payment_type: (rp.payment_type as string | null) ?? 'principal',
      })),
      isLoanPrincipal,
    )
    const currentYM = officeMonth()
    const loanOptions = (loans ?? [])
      .map((l) => {
        const co = l.company_id ? coMap.get(l.company_id as string) : null
        const outstanding = outMap.get(l.id as string) ?? Number(l.principal)
        const susp = suspenseFor(co)
        // Same-company loans look identical — the SC (funding source) remark
        // and disbursement date tell them apart (user 2026-08-07: "不然我不
        // 知道要clear哪里一个").
        const src = fundingSourceFromTerms((l as { repayment_terms?: string | null }).repayment_terms ?? null)
        const disb = (l as { disbursement_date?: string | null }).disbursement_date
        const idBits = `${src ? ` · SC ${src}` : ''}${disb ? ` · ${dayjs(disb).format('D MMM YY')}` : ''}`
        return {
          id: l.id as string,
          outstanding,
          // The picker shows these as columns; the one-line label is kept for
          // anything that still wants a single string.
          borrower: (co?.name as string | undefined) ?? (co?.short_code as string | undefined) ?? '—',
          principal: Number(l.principal),
          ratePct: Math.round(Number(l.effective_rate) * 100 * 1000) / 1000,
          date: disb ?? null,
          source: src ?? null,
          // null = no fixed term (unscheduled, compounding): nothing to count.
          periods: loanInstallmentCount({
            terms: termsForLoan(l, termsHistory.get(l.id as string) ?? []),
            principalPaid: principalPaidMap.get(l.id as string) ?? 0,
            principalByMonth: principalByMonth.get(l.id as string),
            currentYM,
          }),
          label: `${co?.short_code ?? co?.name ?? '—'} · RM ${Number(l.principal).toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(Number(l.effective_rate) * 100).toFixed(3)}%/mo · 欠 ${outstanding.toLocaleString('en-MY', { minimumFractionDigits: 2 })}${idBits}`,
          // Offer the suspense route only when that leaf actually holds a balance.
          suspenseCode: susp && (suspenseBalance.get(susp.code as string) ?? 0) > 0.005 ? (susp.code as string) : null,
          suspenseName: susp?.name as string | undefined,
          suspenseBalance: susp ? Math.round((suspenseBalance.get(susp.code as string) ?? 0) * 100) / 100 : 0,
        }
      })
      .filter((l) => l.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)

    return (
      <div>
        <Link href="/payments/new?mode=receipt" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Back to Receipt</Link>
        <div className="page-head">
          <div>
            <div className="page-eyebrow"><em>I.</em> TREASURY · OFFICIAL RECEIPT · LOAN REPAYMENT</div>
            <h1 className="page-title">收到 Loan 还款</h1>
          </div>
        </div>
        <LoanRepaymentReceivedForm loans={loanOptions} bankAccounts={(banks ?? []).map((b) => ({ id: b.id, bank_name: b.bank_name, account_number: b.account_number ?? '', current_balance: Number(b.current_balance ?? 0) }))} />
      </div>
    )
  }

  const [
    { data: companies },
    { data: bankAccounts },
    { data: accountRows },
    payableFundSources,
    deptRegistry,
  ] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code, is_active')
      .eq('is_active', true)
      .order('type')
      .order('code'),
    listPayableFundSources().catch(() => []),
    fetchDeptRegistry(supabase).catch(() => []),
  ])
  // Departments provisioned after the core five (IT, Revenue Department) have a
  // pool of their own, and the database resolves it — pool_key_to_segment —
  // but the form's pool list was a literal, so neither could be picked.
  const extraPools = registryPoolOptions(deptRegistry)

  let invoicePreset: {
    id: string
    invoice_no: string | null
    company_id: string | null
    company_name: string
    total_amount: number
    period_month: string
    billing_mode: string
    target_pool: string
    /** Mig 225 polymorphism: tells the form whether this invoice was issued
     *  to a subsidiary (real bank involved) vs an internal dept pool / director
     *  (inter-billing, no real money moves — settle via netting). */
    billable_to_type: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
  } | null = null

  if (invoiceId) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, invoice_no, company_id, total_amount, period_month, billing_mode, status, billable_to_type, companies(name)')
      .eq('id', invoiceId)
      .single()

    if (inv && inv.status !== 'paid' && inv.status !== 'paid_via_netting') {
      const company = (inv.companies as { name: string } | null) ?? null
      // Prefill the OUTSTANDING balance, not the printed total — partial
      // receipts and approved credit notes (CN v2, 2026-08-19) both reduce
      // what's left to collect.
      const [{ data: receiptRows }, { data: cnRows }] = await Promise.all([
        supabase
          .from('payment_vouchers')
          .select('amount')
          .eq('invoice_id', inv.id)
          .eq('direction', 'credit')
          .neq('status', 'voided'),
        supabase.from('credit_notes').select('amount').eq('invoice_id', inv.id).eq('status', 'approved'),
      ])
      const received = (receiptRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const credited = (cnRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const outstanding =
        Math.round((Number(inv.total_amount) - received - credited) * 100) / 100
      invoicePreset = {
        id: inv.id,
        invoice_no: inv.invoice_no,
        company_id: inv.company_id, // may be null for non-subsidiary invoices (Item 5)
        company_name: company?.name ?? '—',
        total_amount: outstanding > 0 ? outstanding : Number(inv.total_amount),
        period_month: inv.period_month,
        billing_mode: inv.billing_mode,
        target_pool: poolForBillingMode(inv.billing_mode),
        billable_to_type: (inv.billable_to_type as 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null) ?? null,
      }
    }
  }

  // Refund flow (2026-08-24): '?mode=refund&invoice_id=' on a PAID invoice
  // prefills a debit PV paying the money back — payee/amount/description
  // filled from the invoice's actual receipts; Finance picks pool + GL
  // account; normal PV approval. The invoice itself stays paid (money-out
  // only — no settle-math / mark_invoice_paid interaction).
  let refundPreset: {
    invoice_no: string | null
    company_name: string
    company_id: string | null
    amount: number
  } | null = null
  if (mode === 'refund' && invoiceId && !invoicePreset) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, invoice_no, company_id, billable_to_freetext_name, status, companies(name)')
      .eq('id', invoiceId)
      .single()
    if (inv && (inv.status === 'paid' || inv.status === 'paid_via_netting')) {
      const { data: receiptRows } = await supabase
        .from('payment_vouchers')
        .select('amount')
        .eq('invoice_id', inv.id)
        .eq('direction', 'credit')
        .neq('status', 'voided')
      const received = (receiptRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
      if (received > 0) {
        const company = (inv.companies as { name: string } | null) ?? null
        refundPreset = {
          invoice_no: inv.invoice_no,
          company_name: company?.name ?? inv.billable_to_freetext_name ?? '—',
          company_id: inv.company_id,
          amount: Math.round(received * 100) / 100,
        }
      }
    }
  }

  // Split entry points (user 2026-06-12): the sidebar Receipt entry
  // (?mode=receipt) is receive-only — Credit form + a shortcut to the
  // dedicated 收到 Loan 还款 flow. The Payments page's Create payment is
  // pay-only (debit). No more direction toggle on either.
  const isReceiptMode = mode === 'receipt' && !invoicePreset && !nonBillablePreset

  const headingTitle = invoicePreset
    ? 'Settle invoice'
    : refundPreset
      ? 'Refund payment'
      : nonBillablePreset
        ? 'Non-billable expense'
        : isReceiptMode
          ? 'Create receipt'
          : 'Create payment'

  // mig 252: settle-invoice is incoming money → Official Receipt (OR);
  // expense / payment paths stay as Payment Voucher (PV).
  const headingEyebrow = invoicePreset
    ? 'OFFICIAL RECEIPT · SETTLE INVOICE'
    : refundPreset
      ? 'PAYMENT VOUCHER · REFUND'
      : nonBillablePreset
        ? 'PAYMENT VOUCHER · NON-BILLABLE'
        : isReceiptMode
          ? 'OFFICIAL RECEIPT · NEW'
          : 'PAYMENT VOUCHER · NEW'

  return (
    <div>
      <Link
        href={invoicePreset || refundPreset ? '/billing' : isReceiptMode ? '/receipts' : '/payments'}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to {invoicePreset || refundPreset ? 'Billing' : isReceiptMode ? 'Receipts' : 'Payments'}
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {headingEyebrow}
          </div>
          <h1 className="page-title">{headingTitle}</h1>
        </div>
        {isReceiptMode ? (
          <Link
            href="/payments/new?mode=loan_repayment"
            className="bg-surface hover:bg-surface-2 border border-hairline text-graphite hover:text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            收到 Loan 还款 →
          </Link>
        ) : null}
      </div>

      <NewPaymentForm
        returnTo={returnTo}
        extraPools={extraPools}
        companies={companies ?? []}
        bankAccounts={bankAccounts ?? []}
        accounts={(accountRows ?? []).map((a) => ({
          code: a.code,
          name: a.name,
          type: a.type as AccountType,
          parent_code: (a as { parent_code: string | null }).parent_code ?? null,
          is_active: a.is_active,
        }))}
        invoicePreset={invoicePreset}
        nonBillablePreset={nonBillablePreset}
        refundPreset={refundPreset}
        payableFundSources={payableFundSources}
        lockedDirection={isReceiptMode ? 'credit' : invoicePreset ? undefined : 'debit'}
      />
    </div>
  )
}
