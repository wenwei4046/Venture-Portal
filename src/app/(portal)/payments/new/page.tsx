import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import NewPaymentForm from '../_components/NewPaymentForm'

// Settlement routing: when a sub pays an invoice, the money logically lands
// in the dept pool that generated the service (HR OpEx → HR Pool, etc.).
// fixed_split (rent/utility) stays on Venture Pool since HV is the landlord.
function poolForBillingMode(mode: string): string {
  switch (mode) {
    case 'hr_pool_split':
      return 'dept_pool_hr'
    case 'finance_attribution':
      return 'dept_pool_finance'
    case 'marketing_project':
      return 'dept_pool_marketing'
    case 'fixed_split':
    default:
      return 'hv_operating_fund'
  }
}

interface Props {
  searchParams: Promise<{ invoice_id?: string }>
}

export default async function NewPaymentPage({ searchParams }: Props) {
  await requireRole(['finance'])
  const supabase = await createClient()

  const { invoice_id: invoiceId } = await searchParams

  const [
    { data: companies },
    { data: bankAccounts },
    { data: categories },
  ] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    supabase.from('payment_categories').select('code, label').eq('is_active', true).order('sort_order'),
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

  return (
    <div>
      <div className="mb-10">
        <Link
          href={invoicePreset ? '/billing' : '/payments'}
          className="text-sm text-muted hover:text-accent font-sans transition-colors"
        >
          ← Back to {invoicePreset ? 'Billing' : 'Payments'}
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-3">
          {invoicePreset ? 'Settle invoice' : 'Create payment'}
        </h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          {invoicePreset ? (
            <>
              Recording payment received for invoice{' '}
              <span className="font-mono text-ink">{invoicePreset.invoice_no}</span> —{' '}
              {invoicePreset.company_name} · {dayjs(invoicePreset.period_month).format('MMM YYYY')}.
              Credit voucher, auto-approved on save.
            </>
          ) : (
            <>
              Every bank transfer, expense, repayment, or claim payout goes through a payment voucher.
              Principal must approve before execution.
            </>
          )}
        </p>
      </div>

      <NewPaymentForm
        companies={companies ?? []}
        bankAccounts={bankAccounts ?? []}
        categories={categories ?? []}
        invoicePreset={invoicePreset}
      />
    </div>
  )
}
