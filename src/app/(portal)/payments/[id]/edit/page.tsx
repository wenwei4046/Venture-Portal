import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import EditPaymentForm from './_components/EditPaymentForm'

interface Props {
  params: Promise<{ id: string }>
}

import type { AccountType } from '@/lib/coa'

interface SourceRow {
  pool: string
  amount: string
  account_code: string
  override_account_type?: AccountType | ''
  override_gl_account_code?: string
  override_reason?: string
}

export default async function EditPaymentPage({ params }: Props) {
  await requirePermission('treasury')
  const { id } = await params
  const supabase = await createClient()

  const { data: voucher } = await supabase
    .from('payment_vouchers')
    .select('*')
    .eq('id', id)
    .single()

  if (!voucher) notFound()

  // Only editable in draft / pending_approval — otherwise bounce back to detail
  if (voucher.status !== 'pending_approval' && voucher.status !== 'draft') {
    redirect(`/payments/${id}`)
  }

  const [
    { data: sources },
    { data: companies },
    { data: bankAccounts },
    { data: glAccounts },
  ] = await Promise.all([
    supabase
      .from('payment_voucher_sources')
      .select('pool, amount, account_code, override_account_type, override_gl_account_code, override_reason')
      .eq('voucher_id', id)
      .order('amount', { ascending: false }),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    // Post-mig 238: chart_of_accounts IS the GL. Pull every active account
    // for the source-row picker; downstream the form filters as needed.
    supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).order('code'),
  ])

  const sourceRows: SourceRow[] = (sources ?? []).map((s) => ({
    pool: s.pool,
    amount: Number(s.amount).toFixed(2),
    account_code: s.account_code ?? '',
    override_account_type: (s.override_account_type as AccountType | null) ?? '',
    override_gl_account_code: s.override_gl_account_code ?? '',
    override_reason: s.override_reason ?? '',
  }))

  // For credit vouchers, pull the single source row's account as the
  // initial account_code (mig 205 backfilled one row per credit voucher).
  const initialCreditAccountCode = voucher.direction === 'credit' && sources && sources.length > 0
    ? sources[0].account_code ?? null
    : null

  return (
    <div>
      <Link href={`/payments/${id}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to voucher
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {voucher.direction === 'credit' ? 'OFFICIAL RECEIPT' : 'PAYMENT VOUCHER'} · EDIT
          </div>
          <h1 className="page-title">Edit {voucher.voucher_no ?? 'draft'}</h1>
          <p className="font-serif italic text-graphite text-sm mt-2">
            Editing locked once Principal approves. Voucher type, direction, voucher number, and any linked invoice / loan / fund source are immutable.
          </p>
        </div>
      </div>

      <EditPaymentForm
        voucher={{
          id: voucher.id,
          voucher_no: voucher.voucher_no,
          voucher_type: voucher.voucher_type,
          direction: voucher.direction as 'debit' | 'credit',
          amount: Number(voucher.amount),
          payee_name: voucher.payee_name,
          payee_company_id: voucher.payee_company_id,
          bank_account_id: voucher.bank_account_id,
          description: voucher.description ?? '',
          notes: voucher.notes,
          payment_method: voucher.payment_method,
          payment_date: voucher.payment_date,
          target_pool: voucher.target_pool,
          fund_source_id: voucher.fund_source_id,
          loan_id: voucher.loan_id,
          repayment_breakdown: voucher.repayment_breakdown as { principal: number; interest: number; penalty: number } | null,
        }}
        initialSources={sourceRows}
        initialCreditAccountCode={initialCreditAccountCode}
        companies={companies ?? []}
        bankAccounts={bankAccounts ?? []}
        glAccounts={(glAccounts ?? []).map((g) => ({
          code: g.code,
          name: g.name,
          type: g.type as AccountType,
          parent_code: (g as { parent_code: string | null }).parent_code ?? null,
        }))}
      />
    </div>
  )
}
