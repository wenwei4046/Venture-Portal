import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import NewPaymentForm from '../_components/NewPaymentForm'
import { listPayableFundSources } from '../../fund-in/actions'

// Settlement routing: when a sub pays an invoice, the money logically lands
// in the dept pool that generated the service (marketing contracts → Marketing
// Pool, director OPEX → Director / Director Office Pool). Unknown modes fall
// back to Venture Pool.
function poolForBillingMode(mode: string): string {
  switch (mode) {
    case 'marketing_project':
      return 'dept_pool_marketing'
    case 'director_attribution':
      return 'dept_pool_director'
    case 'director_office_attribution':
      return 'dept_pool_director_office'
    default:
      return 'venture_pool'
  }
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
    { data: categories },
    { data: glAccounts },
    payableFundSources,
  ] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    supabase.from('payment_categories').select('code, label, account_type, gl_account_code').eq('is_active', true).order('sort_order'),
    supabase.from('chart_of_accounts').select('code, name, type').eq('is_active', true).order('code'),
    listPayableFundSources().catch(() => []),
  ])

  let invoicePreset: {
    id: string
    invoice_no: string | null
    company_id: string
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
        company_id: inv.company_id,
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
        categories={(categories ?? []).map((c) => ({
          code: c.code,
          label: c.label,
          account_type: c.account_type as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | null,
          gl_account_code: c.gl_account_code,
        }))}
        glAccounts={(glAccounts ?? []).map((g) => ({
          code: g.code,
          name: g.name,
          type: g.type as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
        }))}
        invoicePreset={invoicePreset}
        nonBillablePreset={nonBillablePreset}
        payableFundSources={payableFundSources}
      />
    </div>
  )
}
