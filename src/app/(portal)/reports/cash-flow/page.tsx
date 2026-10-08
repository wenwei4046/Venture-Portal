// GL-driven Cash Flow (2026-06-11 rebuild). Direct method: every journal entry
// that moves a bank account is allocated across its non-bank counter legs and
// categorised by the counter account's cash_flow_category (operating /
// investing / financing — set per account on the COA). Opening + net change =
// closing, reconciled against the banks' GL balances.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import {
  applyGlRefs,
  buildCashFlow,
  fetchAllJournalLines,
  fetchCoaAccounts,
  fetchGlRefs,
  monthPeriod,
} from '@/lib/gl-reports'
import { cashFlowBlocks } from '@/lib/gl-report-blocks'
import { buildCashFlowSideSections } from '@/lib/cash-flow-sections'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import {
  fetchInterBillingCashFlow,
  interBillTransferAccount,
  payrollCustodyAccount,
} from '@/lib/inter-billing-cash-flow'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import ExportLinks from '../_components/ExportLinks'
import ReportViewToggle from '../_components/ReportViewToggle'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function CashFlowPage({ searchParams }: Props) {
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? dayjs().format('YYYY-MM')
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  // Dept managers see ONLY their own segment (RLS on journal_lines) — force the
  // filter empty + hide the picker (a hand-typed ?segment= returns empty).
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  // The bridge lines are a pure INTERNAL reallocation (one dept −X, another +X)
  // that exists so a single segment's cash ties to its Dept Pool. Consolidated
  // = every segment at once, where they cancel — and the 收/出 gross split would
  // otherwise surface both halves as real money moving (user 2026-07-30:
  // "inter billing 在 all segment 不应该出现"). Dept managers have no segment
  // param but ARE a single segment (RLS), so they keep the bridge.
  const consolidated = !isDeptMgr && !segment

  // Every read starts at once (2026-10-08). The bridge and the layouts used to
  // wait on the journal read and then on each other — eight round trips in a
  // row. The bridge needs the bank codes only to build its lines, so it is
  // handed the pending read. Consolidated drops the bridge's lines and its two
  // accounts are constants, so there the bridge is not read at all.
  //
  // bank GL codes via RPC (dept_managers are RLS-blocked from bank_accounts) —
  // codes only, no balances. Promise.resolve: sent ONCE, awaited twice.
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  const [rawLines, accounts, glRefs, bankCodes, ib, inLayoutRaw, outLayoutRaw] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchGlRefs(supabase),
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
      current: monthPeriod(period),
      previous: monthPeriod(compare || period),
      segment: segmentFilterFor(segment),
    },
    bankCodes,
  )

  const coaWithSynthetic = [...accounts, interBillTransferAccount, payrollCustodyAccount]
  const blocks = cashFlowBlocks(cf, {
    inflow: buildCashFlowSideSections(cf.inflowLeaves, coaWithSynthetic, inLayoutRaw as ReportLayout | null, '现金流入 · Money in', 'in'),
    outflow: buildCashFlowSideSections(cf.outflowLeaves, coaWithSynthetic, outLayoutRaw as ReportLayout | null, '现金流出 · Money out', 'out'),
  })
  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CASH FLOW · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Cash Flow Statement</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Edit layout edits the SHARED company sections — hide from dept managers. */}
          {!isDeptMgr && (
            <Link
              href="/reports/cash-flow/layout"
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors"
            >
              Edit layout
            </Link>
          )}
          <ExportLinks basePath="/reports/cash-flow/export" period={period} compare={compare} segment={segment} />
        </div>
      </div>

      <ReportViewToggle pair="cash-flow" active="single" period={period} segment={segment || undefined} />

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Direct method from the general ledger: every bank movement is allocated to its
        counter account and grouped by that account&apos;s cash-flow category (set in
        Settings → Chart of Account). Bank↔bank internal transfers cancel out. Opening +
        net change reconciles to closing cash. Click ▸ on a row to see the underlying
        transactions.
      </p>

      <GlReportView
        basePath="/reports/cash-flow"
        period={period}
        compare={compare}
        segment={segment}
        segments={isDeptMgr ? [] : [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]}
        blocks={blocks}
        currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
        compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
      />
    </div>
  )
}
