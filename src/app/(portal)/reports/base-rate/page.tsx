import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import Link from 'next/link'
import dayjs from 'dayjs'

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

      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">Base Rate History</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Quarterly weighted cost + op margin = base rate.
        </p>
      </div>

      {(!history || history.length === 0) ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-1">No base rate history yet.</p>
          <p className="font-serif italic text-muted text-sm mb-4">Principal approves base rate changes in Settings.</p>
          <Link
            href="/settings#base-rate-simulator"
            className="font-serif italic text-sm text-accent hover:text-accent-hover"
          >
            Simulate a new base rate →
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto max-w-3xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Quarter</th>
                  <th className="text-right py-3 pr-4 font-medium">Wtd Cost</th>
                  <th className="text-right py-3 pr-4 font-medium">Margin</th>
                  <th className="text-right py-3 pr-4 font-medium">Base Rate</th>
                  <th className="text-left py-3 font-medium">Approved</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-b border-hairline last:border-0">
                    <td className="py-4 pr-4 font-serif text-md text-ink">{h.quarter}</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">{(Number(h.weighted_cost) * 100).toFixed(3)}%</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">{(Number(h.op_margin) * 100).toFixed(3)}%</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">{(Number(h.base_rate) * 100).toFixed(3)}%</td>
                    <td className="py-4 font-mono text-xs text-muted">
                      {h.approved_at ? dayjs(h.approved_at).format('D MMM YYYY') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="max-w-3xl mt-6 font-serif italic text-muted text-sm">
            Want to try a different rate?{' '}
            <Link href="/settings#base-rate-simulator" className="text-accent hover:text-accent-hover not-italic font-medium">
              Run the simulator in Settings →
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
