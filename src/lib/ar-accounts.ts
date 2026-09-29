// src/lib/ar-accounts.ts
// Which receivable account a customer's invoices and receipts post to.
//
// 3030 "Accounts Receivable - Subs" used to be one pooled account, so the
// reports could only ever show a single AR figure (user 2026-09-29: "account
// receivable 我看不到 detail 是吗" → "做2，本身就应该要有顾客 maintenance 的
// 层面"). It now has a child per customer, and because the header guard blocks
// posting to an account with children, every posting path has to resolve the
// customer's account first.
//
// The rule lives in SQL (`ar_account_code_for`, mig 20260929010000) so the
// receipt-approval functions and this code cannot drift: the company's own
// `companies.ar_account_code` → the internal account for a dept-pool recharge
// → AR - Other for an external name → plain 3030 while the split has not
// happened yet.
import type { SupabaseClient } from '@supabase/supabase-js'

/** The family head. Never post to it once it has children. */
export const AR_PARENT = '3030'

export interface ArParty {
  companyId?: string | null
  departmentId?: string | null
  freetext?: string | null
  /** When the money settles an invoice, that invoice names the customer. */
  invoiceId?: string | null
}

/** The account this party's receivable belongs on. Falls back to 3030. */
export async function resolveArGlCode(
  supabase: SupabaseClient,
  party: ArParty,
): Promise<string> {
  if (party.invoiceId) {
    const { data } = await supabase.rpc('ar_account_for_invoice' as never, {
      p_invoice_id: party.invoiceId,
    } as never)
    const code = data as unknown as string | null
    if (code) return code
  }
  const { data } = await supabase.rpc('ar_account_code_for' as never, {
    p_company_id: party.companyId ?? null,
    p_department_id: party.departmentId ?? null,
    p_freetext: party.freetext ?? null,
  } as never)
  return (data as unknown as string | null) ?? AR_PARENT
}

/** A parent plus every account filed under it — what a report should sum when
 *  it means "Accounts Receivable" or "Loans Receivable". Reading the parent
 *  alone returns zero once the postings moved to the children. */
export async function accountFamily(
  supabase: SupabaseClient,
  parentCode: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('code')
    .eq('parent_code', parentCode)
  const children = ((data ?? []) as Array<{ code: string }>).map((r) => r.code)
  return [parentCode, ...children]
}
