import type { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/coa'
import { canSeePayrollPayouts } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { registryPoolOptions, type PoolOption } from '@/lib/payment-pools'
import type { User } from '@/types'

// What a voucher's Edit reads (2026-10-16 — lifted out of
// `/payments/[id]/edit` word for word, so the Finance phone app's Edit sheet
// reads the same): the voucher (payroll only for Payroll payouts' holders, only
// a draft or one waiting for approval), whether its payroll lines lock its
// figures, its source rows, and the lists the form chooses from.

type Client = Awaited<ReturnType<typeof createClient>>

export interface EditSourceRow {
  pool: string
  amount: string
  account_code: string
  /** The line's own words (2026-10-22). */
  description?: string
  override_account_type?: AccountType | ''
  override_gl_account_code?: string
  override_reason?: string
}

export interface EditVoucher {
  id: string
  voucher_no: string | null
  voucher_type: string
  direction: 'debit' | 'credit'
  amount: number
  payee_name: string
  payee_company_id: string | null
  bank_account_id: string | null
  description: string
  notes: string | null
  payment_method: string | null
  payment_date: string | null
  target_pool: string | null
  fund_source_id: string | null
  loan_id: string | null
  repayment_breakdown: { principal: number; interest: number; penalty: number } | null
}

export interface VoucherEditData {
  /** Contribution snapshots lock the financial details of a statutory PV. */
  statutoryDetailsLocked: boolean
  /** Salary snapshots preserve the component amounts and receiving accounts. */
  salaryDetailsLocked: boolean
  voucher: EditVoucher
  initialSources: EditSourceRow[]
  extraPools: PoolOption[]
  /** The lender's own GL account — a repayment's principal row defaults to it. */
  fundSourceAccount: string | null
  initialCreditAccountCode: string | null
  companies: Array<{ id: string; name: string; short_code: string }>
  bankAccounts: Array<{ id: string; bank_name: string; account_number: string; current_balance: number }>
  glAccounts: Array<{ code: string; name: string; type: AccountType; parent_code: string | null }>
}

/** Missing (or not this reader's to see), or no longer editable (approved, paid, voided). */
export type VoucherEditRead = { ok: true; data: VoucherEditData } | { ok: false; reason: 'missing' | 'locked' }

export async function readVoucherEdit(supabase: Client, user: User, id: string): Promise<VoucherEditRead> {
  const { data: voucher } = await supabase
    .from('payment_vouchers')
    .select('*')
    .eq('id', id)
    .single()

  if (!voucher) return { ok: false, reason: 'missing' }
  // As on the voucher's own page: payroll does not open without Payroll payouts.
  if (isPayrollReference(voucher.reference_type) && !canSeePayrollPayouts(user)) return { ok: false, reason: 'missing' }

  // Only editable in draft / pending_approval — otherwise bounce back to detail
  if (voucher.status !== 'pending_approval' && voucher.status !== 'draft') return { ok: false, reason: 'locked' }

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
    deptRegistry,
  ] = await Promise.all([
    supabase
      .from('payment_voucher_sources')
      .select('pool, amount, account_code, description, override_account_type, override_gl_account_code, override_reason')
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
    // The departments beyond the core five have pools of their own; the form's
    // list is built from this, as Create payment's is.
    fetchDeptRegistry(supabase).catch(() => []),
  ])

  const initialSources: EditSourceRow[] = (sources ?? []).map((s) => ({
    pool: s.pool,
    amount: Number(s.amount).toFixed(2),
    account_code: s.account_code ?? '',
    description: s.description ?? '',
    override_account_type: (s.override_account_type as AccountType | null) ?? '',
    override_gl_account_code: s.override_gl_account_code ?? '',
    override_reason: s.override_reason ?? '',
  }))

  // For credit vouchers, pull the single source row's account as the
  // initial account_code (mig 205 backfilled one row per credit voucher).
  const initialCreditAccountCode = voucher.direction === 'credit' && sources && sources.length > 0 ? sources[0].account_code ?? null : null

  return {
    ok: true,
    data: {
      statutoryDetailsLocked,
      salaryDetailsLocked,
      voucher: {
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
      },
      initialSources,
      extraPools: registryPoolOptions(deptRegistry),
      fundSourceAccount: (fundSourceRow as { account_code: string | null } | null)?.account_code ?? null,
      initialCreditAccountCode,
      companies: (companies ?? []) as Array<{ id: string; name: string; short_code: string }>,
      bankAccounts: (bankAccounts ?? []).map((b) => ({ id: b.id as string, bank_name: b.bank_name as string, account_number: (b.account_number as string | null) ?? '', current_balance: Number(b.current_balance ?? 0) })),
      glAccounts: (glAccounts ?? []).map((g) => ({
        code: g.code,
        name: g.name,
        type: g.type as AccountType,
        parent_code: (g as { parent_code: string | null }).parent_code ?? null,
      })),
    },
  }
}
