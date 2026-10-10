import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { getPeriodMonth } from '@/lib/utils'
import { fetchAllRows } from '@/lib/paginate'
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
  await requirePage('/hr-costing/payroll')
  const user = await requirePermission('hr_costing')
  const supabase = await createClient()

  const thisPeriod = getPeriodMonth()

  // All periods that have payroll rows, newest first — the user picks which
  // month to view; nothing is locked to the current month.
  // Every row, in 1000-row pages (2026-10-08): September added 56, and past
  // PostgREST's 1000-row cap whole months would drop off this list — the
  // current one too, and with it the jump into its grid. Only counted by
  // month, so the pages' order will do; a failed read still lists none.
  const allRows = await fetchAllRows((lo, hi) =>
    supabase.from('hr_monthly_payroll').select('period_month, status').order('id').range(lo, hi),
  ).catch(() => null)

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
        <section className="mb-10">
          <div className="sect-head">
            <h2>Months with data</h2>
            <span className="rule" aria-hidden />
            <span className="count">{periods.length} PERIOD{periods.length === 1 ? '' : 'S'}</span>
          </div>
          {/* Each month is one link, the whole row its target — framed like the
              sheet's tables, with the peach hover of a table row. */}
          <div className="table-frame divide-y divide-hairline">
            {periods.map(([period, info], i) => (
              <Link
                key={period}
                href={`/hr-costing/payroll/${period}`}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-[14px] py-3 hover:bg-accent-bg transition-colors${i % 2 === 1 ? ' bg-surface-2' : ''}`}
              >
                <span className="text-sm font-medium">{formatPeriodLabel(period)}</span>
                <span className="flex items-center gap-2 text-xs">
                  {info.count} row{info.count === 1 ? '' : 's'}
                  {info.drafts > 0 ? (
                    <span className="chip alert"><span className="dot" />{info.drafts} draft</span>
                  ) : (
                    <span className="chip ledger"><span className="dot" />all submitted</span>
                  )}
                  <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="border border-hairline rounded-card bg-surface-2 px-6 py-12 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] mb-2">{formattedPeriod}</p>
        {/* `.sheet-heading` owns its margin, so the air sits on its neighbours. */}
        <h2 className="sheet-heading">No payroll for this month yet.</h2>
        <p className="text-sm mt-2 mb-6 max-w-md mx-auto">
          Create the period to start from draft rows, or import directly from your InfoTech
          Excel export. Use the period picker above to work on a different month.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <CreatePeriodButton period={thisPeriod} />
          {canDo(user, 'hr_costing', 'create') ? <ImportInfotechEntryButton period={thisPeriod} /> : null}
        </div>
      </div>
    </div>
  )
}
