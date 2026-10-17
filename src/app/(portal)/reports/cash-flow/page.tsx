// GL-driven Cash Flow (2026-06-11 rebuild). Direct method: every journal entry
// that moves a bank account is allocated across its non-bank counter legs and
// categorised by the counter account's cash_flow_category (operating /
// investing / financing — set per account on the COA). Opening + net change =
// closing, reconciled against the banks' GL balances.

import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { canDo } from '@/lib/permission-actions'
import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { reportsCompanyWide } from '@/lib/surfaces'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import ExportLinks from '../_components/ExportLinks'
import { readCashFlowStatement } from '../_lib/statement-reads'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import ReportModeSwitch from '../_components/ReportModeSwitch'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function CashFlowPage({ searchParams }: Props) {
  await requirePage('/reports/cash-flow')
  const user = await requirePermission('dept_reports')
  // For whoever reads the reports company-wide (Reports · View at All); the
  // Dept Manager's own-segment page went with the kind (2026-10-17).
  if (!reportsCompanyWide(user)) notFound()
  // The files only for whoever may take them out — as the export route asks (2026-10-16).
  const canExport = canDo(user, 'reports', 'export')
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? officeMonth()
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  // The read is the Finance phone app's Cash Flow's too (`_lib/statement-reads`).
  const { cf, blocks, segment } = await readCashFlowStatement(supabase, user, { period, compare, segment: params.segment ?? '' })
  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')

  // The page (2026-10-09, the user's Claude Design handoff): the two views and
  // the exports in the head, the cards, the controls on one row over the
  // statement.
  const segChoices = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
  const segName = (segChoices.find((s) => s.value === segment) ?? segChoices[0]).label
  const isNow = period === officeMonth()
  const mon = dayjs(`${period}-01`).format('MMM')
  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CASH FLOW · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Cash Flow</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ReportModeSwitch pair="cash-flow" active="single" period={period} segment={segment || undefined} />
          <Link href="/reports/cash-flow/layout" className="btn-quiet-sheet">
            Edit layout
          </Link>
          {canExport ? (
            <ExportLinks variant="sheet" basePath="/reports/cash-flow/export" period={period} compare={compare} segment={segment} />
          ) : null}
        </div>
      </div>

      <StatCards label="Cash flow">
        <StatCard label="Opening cash" value={formatMoney(cf.openingCash.current)} icon="wallet" note="Start of month" />
        <StatCard label="Money in" value={formatMoney(cf.inflow.current)} icon="inbox" tone="ledger" note={periodLabel} />
        <StatCard label="Money out" value={formatMoney(cf.outflow.current)} icon="send" tone="danger" note={periodLabel} />
        <StatCard label="Net change" value={formatMoney(cf.netChange.current)} icon="swap" tone={cf.netChange.current < 0 ? 'danger' : 'ledger'} note="All movements" />
        <StatCard label="Closing cash" value={formatMoney(cf.closingCash.current)} icon="bank" tone="primary" note={isNow ? 'To date' : 'End of month'} />
      </StatCards>

      <section className="mb-6">
        <div className="sect-head">
          <h2>Cash flow statement</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {segName.toUpperCase()} · {mon.toUpperCase()} {period.slice(0, 4)}
          </span>
        </div>
        <GlReportView
          period={period}
          compare={compare}
          segment={segment}
          segments={segChoices}
          blocks={blocks}
          currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
          compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
        />
      </section>
    </div>
  )
}
