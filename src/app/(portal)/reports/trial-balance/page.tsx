import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchTrialBalance, isCalendarDay } from '@/lib/cfo-reports'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import Link from 'next/link'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { groupTrialBalance } from '@/lib/trial-balance-groups'
import TrialBalanceView from './_components/TrialBalanceView'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'

interface Props {
  searchParams: Promise<{ as_of?: string; show_zero?: string; segment?: string }>
}

export default async function TrialBalancePage({ searchParams }: Props) {
  await requirePermission('reports')
  const supabase = await createClient()

  const { as_of: rawAsOf, show_zero: rawShowZero, segment: rawSegment } = await searchParams
  // A hand-typed day that is not one (2026-02-31) opens today, not an error —
  // the office's today: on the server's clock (UTC) it was yesterday until 08:00.
  const asOf = isCalendarDay(rawAsOf) ? rawAsOf : officeToday()
  const showZeroBalance = rawShowZero === '1'
  // One segment (2026-10-10, the handoff's Segment on the control row).
  const segments = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
  const segment = segments.some((s) => s.value === rawSegment) ? (rawSegment as string) : ''
  const segName = (segments.find((s) => s.value === segment) ?? segments[0]).label

  // The accounts' parents arrange the rows into groups (2026-10-09, the
  // handoff). Only the arrangement rides on this read: should it fail, every
  // account stands on its own and the figures are the same.
  const coaRead = (async () => supabase.from('chart_of_accounts').select('code, name, parent_code'))().catch(() => ({ data: null }))
  const [tb, { data: coaRows }] = await Promise.all([fetchTrialBalance(supabase, { asOf, showZeroBalance, segment: segmentFilterFor(segment) }), coaRead])
  const blocks = groupTrialBalance(tb.rows, (coaRows ?? []) as Array<{ code: string; name: string; parent_code: string | null }>)
  const dateLabel = dayjs(asOf).format('D MMMM YYYY')

  // On the sheet (2026-10-09, the user's Claude Design handoff): the date in
  // the eyebrow, Excel / PDF, three cards, the as-at control on a row, the
  // accounts closing on their totals.
  const difference = Math.round((tb.totals.debit - tb.totals.credit) * 100) / 100
  const exportQs = `as_of=${asOf}${showZeroBalance ? '&show_zero=1' : ''}${segment ? `&segment=${segment}` : ''}`

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · TRIAL BALANCE · AS AT {dateLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Trial Balance</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href={`/reports/trial-balance/export?format=xlsx&${exportQs}`} className="btn-quiet-sheet">
            Excel
          </a>
          <a href={`/reports/trial-balance/export?format=pdf&${exportQs}`} className="btn-quiet-sheet">
            PDF
          </a>
        </div>
      </div>

      <StatCards label="Trial balance">
        <StatCard label="Total debit" value={formatMoney(tb.totals.debit)} icon="inbox" note={`${tb.rows.length} ${tb.rows.length === 1 ? 'account' : 'accounts'}`} />
        <StatCard label="Total credit" value={formatMoney(tb.totals.credit)} icon="send" note={`As at ${dateLabel}`} />
        <StatCard
          label="Difference"
          value={formatMoney(difference)}
          icon="check"
          tone={tb.reconciles ? 'primary' : 'danger'}
          note={tb.reconciles ? 'Debits = credits' : 'Does not reconcile'}
        />
      </StatCards>

      <section className="mb-6">
      <div className="sect-head">
        <h2>Trial balance</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {segment ? `${segName.toUpperCase()} · ` : ''}AS AT {dateLabel.toUpperCase()}
        </span>
      </div>
      <p className="text-xs text-graphite mb-3 max-w-3xl">
        Every postable GL account as at {dateLabel}. Header accounts (1000, 9050) roll up through their children. Σ Dr must equal Σ Cr.
      </p>

      {!tb.reconciles ? (
        <div className="sheet-danger mb-4">
          ⚠ Trial Balance does not reconcile — Σ Dr ({formatMoney(tb.totals.debit)}) ≠ Σ Cr ({formatMoney(tb.totals.credit)}). Investigate journal_lines integrity before relying on this report.
        </div>
      ) : null}

      <TrialBalanceView
        asOf={asOf}
        showZero={showZeroBalance}
        segment={segment}
        segments={segments.map((s) => ({ value: s.value, label: s.label }))}
        blocks={blocks}
        totals={tb.totals}
      />
      </section>

      {tb.rows.length === 0 ? (
        <p className="text-sm text-graphite mt-6">
          No accounts have any activity through {dateLabel}.{' '}
          {!showZeroBalance ? (
            <Link href={`/reports/trial-balance?as_of=${asOf}&show_zero=1`} className="text-accent hover:text-accent-hover">
              Show zero-balance accounts
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
