import Link from 'next/link'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/coa'
import NewPaymentForm from '../_components/NewPaymentForm'
import LoanRepaymentReceivedForm from '../_components/LoanRepaymentReceivedForm'
import { loadReceivableLoans } from '../_lib/receivable-loans'
import { listPayableFundSources } from '../../fund-in/actions'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { registryPoolOptions } from '@/lib/payment-pools'
import { readInvoicePreset, readRefundPreset, type InvoicePreset, type RefundPreset } from '../_lib/invoice-presets'

// Settlement routing: when a sub pays an invoice, the money logically lands
// in the dept pool that generated the service — `readInvoicePreset` asks the
// canonical map in cfo-reports.ts (invoicePoolForBillingMode), so the same
// lookup drives both the settle-invoice pool prefill AND the income-statement
// aggregation. The invoice's presets are read in `_lib/invoice-presets` — the
// Finance phone app's sheets read them too (2026-10-16).

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

  // Settling an invoice still owed, or refunding a paid one (2026-08-24): what the form starts from.
  const invoicePreset: InvoicePreset | null = invoiceId ? await readInvoicePreset(supabase, invoiceId) : null
  const refundPreset: RefundPreset | null = mode === 'refund' && invoiceId && !invoicePreset ? await readRefundPreset(supabase, invoiceId) : null

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
