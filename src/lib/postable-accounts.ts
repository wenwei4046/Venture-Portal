// src/lib/postable-accounts.ts
// Which accounts take no posting: a header — an account with sub-accounts
// (coa_is_header). The database refuses a voucher line on one
// (pvs_reject_header_account), so a write checks its lines here BEFORE it
// writes anything (2026-10-22): refused after the voucher was in, the line left
// half a voucher behind — a blank draft, or a receipt received with no line.
// 3030 Accounts Receivable - Subs has been one since AR was split by customer,
// and it is what a customer with no receivable account of its own falls back to.
import type { SupabaseClient } from '@supabase/supabase-js'

/** The header accounts among these codes (empty when none is). */
export async function headerAccounts(
  supabase: SupabaseClient,
  codes: ReadonlyArray<string | null | undefined>,
): Promise<Set<string>> {
  const wanted = [...new Set(codes.filter((c): c is string => !!c))]
  if (wanted.length === 0) return new Set()
  const { data } = await supabase.from('chart_of_accounts').select('parent_code').in('parent_code', wanted)
  return new Set(((data ?? []) as Array<{ parent_code: string | null }>).map((a) => a.parent_code).filter((c): c is string => !!c))
}
