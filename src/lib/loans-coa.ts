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
export async function resolveLoansReceivableLeaf(
  supabase: SupabaseClient,
  loanId: string,
): Promise<string> {
  const { data: loan, error: lErr } = await supabase
    .from('loans')
    .select('company_id')
    .eq('id', loanId)
    .maybeSingle()
  if (lErr) throw new Error(`resolveLoansReceivableLeaf: loan lookup failed — ${lErr.message}`)
  if (!loan) throw new Error(`resolveLoansReceivableLeaf: loan ${loanId} not found`)

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
