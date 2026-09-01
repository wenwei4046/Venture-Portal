import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { getPeriodMonth } from '@/lib/utils'
import CreatePeriodButton from './_components/CreatePeriodButton'
import ImportInfotechEntryButton from './_components/ImportInfotechEntryButton'
import PeriodPicker from './_components/PeriodPicker'

function formatPeriodLabel(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function PayrollLandingPage() {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  const thisPeriod = getPeriodMonth()

  // All periods that have payroll rows, newest first — the user picks which
  // month to view; nothing is locked to the current month.
  const { data: allRows } = await supabase
    .from('hr_monthly_payroll')
    .select('period_month, status')

  const byPeriod = new Map<string, { count: number; drafts: number }>()
  for (const r of allRows ?? []) {
    const entry = byPeriod.get(r.period_month) ?? { count: 0, drafts: 0 }
    entry.count++
    if (r.status === 'draft') entry.drafts++
    byPeriod.set(r.period_month, entry)
  }
  const periods = [...byPeriod.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))

  // Current month already has rows → jump straight into its grid.
  if (byPeriod.has(thisPeriod)) {
    redirect(`/hr-costing/payroll/${thisPeriod}`)
  }

  const formattedPeriod = formatPeriodLabel(thisPeriod)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYROLL
          </div>
          <h1 className="page-title">Payroll</h1>
        </div>
        <PeriodPicker period={thisPeriod} />
      </div>

      {periods.length > 0 && (
        <section className="mb-12">
          <div className="sect-head">
            <h2>Months with data</h2>
            <span className="rule" aria-hidden />
            <span className="count">{periods.length} PERIOD{periods.length === 1 ? '' : 'S'}</span>
          </div>
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {periods.map(([period, info]) => (
              <Link
                key={period}
                href={`/hr-costing/payroll/${period}`}
                className="flex items-baseline justify-between px-5 py-4 hover:bg-surface-2/40 transition-colors"
              >
                <span className="font-serif text-md text-ink">{formatPeriodLabel(period)}</span>
                <span className="font-mono text-xs text-muted">
                  {info.count} row{info.count === 1 ? '' : 's'}
                  {' · '}
                  {info.drafts > 0 ? `${info.drafts} draft` : 'all submitted'}
                  {' →'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="py-16 text-center border border-hairline rounded-md bg-surface">
        <p className="font-serif italic text-accent text-sm mb-2">{formattedPeriod}</p>
        <p className="font-serif text-2xl text-ink mb-3">No payroll for this month yet.</p>
        <p className="font-serif italic text-muted text-sm mb-8 max-w-md mx-auto">
          Create the period to start from draft rows, or import directly from your InfoTech
          Excel export. Use the period picker above to work on a different month.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <CreatePeriodButton period={thisPeriod} />
          <ImportInfotechEntryButton period={thisPeriod} />
        </div>
      </div>
    </div>
  )
}
