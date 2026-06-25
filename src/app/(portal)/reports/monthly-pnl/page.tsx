import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildMonthlyPnl } from '@/lib/monthly-pnl'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import MonthlyMatrix from '../_components/MonthlyMatrix'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string }>
}

export default async function MonthlyPnlPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  const segment = params.segment ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const [lines, accounts] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
  ])

  const matrix = buildMonthlyPnl(lines, accounts, {
    year,
    throughMonth,
    segment: segmentFilterFor(segment),
  })

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · MONTHLY P&amp;L · FY {year}
          </div>
          <h1 className="page-title">Monthly P&amp;L</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            FY {year} · read-only · all amounts RM · % of sales
          </p>
        </div>
        <form className="flex items-end gap-3 shrink-0">
          <label className="flex flex-col gap-1 text-xs font-sans text-muted">
            Up to month
            <input
              type="month"
              name="period"
              defaultValue={period}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-sans text-muted">
            Segment
            <select
              name="segment"
              defaultValue={segment}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
            >
              {REPORT_SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-sans text-sm rounded-md transition-colors"
          >
            Apply
          </button>
        </form>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Each month of the fiscal year as its own column, with an Accumulated
        (year-to-date) column. Built straight from the general ledger — ties to
        the single-period P&amp;L. Cost / expense show as negative; % is each line
        against that column&rsquo;s sales.
      </p>

      <MonthlyMatrix columns={matrix.columns} rows={matrix.rows} pctBaseByColumn={matrix.salesByColumn} />
    </div>
  )
}
