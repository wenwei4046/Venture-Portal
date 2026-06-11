// GL-driven P&L (2026-06-11 rebuild). Every figure aggregates journal_lines —
// the same dataset the Trial Balance ties to. Format per the-conts.pages.dev
// reference: current | comparison | Δ% | % of revenue, collapsible groups,
// inline transaction drill-down. The old subledger/manual_jv hybrid engine
// (cfo-reports.fetchIncomeStatement) is no longer used here.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buildPnl, fetchAllJournalLines, fetchCoaAccounts, monthPeriod, prevMonth } from '@/lib/gl-reports'
import GlReportView, { type ReportBlock } from '../_components/GlReportView'
import { REPORT_SEGMENTS } from '../_components/report-segments'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function IncomeStatementPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? dayjs().format('YYYY-MM')
  const compare = params.compare ?? prevMonth(period)
  const segment = params.segment ?? ''

  const [lines, accounts] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
  ])

  const pnl = buildPnl(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare),
    segment: segment || undefined,
  })

  const margin = (n: number) =>
    Math.abs(pnl.revenue.current) < 0.005 ? '' : `${((n / pnl.revenue.current) * 100).toFixed(1)}%`

  const blocks: ReportBlock[] = [
    { kind: 'section', section: pnl.revenue },
    {
      kind: 'summary',
      row: { label: 'Total Revenue', current: pnl.revenue.current, previous: pnl.revenue.previous, emphasis: 'strong', tone: 'ledger' },
    },
    { kind: 'section', section: pnl.cost },
    {
      kind: 'summary',
      row: {
        label: 'Gross Profit',
        current: pnl.grossProfit.current,
        previous: pnl.grossProfit.previous,
        sub: margin(pnl.grossProfit.current) ? `${margin(pnl.grossProfit.current)} gross margin` : undefined,
        emphasis: 'strong',
        tone: 'auto',
      },
    },
    { kind: 'section', section: pnl.otherIncome },
    { kind: 'section', section: pnl.expense },
    {
      kind: 'summary',
      row: {
        label: 'Net Income / (Loss)',
        current: pnl.netIncome.current,
        previous: pnl.netIncome.previous,
        sub: margin(pnl.netIncome.current) ? `${margin(pnl.netIncome.current)} net margin` : undefined,
        emphasis: 'strong',
        tone: 'auto',
      },
    },
  ]

  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · P&amp;L STATEMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">P&amp;L Statement</h1>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Built straight from the general ledger — the same journal lines the Trial Balance ties to.
        Gross profit = revenue − COGS; net income adds other income and deducts expenses.
        Click ▸ on an account to see its journal transactions for the period.
      </p>

      <GlReportView
        basePath="/reports/income-statement"
        period={period}
        compare={compare}
        segment={segment}
        segments={REPORT_SEGMENTS}
        blocks={blocks}
        pctBase={{ current: pnl.revenue.current, previous: pnl.revenue.previous }}
        currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
        compareLabel={dayjs(`${compare}-01`).format('MMM YYYY')}
      />
    </div>
  )
}
