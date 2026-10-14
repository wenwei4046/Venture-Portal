import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountType } from '@/lib/coa'
import type { AccountOption } from '@/components/AccountPicker'

// What a new fund source chooses from (moved from the form page, 2026-10-15,
// so the hub's *Record fund in* reads exactly what /fund-in/new reads): the
// active companies, the departments (never the internal 'Venture Office'), the
// liability and equity accounts a deposit may be booked to, and the active
// banks (the primary first). A director loan and an outsource name their
// party in words (Item 4) — no directors to read.

export interface NewSourceOptions {
  companies: Array<{ id: string; name: string; short_code: string }>
  departments: Array<{ id: string; name: string }>
  accounts: AccountOption[]
  banks: Array<{ id: string; bank_name: string; account_number: string; is_primary: boolean }>
}

export async function loadNewSourceOptions(supabase: SupabaseClient): Promise<NewSourceOptions> {
  const [{ data: companyRows }, { data: deptRows }, { data: acctRows }, { data: bankRows }] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('short_code'),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a fund source.
    supabase.from('departments').select('id, name').eq('is_internal', false).order('name'),
    supabase.from('chart_of_accounts').select('code, name, type, parent_code, is_active').eq('is_active', true).in('type', ['liability', 'equity']).order('code'),
    // Which HV bank receives the deposit (primary first = the default).
    supabase.from('bank_accounts').select('id, bank_name, account_number, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
  ])

  return {
    companies: ((companyRows ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map((c) => ({ id: c.id, name: c.name, short_code: c.short_code ?? '' })),
    departments: (deptRows ?? []) as Array<{ id: string; name: string }>,
    accounts: ((acctRows ?? []) as Array<{ code: string; name: string; type: string; parent_code: string | null; is_active: boolean }>).map((a) => ({
      code: a.code,
      name: a.name,
      type: a.type as AccountType,
      parent_code: a.parent_code ?? null,
      is_active: a.is_active,
    })),
    banks: ((bankRows ?? []) as Array<{ id: string; bank_name: string; account_number: string | null; is_primary: boolean | null }>).map((b) => ({
      id: b.id,
      bank_name: b.bank_name,
      account_number: b.account_number ?? '',
      is_primary: !!b.is_primary,
    })),
  }
}
