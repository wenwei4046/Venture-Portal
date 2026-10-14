import type { SupabaseClient } from '@supabase/supabase-js'
import { officeToday } from '@/lib/office-time'
import { bsAccountsForDisbursement, type BsAccountOption } from '@/lib/loan-disbursement'

// What a new loan chooses from (moved from the form page, 2026-10-15, so the
// hub's *Create fund out* reads exactly what /fund-out/new reads): the active
// companies, the quarter's approved base rate, the balance-sheet accounts a
// disbursement may be booked to, and the active banks (the primary first).

export interface NewLoanOptions {
  companies: Array<{ id: string; name: string; short_code: string }>
  baseRate: { rate: number; quarter: string } | null
  bsAccounts: BsAccountOption[]
  banks: Array<{ id: string; bank_name: string; account_number: string; current_balance: number; is_primary: boolean }>
}

export async function loadNewLoanOptions(supabase: SupabaseClient): Promise<NewLoanOptions> {
  const [{ data: companyRows }, { data: baseRateRow }, { data: acctRows }, { data: bankRows }] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('short_code'),
    supabase
      .from('base_rate_history')
      .select('base_rate, quarter, effective_from')
      .not('approved_at', 'is', null)
      .lte('effective_from', officeToday())
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('chart_of_accounts').select('code, name, type, parent_code, is_active').eq('is_active', true).order('type').order('code'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
  ])

  const base = baseRateRow as { base_rate: number | string; quarter: string } | null
  return {
    companies: ((companyRows ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map((c) => ({ id: c.id, name: c.name, short_code: c.short_code ?? '' })),
    baseRate: base ? { rate: Number(base.base_rate), quarter: base.quarter } : null,
    bsAccounts: bsAccountsForDisbursement(
      ((acctRows ?? []) as Array<{ code: string; name: string; type: string; parent_code: string | null; is_active: boolean }>).map((r) => ({
        code: r.code,
        name: r.name,
        account_type: r.type,
        parent_code: r.parent_code ?? null,
        is_active: r.is_active,
      })),
    ),
    banks: ((bankRows ?? []) as Array<{ id: string; bank_name: string; account_number: string; current_balance: number | null; is_primary: boolean | null }>).map((b) => ({
      id: b.id,
      bank_name: b.bank_name,
      account_number: b.account_number,
      current_balance: Number(b.current_balance ?? 0),
      is_primary: !!b.is_primary,
    })),
  }
}
