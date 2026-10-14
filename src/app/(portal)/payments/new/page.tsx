import Link from 'next/link'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/coa'
import NewPaymentForm from '../_components/NewPaymentForm'
import LoanRepaymentReceivedForm from '../_components/LoanRepaymentReceivedForm'
import { loadReceivableLoans } from '../_lib/receivable-loans'
import { listPayableFundSources } from '../../fund-in/actions'
import { invoicePoolForBillingMode } from '@/lib/cfo-reports'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { registryPoolOptions } from '@/lib/payment-pools'

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
  await requirePage('/payments/new')
  await requireActionOn('/payments/new', 'treasury', 'create')
  const supabase = await createClient()

  const { invoice_id: invoiceId, preset, mode, return_to: returnToRaw } = await searchParams
  // Where to land after saving, when the caller wants the user back (Billing
  // sends /billing). A path, never a URL — the action re-checks it too.
  const returnTo = returnToRaw && /^\/[A-Za-z0-9\-_/]*$/.test(returnToRaw) ? returnToRaw : null
  const nonBillablePreset = preset === 'non_billable'

  // Dedicated flow: record a loan repayment RECEIVED (sub → HV).
  if (mode === 'loan_repayment') {
    // The loans and banks Receipt's Loan repayment dialog lists too (_lib/receivable-loans).
    const { loans, banks } = await loadReceivableLoans(supabase)

    return (
      <div>
        <Link href="/payments/new?mode=receipt" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Back to Receipt</Link>
        <div className="page-head">
          <div>
            <div className="page-eyebrow"><em>I.</em> TREASURY · OFFICIAL RECEIPT · LOAN REPAYMENT</div>
            <h1 className="page-title">收到 Loan 还款</h1>
          </div>
        </div>
        <LoanRepaymentReceivedForm loans={loans} bankAccounts={banks} />
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
