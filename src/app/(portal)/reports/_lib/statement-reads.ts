import type { createClient } from '@/lib/supabase/server'
import type { User } from '@/types'
import { listsPayrollByPerson } from '@/lib/roles'
import {
  applyGlRefs,
  buildBalanceSheet,
  buildCashFlow,
  buildPnl,
  fetchAllJournalLines,
  fetchCoaAccounts,
  fetchGlRefs,
  monthPeriod,
} from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { balanceSheetBlocks, cashFlowBlocks, pnlBlocks } from '@/lib/gl-report-blocks'
import { buildCashFlowSideSections } from '@/lib/cash-flow-sections'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { fetchInterBillingCashFlow, interBillTransferAccount, payrollCustodyAccount } from '@/lib/inter-billing-cash-flow'
import { segmentFilterFor } from '../_components/report-segments'

// The GL statements' reads (2026-10-15 — moved out of the P&L, Cash Flow and
// Balance Sheet pages word for word, so the Finance phone app's Report tab
// reads exactly what the pages read): the journal, the chart, the salary lines
// by department for whoever reads payroll that way, the consolidation, the
// statement and its blocks. For whoever reads the reports company-wide
// (Reports · View at All): every caller asks that first (the Dept Manager's
// own-segment mode went with the kind, 2026-10-17).

type Client = Awaited<ReturnType<typeof createClient>>

export interface StatementAsk {
  /** YYYY-MM. */
  period: string
  /** YYYY-MM, or '' — the comparison is opt-in (user 2026-06-11). */
  compare: string
  /** The segment asked for ('' = all segments, consolidated). */
  segment: string
}

/** The P&L for a month (the income statement's read). */
export async function readPnlStatement(supabase: Client, user: User, ask: StatementAsk) {
  const segment = ask.segment

  // Consolidated = the true all-segments view (no segment picked).
  const consolidated = !segment
  const [rawLines, accounts, glRefs, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    // Salary lines by department for whoever reads payroll that way (2026-10-13).
    fetchGlRefs(supabase, { payrollByPerson: listsPayrollByPerson(user) }),
    consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
  ])
  let lines = applyGlRefs(rawLines, glRefs)
  if (elim) lines = eliminateInterBilling(lines, elim)

  const pnl = buildPnl(lines, accounts, {
    current: monthPeriod(ask.period),
    previous: monthPeriod(ask.compare || ask.period),
    segment: segmentFilterFor(segment),
  })
  return { pnl, blocks: pnlBlocks(pnl), segment }
}

/** The Cash Flow for a month (the statement's read — direct method, the user's sections per side). */
export async function readCashFlowStatement(supabase: Client, user: User, ask: StatementAsk) {
  const segment = ask.segment
  // The bridge lines are a pure INTERNAL reallocation (one dept −X, another +X)
  // that exists so a single segment's cash ties to its Dept Pool. Consolidated
  // = every segment at once, where they cancel — and the 收/出 gross split would
  // otherwise surface both halves as real money moving (user 2026-07-30:
  // "inter billing 在 all segment 不应该出现").
  const consolidated = !segment

  // Every read starts at once (2026-10-08). The bridge and the layouts used to
  // wait on the journal read and then on each other — eight round trips in a
  // row. The bridge needs the bank codes only to build its lines, so it is
  // handed the pending read. Consolidated drops the bridge's lines and its two
  // accounts are constants, so there the bridge is not read at all.
  //
  // bank GL codes via RPC — codes only, no balances. Promise.resolve: sent
  // ONCE, awaited twice.
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  const [rawLines, accounts, glRefs, bankCodes, ib, inLayoutRaw, outLayoutRaw] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    // Salary lines by department for whoever reads payroll that way (2026-10-13).
    fetchGlRefs(supabase, { payrollByPerson: listsPayrollByPerson(user) }),
    bankCodesRead,
    // Fold inter-billing settles (dept_pools-only, no GL) in as synthetic
    // transfer lines so each segment's closing cash ties to its Dept Pool.
    consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
    // User-arranged sections per side (Edit layout). Unsaved → one section
    // each, i.e. the plain COA tree.
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const lines = [...applyGlRefs(rawLines, glRefs), ...(ib ? ib.lines : [])]

  const cf = buildCashFlow(
    lines,
    [...accounts, interBillTransferAccount, payrollCustodyAccount],
    {
      current: monthPeriod(ask.period),
      previous: monthPeriod(ask.compare || ask.period),
      segment: segmentFilterFor(segment),
    },
    bankCodes,
  )

  const coaWithSynthetic = [...accounts, interBillTransferAccount, payrollCustodyAccount]
  const inflow = buildCashFlowSideSections(cf.inflowLeaves, coaWithSynthetic, inLayoutRaw as ReportLayout | null, '现金流入 · Money in', 'in')
  const outflow = buildCashFlowSideSections(cf.outflowLeaves, coaWithSynthetic, outLayoutRaw as ReportLayout | null, '现金流出 · Money out', 'out')
  const blocks = cashFlowBlocks(cf, { inflow, outflow })
  return { cf, blocks, inflow, outflow, segment }
}

/** The Balance Sheet as at a month's end. With a segment it is not expected to balance. */
export async function readBalanceSheet(supabase: Client, user: User, ask: StatementAsk) {
  const [rawLines, accounts, glRefs] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    // Salary lines by department for whoever reads payroll that way (2026-10-13).
    fetchGlRefs(supabase, { payrollByPerson: listsPayrollByPerson(user) }),
  ])
  const lines = applyGlRefs(rawLines, glRefs)

  const bs = buildBalanceSheet(lines, accounts, {
    current: monthPeriod(ask.period),
    previous: monthPeriod(ask.compare || ask.period),
    segment: segmentFilterFor(ask.segment),
  })
  return { bs, blocks: balanceSheetBlocks(bs, ask.segment || undefined) }
}
