import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import CreatePeriodButton from './_components/CreatePeriodButton'

interface PeriodSummary {
  period_month: string
  staff_count: number
  total_gross: number
  total_net: number
  draft_count: number
  submitted_count: number
  paid_count: number
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export default async function PayrollListPage() {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('hr_monthly_payroll')
    .select('period_month, status, gross, net')
    .order('period_month', { ascending: false })

  // Client-side group-by period. Row count is small (period × staff ~ 50 rows/mo).
  const byPeriod = new Map<string, PeriodSummary>()
  for (const r of rows ?? []) {
    const p = r.period_month
    if (!byPeriod.has(p)) {
      byPeriod.set(p, {
        period_month: p,
        staff_count: 0,
        total_gross: 0,
        total_net: 0,
        draft_count: 0,
        submitted_count: 0,
        paid_count: 0,
      })
    }
    const s = byPeriod.get(p)!
    s.staff_count++
    s.total_gross += Number(r.gross)
    s.total_net += Number(r.net)
    if (r.status === 'draft') s.draft_count++
    else if (r.status === 'submitted') s.submitted_count++
    else if (r.status === 'paid') s.paid_count++
  }

  const periods = Array.from(byPeriod.values())
  const thisPeriod = currentPeriod()
  const thisPeriodExists = periods.some(p => p.period_month === thisPeriod)

  return (
    <div>
      <Link
        href="/hr-costing"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to HR Costing
      </Link>

      <div className="flex items-baseline justify-between mt-6 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Monthly Payroll</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            One snapshot per employee per month. Pro-rata, statutory, PCB auto-computed.
            <em> HR edits drafts; Principal approves.</em>
          </p>
        </div>
        {!thisPeriodExists && <CreatePeriodButton period={thisPeriod} />}
      </div>

      {periods.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-4">还没有月度 payroll 记录。</p>
          <p className="font-serif italic text-muted text-sm mb-6">
            Create the current period to start. Migration 126 seeds the first period automatically.
          </p>
          <CreatePeriodButton period={thisPeriod} />
        </div>
      ) : (
        <div className="overflow-x-auto mb-12">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Period</th>
                <th className="text-right py-3 pr-4 font-medium">Staff</th>
                <th className="text-right py-3 pr-4 font-medium">Total Gross</th>
                <th className="text-right py-3 pr-4 font-medium">Total Net</th>
                <th className="text-left py-3 pr-4 font-medium">Status</th>
                <th className="text-right py-3 pr-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.period_month} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                  <td className="py-4 pr-4">
                    <div className="font-serif text-md text-ink">{formatPeriodLabel(p.period_month)}</div>
                    <div className="font-sans text-xs text-muted">{p.period_month}</div>
                  </td>
                  <td className="py-4 pr-4 text-right font-mono tabular text-graphite">{p.staff_count}</td>
                  <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">{formatMoney(p.total_gross)}</td>
                  <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">{formatMoney(p.total_net)}</td>
                  <td className="py-4 pr-4">
                    <div className="flex gap-2 items-center font-sans text-xs">
                      {p.draft_count > 0 && (
                        <span className="text-graphite">
                          <span className="font-medium">{p.draft_count}</span> draft
                        </span>
                      )}
                      {p.submitted_count > 0 && (
                        <span className="text-warning">
                          <span className="font-medium">{p.submitted_count}</span> submitted
                        </span>
                      )}
                      {p.paid_count > 0 && (
                        <span className="text-success">
                          <span className="font-medium">{p.paid_count}</span> paid
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-right">
                    <Link
                      href={`/hr-costing/payroll/${p.period_month}`}
                      className="text-xs font-sans text-accent hover:text-accent-hover transition-colors"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
