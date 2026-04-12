import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import NewPaymentForm from '../_components/NewPaymentForm'

export default async function NewPaymentPage() {
  await requireRole(['finance'])
  const supabase = await createClient()

  const [
    { data: companies },
    { data: bankAccounts },
    { data: activeFundSources },
    { data: activeLoans },
    { data: categories },
    { data: departments },
  ] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    supabase.from('fund_sources').select('id, source_type, amount, from_company_id, from_director_id').in('status', ['active', 'matured']).order('effective_date', { ascending: false }),
    supabase.from('loans').select('id, company_id, principal').eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('payment_categories').select('code, label').eq('is_active', true).order('sort_order'),
    supabase.from('departments').select('id, name').order('name'),
  ])

  return (
    <div>
      <div className="mb-10">
        <Link
          href="/payments"
          className="text-sm text-muted hover:text-accent font-sans transition-colors"
        >
          ← Back to Payments
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-3">Create payment</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Every bank transfer, expense, repayment, or claim payout goes through a payment voucher.
          Principal must approve before execution.
        </p>
      </div>

      <NewPaymentForm
        companies={companies ?? []}
        bankAccounts={bankAccounts ?? []}
        fundSources={activeFundSources ?? []}
        loans={activeLoans ?? []}
        categories={categories ?? []}
        departments={departments ?? []}
      />
    </div>
  )
}
