import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import Link from 'next/link'
import { officeTime } from '@/lib/office-time'
import BaseRateTrendChart from './_components/BaseRateTrendChart'
import BaseRateHistoryTable from './_components/BaseRateHistoryTable'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export default async function BaseRateHistoryPage() {
  await requirePage('/reports/base-rate')
  const user = await requirePermission('reports')
  const supabase = await createClient()

  const { data: history } = await supabase
    .from('base_rate_history')
    .select('*')
    .order('approved_at', { ascending: false })
    .limit(20)

  // On the sheet (2026-10-09, the user's Claude Design handoff): the current
  // rate and its parts as cards, then the trend and the history.
  const list = history ?? []
  const now = list[0]
  const prev = list[1]
  const pct = (v: unknown) => `${(Number(v) * 100).toFixed(3)}%`
  const change = now && prev ? Number(now.base_rate) - Number(prev.base_rate) : null

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · BASE RATE HISTORY
          </div>
          <h1 className="page-title">Base Rate History</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href="/reports/base-rate/export?format=xlsx" className="btn-quiet-sheet">
            Export Excel
          </a>
          <a href="/reports/base-rate/export?format=pdf" className="btn-quiet-sheet">
            Export PDF
          </a>
        </div>
      </div>

      {now ? (
        <StatCards label="Base rate">
          <StatCard
            label="Current base rate"
            value={`${pct(now.base_rate)}/mo`}
            icon="percent"
            tone="primary"
            note={`${now.quarter} · approved ${now.approved_at ? officeTime(now.approved_at).format('D MMM YYYY') : '—'}`}
          />
          <StatCard label="Weighted cost" value={pct(now.weighted_cost)} icon="layers" note="Cost of fund sources" />
          <StatCard label="Op margin" value={pct(now.op_margin)} icon="trend" note="Set in Treasury config" />
          <StatCard
            label="Change vs last quarter"
            value={change == null ? '—' : `${change >= 0 ? '+' : '−'}${(Math.abs(change) * 100).toFixed(3)}%`}
            icon="swap"
            note={prev ? `vs ${prev.quarter}` : 'No earlier quarter'}
          />
        </StatCards>
      ) : null}

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
        <section className="mb-6">
          <div className="sect-head">
            <h2>History</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              LAST {list.length} {list.length === 1 ? 'QUARTER' : 'QUARTERS'}
            </span>
          </div>
          {/* 2026-10-10 — the handoff's sheet table (it was a plain table). */}
          <BaseRateHistoryTable
            // Whoever runs Settings, where this page sits (Finance, the Principal).
            canSetDefault={canDo(user, 'categories', 'manage')}
            rows={history.map((h) => ({
              id: h.id as string,
              quarter: h.quarter as string,
              weightedCost: Number(h.weighted_cost),
              opMargin: Number(h.op_margin),
              baseRate: Number(h.base_rate),
              approvedDay: h.approved_at ? officeTime(h.approved_at).format('YYYY-MM-DD') : null,
              approvedText: h.approved_at ? officeTime(h.approved_at).format('D MMM YYYY') : '—',
            }))}
          />
          <p className="max-w-3xl mt-4 text-xs text-graphite">
            <Link href="/settings?tab=simulator" className="text-accent hover:text-accent-hover font-medium">
              Run the simulator in Settings →
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
