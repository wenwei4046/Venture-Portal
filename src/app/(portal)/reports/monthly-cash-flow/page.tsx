import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import type { MatrixRow } from '@/lib/monthly-matrix'
import { segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string }>
}

export default async function MonthlyCashFlowPage({ searchParams }: Props) {
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  // Dept managers see ONLY their own segment (RLS) — force empty + hide picker.
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  // Same two layouts the Cash Flow STATEMENT uses — the statement is the
  // reference, this view just adds month columns (user 2026-07-30: "monthly
  // cash flow 和 cash flow 显示的是一样,以 cash flow 为准").
  const [lines, accounts, { data: banks }, inSaved, outSaved] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    // bank GL codes via RPC (dept_managers are RLS-blocked from bank_accounts,
    // which zeroed their Cash Flow) — codes only, no balances.
    supabase.rpc('bank_gl_codes' as never),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])
  const ib = await fetchInterBillingCashFlow(supabase, bankCodes)
  // Internal-transfer bridge: per-segment only — it cancels across segments,
  // so the consolidated view must not carry it (same rule as the statement).
  const consolidated = !isDeptMgr && !segment
  const ibLines = consolidated ? [] : ib.lines

  const data = buildMonthlyCashFlowSides([...lines, ...ibLines], [...accounts, ib.account, ib.payrollAccount], bankCodes, {
    year,
    throughMonth,
    segment: segmentFilterFor(segment),
  })

  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', '流入合计 · Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', '流出合计 · Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
  ]

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · MONTHLY CASH FLOW · FY {year}
          </div>
          <h1 className="page-title">Monthly Cash Flow</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            FY {year} · read-only · all amounts RM · direct method
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Edit layout edits the SHARED company layout — hide from dept managers. */}
          {!isDeptMgr && (
            <Link
              // One shared layout for both cash-flow views — edited on the statement.
              href={`/reports/cash-flow/layout`}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors"
            >
              Edit layout
            </Link>
          )}
          <a
            href={`/reports/monthly-cash-flow/export?format=xlsx&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Excel
          </a>
          <a
            href={`/reports/monthly-cash-flow/export?format=pdf&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Direct-method cash movement, grouped under your own categories (edit the
        layout to drag accounts between categories — subtotals recompute
        automatically). Each month is a column with an Accumulated total; inflows
        positive, outflows negative.
      </p>

      {/* Provider bridges the rail's search box to the matrix that owns the rows. */}
      <ReportSearchProvider>
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch lg:items-start">
          <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} extraSegments={extraReportSegments(primedRegistryRows())} />
          <div className="min-w-0 flex-1">
            <MonthlyMatrix columns={data.columns} rows={rows} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
