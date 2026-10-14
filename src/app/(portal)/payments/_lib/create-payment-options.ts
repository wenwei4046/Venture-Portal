import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/coa'
import { officeMonth, officeToday } from '@/lib/office-time'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { paymentPoolOptions, registryPoolOptions, type PoolOption } from '@/lib/payment-pools'
import { listPayableFundSources, type PayableFundSource } from '../../fund-in/actions'

// What the Create payment dialog offers (2026-10-14, the Finance revamp v2 —
// D07): the form page's lists, read when the dialog is asked for, never with
// every visit to Payments. The same reads `/payments/new` makes.

export interface CreatePaymentOptions {
  /** "HV-PV-202610" — the dialog's line under its title. */
  prefix: string
  /** The office's today — the payment date's default and the calendar's ring. */
  today: string
  companies: Array<{ id: string; name: string; short_code: string }>
  banks: Array<{ id: string; bank_name: string; account_number: string; current_balance: number }>
  /** The accounts a voucher line may post to: active, no header (an account with children). */
  accounts: Array<{ code: string; name: string; type: AccountType }>
  pools: PoolOption[]
  /** What HV owes and may repay — the loan repayment's deals. */
  fundSources: PayableFundSource[]
}

/** Header accounts (some other account's parent) take no postings — AccountPicker's rule. */
export function postableAccounts<A extends { code: string; parent_code: string | null }>(rows: A[]): A[] {
  const headers = new Set(rows.map((a) => a.parent_code).filter((c): c is string => !!c))
  return rows.filter((a) => !headers.has(a.code))
}

export async function loadCreatePaymentOptions(supabase: Awaited<ReturnType<typeof createClient>>): Promise<CreatePaymentOptions> {
  const [{ data: companies }, { data: banks }, { data: accounts }, fundSources, registry] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).order('code'),
    listPayableFundSources().catch(() => [] as PayableFundSource[]),
    fetchDeptRegistry(supabase).catch(() => []),
  ])
  return {
    prefix: `HV-PV-${officeMonth().replace('-', '')}`,
    today: officeToday(),
    companies: (companies ?? []).map((c) => ({ id: c.id as string, name: c.name as string, short_code: (c.short_code as string | null) ?? '' })),
    banks: (banks ?? []).map((b) => ({
      id: b.id as string,
      bank_name: b.bank_name as string,
      account_number: (b.account_number as string | null) ?? '',
      current_balance: Number(b.current_balance ?? 0),
    })),
    accounts: postableAccounts(
      (accounts ?? []).map((a) => ({
        code: a.code as string,
        name: a.name as string,
        type: a.type as AccountType,
        parent_code: (a as { parent_code: string | null }).parent_code ?? null,
      })),
    ).map(({ code, name, type }) => ({ code, name, type })),
    pools: paymentPoolOptions(registryPoolOptions(registry)),
    fundSources,
  }
}
