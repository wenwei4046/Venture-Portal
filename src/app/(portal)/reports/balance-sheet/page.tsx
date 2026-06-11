// GL-driven Balance Sheet (2026-06-11 rebuild). As-at balances aggregated from
// journal_lines; Equity carries a synthetic "Retained & current earnings" line
// (cumulative P&L to date) so Assets = Liabilities + Equity ties exactly.
// Note: with a Segment filter the check line is EXPECTED to be non-zero —
// equity/liabilities mostly live in the corporate segment.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  buildBalanceSheet,
  fetchAllJournalLines,
  fetchCoaAccounts,
  monthPeriod,
  prevMonth,
  type ReportSection,
} from '@/lib/gl-reports'
import GlReportView, { type ReportBlock } from '../_components/GlReportView'
import { REPORT_SEGMENTS } from '../_components/report-segments'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function BalanceSheetPage({ searchParams }: Props) {
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

  const bs = buildBalanceSheet(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare),
    segment: segment || undefined,
  })

  // Surface cumulative earnings as a row inside Equity so the sheet ties.
  const equityWithEarnings: ReportSection = {
    ...bs.equity,
    nodes: [
      ...bs.equity.nodes,
      {
        code: '—',
        name: 'Retained & current earnings (cumulative P&L)',
        current: bs.earnings.current,
        previous: bs.earnings.previous,
        txns: [],
        children: [],
      },
    ],
    current: Math.round((bs.equity.current + bs.earnings.current) * 100) / 100,
    previous: Math.round((bs.equity.previous + bs.earnings.previous) * 100) / 100,
  }

  const blocks: ReportBlock[] = [
    ...(bs.fixedAssets.nodes.length > 0
      ? ([{ kind: 'section', section: bs.fixedAssets }] as ReportBlock[])
      : []),
    { kind: 'section', section: bs.assets },
    {
      kind: 'summary',
      row: { label: 'Total Assets', current: bs.totalAssets.current, previous: bs.totalAssets.previous, emphasis: 'strong', tone: 'ledger' },
    },
    { kind: 'section', section: bs.liabilities },
    {
      kind: 'summary',
      row: { label: 'Total Liabilities', current: bs.liabilities.current, previous: bs.liabilities.previous },
    },
    { kind: 'section', section: equityWithEarnings },
    {
      kind: 'summary',
      row: {
        label: 'Total Liabilities & Equity',
        current: bs.totalLiabEquity.current,
        previous: bs.totalLiabEquity.previous,
        emphasis: 'strong',
        tone: 'ledger',
      },
    },
    ...(Math.abs(bs.check.current) > 0.005 || Math.abs(bs.check.previous) > 0.005
      ? ([
          {
            kind: 'summary',
            row: {
              label: segment ? 'Segment imbalance (expected with a segment filter)' : '⚠ Out of balance (Assets − L&E)',
              current: bs.check.current,
              previous: bs.check.previous,
              tone: 'danger',
            },
          },
        ] as ReportBlock[])
      : []),
  ]

  const asAt = (ym: string) => dayjs(monthPeriod(ym).to).format('D MMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · BALANCE SHEET · AS AT {asAt(period).toUpperCase()}
          </div>
          <h1 className="page-title">Balance Sheet</h1>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        As-at balances built straight from the general ledger. Equity includes a
        &ldquo;Retained &amp; current earnings&rdquo; line (cumulative P&amp;L to date) so
        Assets = Liabilities + Equity ties to the cent. Click ▸ on an account to see
        its movements in the selected month.
      </p>

      <GlReportView
        basePath="/reports/balance-sheet"
        period={period}
        compare={compare}
        segment={segment}
        segments={REPORT_SEGMENTS}
        blocks={blocks}
        currentLabel={asAt(period)}
        compareLabel={asAt(compare)}
      />
    </div>
  )
}
