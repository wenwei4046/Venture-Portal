import Link from 'next/link'
import { Suspense } from 'react'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import FundSourceTabs from './_components/FundSourceTabs'

const SOURCE_TYPE_LABELS: Record<string, string> = {
  subsidiary: 'Subsidiary',
  director_loan: 'Director loan',
  department_pool: 'Dept pool',
  director_saving: 'Director saving',
}

type FundSourceRow = {
  id: string
  source_type: string
  from_company_id: string | null
  from_director_id: string | null
  amount: number
  cost_rate: number
  lock_in_months: number | null
  effective_date: string
  maturity_date: string | null
  status: 'active' | 'matured' | 'repaid' | 'cancelled'
  notes: string | null
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function FundInPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()
  const { status: statusFilter } = await searchParams

  const [
    { data: fundSources },
    { data: companies },
    { data: directors },
  ] = await Promise.all([
    supabase
      .from('fund_sources')
      .select('*')
      .order('effective_date', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('directors').select('id, name, code'),
  ])

  const sources = (fundSources ?? []) as FundSourceRow[]
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )
  const directorMap = new Map(
    (directors ?? []).map((d) => [d.id, { name: d.name, code: d.code }])
  )

  // Active sources for hero metrics (always based on active, regardless of tab)
  const active = sources.filter((s) => s.status === 'active')
  const totalPaid = active.reduce((sum, s) => sum + Number(s.amount), 0)
  const weightedCost =
    totalPaid > 0
      ? active.reduce((sum, s) => sum + Number(s.amount) * Number(s.cost_rate), 0) / totalPaid
      : 0

  const maturingIn30d = active.filter((s) => {
    if (!s.maturity_date) return false
    const days = dayjs(s.maturity_date).diff(dayjs(), 'day')
    return days >= 0 && days <= 30
  })

  // Filter sources by tab
  const tab = statusFilter ?? 'active'
  const filtered = tab === 'all' ? sources : sources.filter((s) => s.status === tab)

  // Status counts for tab badges
  const counts = {
    active: sources.filter((s) => s.status === 'active').length,
    matured: sources.filter((s) => s.status === 'matured').length,
    repaid: sources.filter((s) => s.status === 'repaid').length,
    cancelled: sources.filter((s) => s.status === 'cancelled').length,
    all: sources.length,
  }

  const getFromLabel = (s: FundSourceRow) => {
    if (s.from_company_id) {
      const c = companyMap.get(s.from_company_id)
      return c ? `${c.name} (${c.code})` : '—'
    }
    if (s.from_director_id) {
      const d = directorMap.get(s.from_director_id)
      return d ? `${d.name} (${d.code})` : '—'
    }
    return '—'
  }

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Fund IN</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Capital borrowed from subsidiaries, directors, department pools, and director savings.
          </p>
        </div>
        <Link
          href="/fund-in/new"
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          Record new fund source
        </Link>
      </div>

      {/* ───────── Summary hero ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Total paid capital
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {totalPaid > 0 ? (
              <>
                RM {formatMoney(totalPaid).replace('RM ', '').replace(/\.\d{2}$/, '')}
                <span className="text-[32px] text-graphite">
                  {formatMoney(totalPaid).slice(-3)}
                </span>
              </>
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {counts.active} active · {counts.matured} matured · {counts.repaid} repaid · {counts.cancelled} cancelled
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="font-serif italic text-accent text-base mb-1">
            Weighted average cost
          </div>
          <div className="font-serif text-3xl text-ink">
            {totalPaid > 0 ? (
              <>
                {(weightedCost * 100).toFixed(3)}
                <span className="text-graphite text-xl">% /mo</span>
              </>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          {maturingIn30d.length > 0 ? (
            <p className="font-serif italic text-alert text-sm mt-4">
              {maturingIn30d.length} source
              {maturingIn30d.length === 1 ? '' : 's'} maturing in next 30 days
            </p>
          ) : null}
        </div>
      </div>

      {/* ───────── Status tabs ───────── */}
      {sources.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          <h2 className="font-serif text-2xl text-ink mb-1">Fund sources</h2>
          <p className="font-serif italic text-graphite text-sm mb-6">
            {filtered.length} {tab === 'all' ? 'total' : tab} source{filtered.length === 1 ? '' : 's'}
          </p>

          <Suspense fallback={null}>
            <FundSourceTabs />
          </Suspense>

          {filtered.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-8 text-center">
              <p className="font-serif italic text-muted text-sm">
                No {tab} fund sources.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Type</th>
                    <th className="text-left py-3 pr-4 font-medium">From</th>
                    <th className="text-right py-3 pr-4 font-medium">Amount</th>
                    <th className="text-right py-3 pr-4 font-medium">Rate</th>
                    <th className="text-right py-3 pr-4 font-medium">Lock-in</th>
                    <th className="text-right py-3 pr-4 font-medium">Maturity</th>
                    <th className="text-left py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="row-stagger">
                  {filtered.map((source, i) => (
                    <tr
                      key={source.id}
                      style={{ '--i': i } as React.CSSProperties}
                      className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="py-4 pr-4 font-serif italic text-graphite">
                        {SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type}
                      </td>
                      <td className="py-4 pr-4 font-serif text-md text-ink">
                        {getFromLabel(source)}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(Number(source.amount))}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {(Number(source.cost_rate) * 100).toFixed(3)}%
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">
                        {source.lock_in_months ? `${source.lock_in_months} mo` : '—'}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">
                        {source.maturity_date
                          ? dayjs(source.maturity_date).format('D MMM YYYY')
                          : '—'}
                      </td>
                      <td className="py-4 pr-4">
                        <StatusLabel status={source.status} maturityDate={source.maturity_date} />
                      </td>
                      <td className="py-4 text-right">
                        <Link
                          href={`/fund-in/${source.id}`}
                          className="text-sm text-accent hover:text-accent-hover font-serif italic"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function StatusLabel({
  status,
  maturityDate,
}: {
  status: FundSourceRow['status']
  maturityDate: string | null
}) {
  if (status === 'active') {
    if (maturityDate) {
      const days = dayjs(maturityDate).diff(dayjs(), 'day')
      if (days >= 0 && days <= 30) {
        return (
          <em className="font-serif text-alert text-sm">
            matures in {days}d
          </em>
        )
      }
      if (days < 0) {
        return <em className="font-serif text-alert text-sm">past maturity</em>
      }
    }
    return <em className="font-serif text-graphite text-sm">active</em>
  }
  if (status === 'matured') {
    return <em className="font-serif text-alert text-sm">matured</em>
  }
  if (status === 'repaid') {
    return <em className="font-serif text-ledger text-sm">repaid</em>
  }
  return <em className="font-serif text-muted text-sm">cancelled</em>
}

function EmptyState() {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-graphite text-lg mb-4">
        No fund sources yet.
      </p>
      <p className="font-serif italic text-muted text-sm mb-6">
        Finance can record the first fund source — subsidiary loan, director loan, or internal pool transfer.
      </p>
      <Link
        href="/fund-in/new"
        className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Record first fund source
      </Link>
    </div>
  )
}
