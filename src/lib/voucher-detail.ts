import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase/database.types'

type Supabase = SupabaseClient<Database>

export interface VoucherDetailContext {
  voucher: Record<string, unknown> & {
    id: string
    voucher_no: string | null
    voucher_type: string
    status: string
    direction: string | null
    amount: string | number
    currency: string
    payee_name: string
    payee_company_id: string | null
    bank_account_id: string | null
    reference_type: string | null
    reference_id: string | null
    description: string
    notes: string | null
    payment_method: string
    payment_date: string | null
    source_pool: string | null
    target_pool: string | null
    category_code: string | null
    approved_at: string | null
    executed_at: string | null
    created_at: string
    updated_at: string
    created_by: string
    approved_by: string | null
    payment_reference: string | null
  }
  sources: Array<{ pool: string; amount: string | number }>
  attachments: Array<{
    id: string
    file_name: string
    file_type: string
    file_size: number | null
    storage_path: string
    description: string | null
    uploaded_at: string
    uploaded_by: string
  }>
  bank: { id: string; bank_name: string; account_number: string; current_balance: number } | null
  payeeCompany: { name: string; short_code: string } | null
  createdByName: string | null
  approvedByName: string | null
  categoryLabel: string | null
}

export async function getVoucherDetailContext(
  supabase: Supabase,
  voucherId: string,
): Promise<VoucherDetailContext | null> {
  const { data: voucher, error } = await supabase
    .from('payment_vouchers')
    .select('*, payment_categories(label)')
    .eq('id', voucherId)
    .single()

  if (error || !voucher) return null

  const categoryLabel =
    (voucher.payment_categories as { label: string } | null)?.label ??
    (voucher.category_code ? voucher.category_code.replace(/_/g, ' ') : null)

  const [sourcesRes, attachmentsRes, bankRes, payeeRes, createdByRes, approvedByRes] =
    await Promise.all([
      supabase
        .from('payment_voucher_sources')
        .select('pool, amount')
        .eq('voucher_id', voucherId)
        .order('amount', { ascending: false }),
      supabase
        .from('payment_attachments')
        .select('id, file_name, file_type, file_size, storage_path, description, uploaded_at, uploaded_by')
        .eq('voucher_id', voucherId)
        .order('uploaded_at', { ascending: false }),
      voucher.bank_account_id
        ? supabase
            .from('bank_accounts')
            .select('id, bank_name, account_number, current_balance')
            .eq('id', voucher.bank_account_id)
            .single()
        : Promise.resolve({ data: null }),
      voucher.payee_company_id
        ? supabase
            .from('companies')
            .select('name, short_code')
            .eq('id', voucher.payee_company_id)
            .single()
        : Promise.resolve({ data: null }),
      supabase.from('users').select('name').eq('id', voucher.created_by).single(),
      voucher.approved_by
        ? supabase.from('users').select('name').eq('id', voucher.approved_by).single()
        : Promise.resolve({ data: null }),
    ])

  const bankRaw = bankRes.data as
    | { id: string; bank_name: string; account_number: string; current_balance: string | number }
    | null
  const bank = bankRaw
    ? { ...bankRaw, current_balance: Number(bankRaw.current_balance) }
    : null

  return {
    voucher: voucher as VoucherDetailContext['voucher'],
    sources: (sourcesRes.data ?? []) as VoucherDetailContext['sources'],
    attachments: (attachmentsRes.data ?? []) as VoucherDetailContext['attachments'],
    bank,
    payeeCompany: (payeeRes.data as VoucherDetailContext['payeeCompany']) ?? null,
    createdByName: (createdByRes.data as { name: string } | null)?.name ?? null,
    approvedByName: (approvedByRes.data as { name: string } | null)?.name ?? null,
    categoryLabel,
  }
}

export const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing Dept Pool',
  dept_pool_finance: 'Finance Dept Pool',
  dept_pool_hr: 'HR Dept Pool',
  dept_pool_director_office: 'Director Office Dept Pool',
  invoice_payout_pool: 'Invoice Payout Pool',
}

export function formatPoolLabel(pool: string | null | undefined): string | null {
  if (!pool) return null
  return POOL_LABELS[pool] ?? pool.replace(/_/g, ' ')
}

export function formatSourcesLabel(
  sources: VoucherDetailContext['sources'],
  fallbackSourcePool: string | null | undefined,
): string | null {
  if (sources.length > 0) {
    return sources.map((s) => formatPoolLabel(s.pool) ?? s.pool).join(' + ')
  }
  return formatPoolLabel(fallbackSourcePool ?? null)
}
