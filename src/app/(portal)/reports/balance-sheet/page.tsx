// GL-driven Balance Sheet (2026-06-11 rebuild). As-at balances aggregated from
// journal_lines; Equity carries a synthetic "Retained & current earnings" line
// (cumulative P&L to date) so Assets = Liabilities + Equity ties exactly.
// Note: with a Segment filter the check line is EXPECTED to be non-zero —
// equity/liabilities mostly live in the corporate segment.

import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import {
  applyGlRefs,
  buildBalanceSheet,
  fetchAllJournalLines,
  fetchCoaAccounts,
  fetchGlRefs,
  monthPeriod,
} from '@/lib/gl-reports'
import { balanceSheetBlocks } from '@/lib/gl-report-blocks'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import ExportLinks from '../_components/ExportLinks'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function BalanceSheetPage({ searchParams }: Props) {
  await requirePage('/reports/balance-sheet')
  await requirePermission('reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? officeMonth()
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  const segment = params.segment ?? ''

  const [rawLines, accounts, glRefs] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchGlRefs(supabase),
  ])
  const lines = applyGlRefs(rawLines, glRefs)

  const bs = buildBalanceSheet(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare || period),
    segment: segmentFilterFor(segment),
  })

  const blocks = balanceSheetBlocks(bs, segment || undefined)
  const asAt = (ym: string) => dayjs(monthPeriod(ym).to).format('D MMM YYYY')

  // On the sheet (2026-10-09, the user's Claude Design handoff): the date in
  // the eyebrow, Excel / PDF, four cards, the controls on one row ("As at").
  const segChoices = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
  const segName = (segChoices.find((s) => s.value === segment) ?? segChoices[0]).label
  const equity = Math.round((bs.totalLiabEquity.current - bs.liabilities.current) * 100) / 100
  const balanced = Math.abs(bs.check.current) < 0.01

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · BALANCE SHEET · AS AT {asAt(period).toUpperCase()}
          </div>
          <h1 className="page-title">Balance Sheet</h1>
          <p className="page-sub">
            As-at balances from the general ledger. Equity carries a &ldquo;Retained &amp; current earnings&rdquo; line (cumulative P&amp;L to
            date), so Assets = Liabilities + Equity to the cent. ▸ on an account shows its movements in the month.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportLinks variant="sheet" basePath="/reports/balance-sheet/export" period={period} compare={compare} segment={segment} />
        </div>
      </div>

      <StatCards label="Balance sheet">
        <StatCard label="Total assets" value={formatMoney(bs.totalAssets.current)} icon="building" tone="primary" note={`As at ${asAt(period)}`} />
        <StatCard label="Total liabilities" value={formatMoney(bs.liabilities.current)} icon="layers" note="Funding + current" />
        <StatCard label="Equity" value={formatMoney(equity)} icon="shield" note="Capital + retained" />
        <StatCard
          label="Check"
          value={balanced ? 'Balanced' : formatMoney(bs.check.current)}
          icon="check"
          tone={balanced ? 'default' : 'danger'}
          note="Assets = L + E"
        />
      </StatCards>

      <section className="mb-6">
        <div className="sect-head">
          <h2>Balance sheet</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {segName.toUpperCase()} · AS AT {asAt(period).toUpperCase()}
          </span>
        </div>
        {segment ? (
          <p className="fin-notice mb-3">With a segment picked the check is expected to be off — equity and liabilities mostly sit in the corporate segment.</p>
        ) : null}
        <GlReportView
          basePath="/reports/balance-sheet"
          period={period}
          compare={compare}
          segment={segment}
          segments={segChoices}
          blocks={blocks}
          currentLabel={asAt(period)}
          compareLabel={compare ? asAt(compare) : ''}
          controls="row"
          periodLabel="As at"
        />
      </section>
    </div>
  )
}
