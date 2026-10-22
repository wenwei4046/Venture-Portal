// GL-driven Balance Sheet (2026-06-11 rebuild). As-at balances aggregated from
// journal_lines; Equity carries a synthetic "Retained & current earnings" line
// (cumulative P&L to date) so Assets = Liabilities + Equity ties exactly.
// Note: with a Segment filter the check line is EXPECTED to be non-zero —
// equity/liabilities mostly live in the corporate segment.

import dayjs from 'dayjs'
import { canDo } from '@/lib/permission-actions'
import { officeMonth } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { monthPeriod } from '@/lib/gl-reports'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS } from '../_components/report-segments'
import { readBalanceSheet } from '../_lib/statement-reads'
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
  const user = await requirePermission('reports')
  // The files only for whoever may take them out — as the export route asks (2026-10-16).
  const canExport = canDo(user, 'reports', 'export')
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? officeMonth()
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  const segment = params.segment ?? ''

  // The read is the Finance phone app's Balance Sheet's too (`_lib/statement-reads`).
  const { bs, blocks } = await readBalanceSheet(supabase, user, { period, compare, segment })
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
          {/* One segment's slice is not expected to balance — equity and
              liabilities mostly sit in the corporate segment. Said in a chip,
              not a sentence (2026-10-12). */}
          {segment ? <span className="chip alert mt-2"><span className="dot" />Segment only · won&apos;t balance</span> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canExport ? (
            <ExportLinks variant="sheet" basePath="/reports/balance-sheet/export" period={period} compare={compare} segment={segment} />
          ) : null}
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
        <GlReportView
          period={period}
          compare={compare}
          segment={segment}
          segments={segChoices}
          blocks={blocks}
          currentLabel={asAt(period)}
          compareLabel={compare ? asAt(compare) : ''}
          periodLabel="As at"
        />
      </section>
    </div>
  )
}
