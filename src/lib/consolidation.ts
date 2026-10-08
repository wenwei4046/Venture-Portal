// Consolidated-view elimination of inter-segment billing (user request
// 2026-07-24: "有 expense 那不是应该也有 income?这样就出两次费用了").
//
// Internal recharges post BOTH sides into the GL by design:
//   issue JE  — Dr 3030 AR / Cr income (5020 etc.) on the RECEIVING segment
//   settle JE — Dr 905x Inter-billing / Cr 3030 on the PAYING segment
// Per-segment P&Ls need both (each dept's own truth), and group Net Income is
// unaffected (the pair nets to zero). But the ALL-SEGMENTS view grosses up
// revenue AND expenses by the same internal churn — proper consolidation
// eliminates it and shows external business only.
//
// Both JEs carry the INVOICE id as their reference, so dropping every line
// whose ref_id points at an internally-billed invoice removes income + 905x +
// the offsetting AR legs in one rule. The account-code sweep is a belt for
// 905x postings that arrive via other paths (e.g. credit notes).
//
// Apply ONLY when rendering the consolidated (no-segment) P&L for
// finance/principal. Dept managers' "no segment" is NOT consolidated — RLS
// already scopes them to their own segment — so never eliminate for them.
// Balance Sheet / Trial Balance / Cash Flow stay untouched.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GlLine } from './gl-reports'
import { fetchAllRows } from './paginate'

export interface InterBillingElimination {
  /** invoices billed to internal counterparties (dept pools + directors). */
  internalInvoiceIds: Set<string>
  /** the 9050 Inter-billing account family (header + leaves). */
  interBillingCodes: Set<string>
}

export async function fetchInterBillingElimination(
  supabase: SupabaseClient,
): Promise<InterBillingElimination> {
  const [{ data: invs }, { data: codes }] = await Promise.all([
    // Every internal invoice ever billed, in 1000-row pages (2026-10-08): an
    // invoice cut by PostgREST's 1000-row cap would quietly stay in the
    // consolidated figures. A set, so the pages' order will do; a failed read
    // still eliminates nothing, as before.
    fetchAllRows((lo, hi) =>
      supabase
        .from('invoices')
        .select('id')
        .in('billable_to_type', ['dept_pool', 'director'])
        .order('id', { ascending: true })
        .range(lo, hi),
    ).then((data) => ({ data }), () => ({ data: null })),
    supabase.from('chart_of_accounts').select('code').or('code.eq.9050,parent_code.eq.9050'),
  ])
  return {
    internalInvoiceIds: new Set((invs ?? []).map((r) => r.id as string)),
    interBillingCodes: new Set((codes ?? []).map((r) => r.code as string)),
  }
}

export function eliminateInterBilling(
  lines: GlLine[],
  elim: InterBillingElimination,
): GlLine[] {
  return lines.filter(
    (l) =>
      !(l.ref_id && elim.internalInvoiceIds.has(l.ref_id)) &&
      !elim.interBillingCodes.has(l.account_code),
  )
}
