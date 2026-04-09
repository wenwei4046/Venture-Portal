import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'

export default async function DashboardPage() {
  await requireAuth()
  const supabase = await createClient()

  // Fetch real counts for the empty-state detection + free-pool calc
  const [
    { count: fundSourcesCount, data: activeFundSources },
    { count: loansCount },
    { count: overdueCount },
    { count: pendingApprovalsCount },
    { data: bufferRow },
  ] = await Promise.all([
    supabase
      .from('fund_sources')
      .select('amount', { count: 'exact' })
      .eq('status', 'active'),
    supabase.from('loans').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('overdue_records').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('treasury_config')
      .select('config_value')
      .eq('config_key', 'buffer_amount')
      .single(),
  ])

  const fundTotal = (activeFundSources ?? []).reduce(
    (sum, r) => sum + Number(r.amount),
    0
  )
  const bufferAmount = Number(bufferRow?.config_value ?? 0)
  // TODO Step 8: subtract loans outstanding (needs loan_outstanding view query)
  const loansOutstanding = 0
  const freePool = fundTotal - loansOutstanding - bufferAmount
  const freePoolAboveBuffer = fundTotal - loansOutstanding - bufferAmount

  const isEmpty = (fundSourcesCount ?? 0) === 0 && (loansCount ?? 0) === 0
  const today = dayjs().format('D MMMM YYYY')

  return (
    <div>
      {/* ───────── Hero grid: 7+5 broadsheet ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 mb-16">
        {/* LEFT 7 columns — Hero number */}
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Free pool
          </div>
          <div className="font-serif text-hero text-ink leading-none mb-3">
            {isEmpty ? (
              <>RM <span className="text-muted">—</span></>
            ) : (
              <>{formatMoney(freePool)}</>
            )}
          </div>
          <div className="font-mono text-xs text-muted">
            As of {today}
            {isEmpty ? ' · no fund sources yet' : ' · 90-day trend'}
          </div>

          {/* Sparkline placeholder */}
          <svg className="w-full h-12 my-7" viewBox="0 0 600 48" preserveAspectRatio="none" aria-hidden="true">
            {isEmpty ? (
              <line x1="0" y1="40" x2="600" y2="40" stroke="#DFD4BE" strokeWidth="1" strokeDasharray="3,3" />
            ) : (
              <>
                <path d="M 0 30 L 40 28 L 80 32 L 120 25 L 160 22 L 200 20 L 240 24 L 280 18 L 320 15 L 360 17 L 400 12 L 440 14 L 480 10 L 520 13 L 560 8 L 600 6"
                  fill="none"
                  stroke="#1A1613"
                  strokeWidth="1.25"
                  vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="40" x2="600" y2="40" stroke="#DFD4BE" strokeWidth="0.5" strokeDasharray="3,3" />
              </>
            )}
          </svg>

          {isEmpty ? (
            <div className="mt-4">
              <p className="font-serif italic text-graphite text-base mb-4">
                No fund sources yet. Start by recording the first one.
              </p>
              <Link
                href="/fund-in"
                className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-md font-serif italic text-sm transition-colors"
              >
                Record first fund source
              </Link>
            </div>
          ) : (
            <div className="text-sm text-graphite">
              {freePoolAboveBuffer >= 0 ? (
                <>
                  Above buffer by{' '}
                  <span className="font-mono tabular text-ledger">
                    {formatMoney(freePoolAboveBuffer)}
                  </span>
                </>
              ) : (
                <em className="font-serif text-danger">
                  Below buffer by {formatMoney(Math.abs(freePoolAboveBuffer))}
                </em>
              )}{' '}
              · Buffer threshold{' '}
              <span className="font-mono tabular">{formatMoney(bufferAmount)}</span>
            </div>
          )}
        </div>

        {/* RIGHT 5 columns — Pending approvals */}
        <div className="lg:col-span-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif italic text-xl text-ink">Pending your hand</h2>
            <span className="font-mono text-xs text-muted">
              {pendingApprovalsCount ?? 0} items
            </span>
          </div>

          {(pendingApprovalsCount ?? 0) === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-6 text-center">
              <p className="font-serif italic text-ledger text-base">
                All caught up.
              </p>
              <p className="text-xs text-muted mt-1">
                No approvals waiting.
              </p>
            </div>
          ) : (
            <p className="text-sm text-graphite">
              {pendingApprovalsCount} pending · approval list coming in Step 9
            </p>
          )}
        </div>
      </div>

      {/* ───────── Subsidiaries section ───────── */}
      <section>
        <h2 className="font-serif text-2xl text-ink mb-1">Subsidiaries</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          Seven entities, <em>net position as of this morning</em>
        </p>

        <div className="border-t border-hairline">
          {isEmpty ? (
            <div className="py-10 text-center">
              <p className="font-serif italic text-muted text-base">
                Subsidiary data loads once fund sources and loans are recorded.
              </p>
            </div>
          ) : (
            <p className="py-6 text-sm text-graphite">
              Subsidiary position list coming in Step 9 (dashboard_summary RPC).
            </p>
          )}
        </div>
      </section>

      {/* ───────── Phase 1 status note ───────── */}
      <div className="mt-16 pt-8 border-t border-hairline">
        <p className="font-mono text-xs text-muted">
          Phase 1 Treasury · Step {isEmpty ? '5 of 9' : '6 of 9'} ·{' '}
          {fundSourcesCount ?? 0} fund sources · {loansCount ?? 0} loans ·{' '}
          {overdueCount ?? 0} overdue
        </p>
      </div>
    </div>
  )
}
