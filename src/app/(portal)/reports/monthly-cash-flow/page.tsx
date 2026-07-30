import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import {
  buildCashFlowAccounts,
  buildCustomCashFlowRows,
  defaultCashFlowLayout,
  type CashFlowLayout,
} from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow, ensureInterBillCategory } from '@/lib/inter-billing-cash-flow'
import { readReportLayout } from '@/lib/report-layouts'
import { segmentFilterFor } from '../_components/report-segments'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string }>
}

export default async function MonthlyCashFlowPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  // Dept managers see ONLY their own segment (RLS) — force empty + hide picker.
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const [lines, accounts, { data: banks }, savedRaw] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    // bank GL codes via RPC (dept_managers are RLS-blocked from bank_accounts,
    // which zeroed their Cash Flow) — codes only, no balances.
    supabase.rpc('bank_gl_codes' as never),
    readReportLayout(supabase, 'cash_flow'),
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])
  const ib = await fetchInterBillingCashFlow(supabase, bankCodes)
  // Internal-transfer bridge: per-segment only — it cancels across segments,
  // so the consolidated view must not carry it (same rule as the statement).
  const consolidated = !isDeptMgr && !segment
  const ibLines = consolidated ? [] : ib.lines

  const data = buildCashFlowAccounts([...lines, ...ibLines], [...accounts, ib.account, ib.payrollAccount], bankCodes, {
    year,
    throughMonth,
    segment: segmentFilterFor(segment),
  })

  const saved = (savedRaw ?? null) as CashFlowLayout | null
  const layout = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultCashFlowLayout(data.accounts)

  const rows = buildCustomCashFlowRows(data, ensureInterBillCategory(layout))

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
              href={`/reports/monthly-cash-flow/layout`}
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

      <div className="flex gap-8 items-start">
        <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} />
        <div className="min-w-0 flex-1">
          <MonthlyMatrix columns={data.columns} rows={rows} />
        </div>
      </div>
    </div>
  )
}
