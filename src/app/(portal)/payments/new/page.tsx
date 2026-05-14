import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/coa'
import NewPaymentForm from '../_components/NewPaymentForm'
import { listPayableFundSources } from '../../fund-in/actions'
import { invoicePoolForBillingMode } from '@/lib/cfo-reports'

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
  searchParams: Promise<{ invoice_id?: string; preset?: string }>
}

export default async function NewPaymentPage({ searchParams }: Props) {
  await requireRole(['finance'])
  const supabase = await createClient()

  const { invoice_id: invoiceId, preset } = await searchParams
  const nonBillablePreset = preset === 'non_billable'

  const [
    { data: companies },
    { data: bankAccounts },
    { data: accountRows },
    payableFundSources,
  ] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code, is_active')
      .eq('is_active', true)
      .order('type')
      .order('sort_order')
      .order('code'),
    listPayableFundSources().catch(() => []),
  ])

  let invoicePreset: {
    id: string
    invoice_no: string | null
    company_id: string | null
    company_name: string
    total_amount: number
    period_month: string
    billing_mode: string
    target_pool: string
  } | null = null

  if (invoiceId) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, invoice_no, company_id, total_amount, period_month, billing_mode, status, companies(name)')
      .eq('id', invoiceId)
      .single()

    if (inv && inv.status !== 'paid' && inv.status !== 'paid_via_netting') {
      const company = (inv.companies as { name: string } | null) ?? null
      invoicePreset = {
        id: inv.id,
        invoice_no: inv.invoice_no,
        company_id: inv.company_id, // may be null for non-subsidiary invoices (Item 5)
        company_name: company?.name ?? '—',
        total_amount: Number(inv.total_amount),
        period_month: inv.period_month,
        billing_mode: inv.billing_mode,
        target_pool: poolForBillingMode(inv.billing_mode),
      }
    }
  }

  const headingTitle = invoicePreset
    ? 'Settle invoice'
    : nonBillablePreset
      ? 'Non-billable expense'
      : 'Create payment'

  const headingEyebrow = invoicePreset
    ? 'PAYMENT VOUCHER · SETTLE INVOICE'
    : nonBillablePreset
      ? 'PAYMENT VOUCHER · NON-BILLABLE'
      : 'PAYMENT VOUCHER · NEW'

  return (
    <div>
      <Link
        href={invoicePreset ? '/billing' : '/payments'}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to {invoicePreset ? 'Billing' : 'Payments'}
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {headingEyebrow}
          </div>
          <h1 className="page-title">{headingTitle}</h1>
        </div>
      </div>

      <NewPaymentForm
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
        payableFundSources={payableFundSources}
      />
    </div>
  )
}
