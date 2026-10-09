import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { buildCustomPnlRows, buildPnlAccounts, defaultPnlLayout } from '@/lib/pnl-custom'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow, interBillTransferAccount, payrollCustodyAccount } from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import type { MatrixRow } from '@/lib/monthly-matrix'

// The month-by-month P&L and Cash Flow as Reports reads them — lifted out of
// the two report pages on 2026-10-09 so a department's own page under Dept
// Pool reads exactly the same figures for its segment as Reports does with
// that segment picked.

export interface MonthlyStatementArgs {
  year: number
  throughMonth: number
  /** journal_entries.segment values to keep; undefined = every segment. */
  segment: string[] | undefined
  /** Every segment at once (a company-wide reader, nothing picked). */
  consolidated: boolean
}

/** The P&L: inter-billing between segments eliminated when consolidated, rows laid out as saved. */
export async function loadMonthlyPnl(supabase: SupabaseClient, { year, throughMonth, segment, consolidated }: MonthlyStatementArgs) {
  const [rawLines, accounts, savedRaw, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    readReportLayout(supabase, 'pnl'),
    consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
  ])
  const lines = elim ? eliminateInterBilling(rawLines, elim) : rawLines

  const data = buildPnlAccounts(lines, accounts, { year, throughMonth, segment })
  const saved = (savedRaw ?? null) as ReportLayout | null
  const layout = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultPnlLayout(data.accounts)
  const rows = buildCustomPnlRows(data, layout)
  return { data, rows }
}

/** The Cash Flow: one segment carries the internal-transfer bridge, so its closing cash ties to its pool. */
export async function loadMonthlyCashFlow(supabase: SupabaseClient, { year, throughMonth, segment, consolidated }: MonthlyStatementArgs) {
  // Internal-transfer bridge: per-segment only — it cancels across segments,
  // so the consolidated view must not carry it (same rule as the statement),
  // and there it is not read at all (2026-10-08).
  //
  // bank GL codes via RPC (dept_managers are RLS-blocked from bank_accounts,
  // which zeroed their Cash Flow) — codes only, no balances. Shared with the
  // bridge, which starts beside the journal read instead of after it.
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  // Same two layouts the Cash Flow STATEMENT uses — the statement is the
  // reference, this view just adds month columns (user 2026-07-30: "monthly
  // cash flow 和 cash flow 显示的是一样,以 cash flow 为准").
  const [lines, accounts, bankCodes, ib, inSaved, outSaved] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    bankCodesRead,
    consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const ibLines = ib ? ib.lines : []

  const data = buildMonthlyCashFlowSides([...lines, ...ibLines], [...accounts, interBillTransferAccount, payrollCustodyAccount], bankCodes, {
    year,
    throughMonth,
    segment,
  })

  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', '流入合计 · Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', '流出合计 · Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
  ]
  return { data, rows }
}
