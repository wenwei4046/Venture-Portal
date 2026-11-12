// Resolve the per-borrower COA leaf code for posting Loans Receivable
// journal lines. The COA convention introduced when the user reorganized
// `3020 Loans Receivable` into a header with per-party children:
//
//   3020 Loans Receivable          (header — never posted to)
//     3051 Amount Due From - <borrower short_code>
//     3052 Amount Due From - <borrower short_code>
//     ...
//
// Both loan disbursement (`approvals/actions.ts`) and loan repayment
// (`fund-out/actions.ts`) used to hardcode `'3020'` for the receivable
// side of the JE. After mig 256 added a header-rejection trigger on
// `journal_lines`, those posts fail at the DB layer — this helper resolves
// the correct leaf so the JE lands cleanly.

import type { SupabaseClient } from './voucher-paid-helpers'

/**
 * Given a loan id, return the `chart_of_accounts.code` for that borrower's
 * Loans Receivable leaf (e.g. `'3051'` for Carres). Throws with a clear,
 * user-facing message if the COA leaf hasn't been created yet — Finance
 * must add it in Settings → Accounts before retrying the approval / repayment.
 */
/** Default account the interest leg of a repayment credits. */
export const INTEREST_INCOME_CODE = '5027'
/** Header of the per-borrower Interest-in-Suspense receivable family. */
export const INTEREST_SUSPENSE_PARENT = '3060'

/**
 * The borrower's `3060 Interest in Suspense — Receivable` leaf, or null when
 * none exists. Used when interest was carved out of the receivable up front
 * (e.g. the 300k back-to-back: a manual JV moved the whole term's interest
 * from 3053 into 3063), so collecting it draws the suspense down instead of
 * recognising income twice.
 */
export async function resolveInterestSuspenseLeaf(
  supabase: SupabaseClient,
  loanId: string,
): Promise<string | null> {
  const { data: loan } = await supabase
    .from('loans')
    .select('company_id')
    .eq('id', loanId)
    .maybeSingle()
  if (!loan?.company_id) return null

  const { data: borrower } = await supabase
    .from('companies')
    .select('name, short_code')
    .eq('id', loan.company_id)
    .maybeSingle()
  if (!borrower) return null

  const { data: coa } = await supabase
    .from('chart_of_accounts')
    .select('code')
    .eq('parent_code', INTEREST_SUSPENSE_PARENT)
    .eq('is_active', true)
    .or(`name.ilike.%${borrower.name}%,name.ilike.%${borrower.short_code}%`)
    .maybeSingle()
  return coa?.code ?? null
}

/**
 * Interest in suspense, one account per deal (2026-11-13, mig 20261113140000): a deal's own account is a four-digit
 * code in its range — a loan in suspense 3100-3399 (not: 3400-3499), a fund source in suspense 4300-4599 (not:
 * 4600-4699). In suspense, a repayment's interest comes off the deal's own account too; the month-end run moves it
 * from IIS into 5027 / 6000.
 */
export const isLoanSuspenseAccount = (code: string | null | undefined): boolean => !!code && code >= '3100' && code <= '3399'
export const isFundSuspenseAccount = (code: string | null | undefined): boolean => !!code && code >= '4300' && code <= '4599'

/** Gives a deal its own accounts once IIS is live (ensure_deal_accounts — a no-op before the go-live). */
export async function ensureDealAccounts(supabase: SupabaseClient, kind: 'loan' | 'fund_source', id: string): Promise<void> {
  const { error } = await supabase.rpc('ensure_deal_accounts' as never, { p_kind: kind, p_id: id } as never)
  if (error) throw new Error(`The deal's own account could not be made: ${error.message}`)
}

/** Where a repayment's interest is credited: the loan's own account while it is in suspense, else null (5027). */
export async function loanSuspenseCredit(supabase: SupabaseClient, loanId: string): Promise<string | null> {
  const { data } = await supabase.from('loans').select('gl_account_code').eq('id', loanId).maybeSingle()
  const code = (data as { gl_account_code?: string | null } | null)?.gl_account_code ?? null
  return isLoanSuspenseAccount(code) ? code : null
}

export async function resolveLoansReceivableLeaf(
  supabase: SupabaseClient,
  loanId: string,
): Promise<string> {
  // gl_account_code postdates database.types.ts — the row is read whole and taken as what it holds.
  const { data: loanRow, error: lErr } = await supabase.from('loans').select('*').eq('id', loanId).maybeSingle()
  const loan = loanRow as { company_id: string; gl_account_code?: string | null } | null
  if (lErr) throw new Error(`resolveLoansReceivableLeaf: loan lookup failed — ${lErr.message}`)
  if (!loan) throw new Error(`resolveLoansReceivableLeaf: loan ${loanId} not found`)
  // The deal's own account once it has one (IIS).
  const own = loan.gl_account_code
  if (own) return own

  const { data: borrower, error: bErr } = await supabase
    .from('companies')
    .select('name, short_code')
    .eq('id', loan.company_id)
    .maybeSingle()
  if (bErr) throw new Error(`resolveLoansReceivableLeaf: borrower lookup failed — ${bErr.message}`)
  if (!borrower) throw new Error(`resolveLoansReceivableLeaf: borrower company ${loan.company_id} not found`)

  // Match any child of 3020 whose name contains the company name or short_code —
  // tolerates both naming conventions ("Amount due from - Carres" or "Amount Due From - CAR").
  const { data: coa, error: cErr } = await supabase
    .from('chart_of_accounts')
    .select('code')
    .eq('type', 'asset')
    .eq('parent_code', '3020')
    .or(`name.ilike.%${borrower.name}%,name.ilike.%${borrower.short_code}%`)
    .maybeSingle()
  if (cErr) throw new Error(`resolveLoansReceivableLeaf: COA lookup failed — ${cErr.message}`)
  if (!coa?.code) {
    throw new Error(
      `No COA leaf for borrower "${borrower.name}" under 3020 Loans Receivable. ` +
      `Create it in Settings → Accounts (name: "Amount due from - ${borrower.name}", type: asset, parent: 3020), ` +
      `then retry.`,
    )
  }
  return coa.code
}
