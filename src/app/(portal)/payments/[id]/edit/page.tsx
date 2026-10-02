import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { canSeePayrollPayouts } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
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
  const user = await requirePermission('treasury')
  const { id } = await params
  const supabase = await createClient()

  const { data: voucher } = await supabase
    .from('payment_vouchers')
    .select('*')
    .eq('id', id)
    .single()

  if (!voucher) notFound()
  // As on the voucher's own page: payroll does not open without Payroll payouts.
  if (isPayrollReference(voucher.reference_type) && !canSeePayrollPayouts(user)) notFound()

  // Only editable in draft / pending_approval — otherwise bounce back to detail
  if (voucher.status !== 'pending_approval' && voucher.status !== 'draft') {
    redirect(`/payments/${id}`)
  }

  const { data: statutoryCoverage, error: coverageError } = voucher.reference_type === 'payroll_statutory'
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('payroll_statutory_voucher_lines').select('id').eq('voucher_id', id).limit(1)
    : { data: [], error: null }
  if (coverageError) throw new Error('Unable to verify the recorded statutory contributions. Please refresh and try again.')
  const statutoryDetailsLocked = (statutoryCoverage?.length ?? 0) > 0
  const { data: salaryCoverage, error: salaryCoverageError } = voucher.reference_type === 'payroll_disbursement'
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('payroll_voucher_lines').select('id').eq('voucher_id', id).limit(1)
    : { data: [], error: null }
  if (salaryCoverageError) throw new Error('Unable to verify the recorded salary payment details. Please refresh and try again.')
  const salaryDetailsLocked = (salaryCoverage?.length ?? 0) > 0

  const [
    { data: sources },
    { data: companies },
    { data: bankAccounts },
    { data: glAccounts },
    { data: fundSourceRow },
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
    // The lender's own GL account — the repayment form's principal row
    // defaults to it (lib/repayment-source-rows).
    voucher.fund_source_id
      ? supabase.from('fund_sources').select('account_code').eq('id', voucher.fund_source_id).maybeSingle()
      : Promise.resolve({ data: null }),
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
            {statutoryDetailsLocked || salaryDetailsLocked
              ? 'Only payment date and notes can be edited. Payment details are recorded with this voucher.'
              : 'Editing locked once Principal approves. Voucher type, direction, voucher number, and any linked invoice / loan / fund source are immutable.'}
          </p>
        </div>
      </div>

      <EditPaymentForm
        statutoryDetailsLocked={statutoryDetailsLocked}
        salaryDetailsLocked={salaryDetailsLocked}
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
        fundSourceAccount={(fundSourceRow as { account_code: string | null } | null)?.account_code ?? null}
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
