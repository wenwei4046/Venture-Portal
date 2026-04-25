import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import Link from 'next/link'
import dayjs from 'dayjs'
import BaseRateTrendChart from './_components/BaseRateTrendChart'

export default async function BaseRateHistoryPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { data: history } = await supabase
    .from('base_rate_history')
    .select('*')
    .order('approved_at', { ascending: false })
    .limit(20)

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · BASE RATE HISTORY
          </div>
          <h1 className="page-title">Base Rate History</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Quarterly weighted cost + op margin = base rate.
          </p>
        </div>
      </div>

      {/* Trend chart */}
      <BaseRateTrendChart
        data={(history ?? []).slice().reverse().map(h => ({
          quarter: h.quarter,
          baseRate: Number(h.base_rate),
          weightedCost: Number(h.weighted_cost),
        }))}
      />

      {(!history || history.length === 0) ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-1">No base rate history yet.</p>
          <p className="font-serif italic text-muted text-sm mb-4">Principal approves base rate changes in Settings.</p>
          <Link
            href="/settings?tab=simulator"
            className="font-serif italic text-sm text-accent hover:text-accent-hover"
          >
            Simulate a new base rate →
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto max-w-3xl">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th className="right">Wtd Cost</th>
                  <th className="right">Margin</th>
                  <th className="right">Base Rate</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>
                      <div className="font-serif text-md text-ink">{h.quarter}</div>
                    </td>
                    <td className="num text-graphite">{(Number(h.weighted_cost) * 100).toFixed(3)}%</td>
                    <td className="num text-graphite">{(Number(h.op_margin) * 100).toFixed(3)}%</td>
                    <td className="num text-num-ink font-semibold">{(Number(h.base_rate) * 100).toFixed(3)}%</td>
                    <td>
                      <div className="font-mono text-xs text-muted">
                        {h.approved_at ? dayjs(h.approved_at).format('D MMM YYYY') : '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="max-w-3xl mt-6 font-serif italic text-muted text-sm">
            Want to try a different rate?{' '}
            <Link href="/settings?tab=simulator" className="text-accent hover:text-accent-hover not-italic font-medium">
              Run the simulator in Settings →
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
