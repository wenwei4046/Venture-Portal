import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'

type FundSourceRow = {
  id: string
  source_type: 'subsidiary_savings' | 'director_loan'
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

export default async function FundInPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  // Fetch fund sources + denormalized from-name via two joins
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
            Subsidiary savings + director loans deposited into HV pool.
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
            {active.length} active{' '}
            {active.length === 1 ? 'source' : 'sources'} ·{' '}
            {sources.length - active.length} inactive
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

      {/* ───────── Sources list ───────── */}
      {sources.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          <h2 className="font-serif text-2xl text-ink mb-1">Fund sources</h2>
          <p className="font-serif italic text-graphite text-sm mb-6">
            Sorted by effective date, <em>most recent first</em>
          </p>

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
                {sources.map((source, i) => (
                  <tr
                    key={source.id}
                    style={{ '--i': i } as React.CSSProperties}
                    className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="py-4 pr-4 font-serif italic text-graphite">
                      {source.source_type === 'subsidiary_savings'
                        ? 'Subsidiary savings'
                        : 'Director loan'}
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
    // Check if maturing soon
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
        Finance can record the first subsidiary savings deposit or director loan.
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
