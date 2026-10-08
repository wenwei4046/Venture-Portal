import Link from 'next/link'
import { Suspense } from 'react'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import FundSourceTabs from './_components/FundSourceTabs'
import FundSourcesTable from './_components/FundSourcesTable'

const SOURCE_TYPE_LABELS: Record<string, string> = {
  subsidiary: 'Subsidiary',
  director_loan: 'Director loan',
  department_pool: 'Dept pool',
  director_saving: 'Director saving',
  outsource: 'Outsource',
}

type FundSourceRow = {
  id: string
  source_type: string
  from_company_id: string | null
  from_director_id: string | null
  from_department_id: string | null
  from_freetext_name: string | null
  amount: number
  cost_rate: number
  lock_in_months: number | null
  effective_date: string
  maturity_date: string | null
  status: 'pending_approval' | 'active' | 'matured' | 'repaid' | 'cancelled'
  notes: string | null
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function FundInPage({ searchParams }: Props) {
  const user = await requirePermission('treasury')
  // Recording a fund source raises one: Treasury · Create (2026-10-08, PR2).
  const canRaise = canDo(user, 'treasury', 'create')
  const supabase = await createClient()
  const { status: statusFilter } = await searchParams

  const [
    { data: fundSources },
    { data: companies },
    { data: directors },
    { data: departments },
    { data: outstandingRows },
  ] = await Promise.all([
    supabase
      .from('fund_sources')
      .select('*')
      .order('effective_date', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('directors').select('id, name, code'),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a fund source.
    supabase.from('departments').select('id, name').eq('is_internal', false),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding'),
  ])

  const sources = (fundSources ?? []) as FundSourceRow[]
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )
  const directorMap = new Map(
    (directors ?? []).map((d) => [d.id, { name: d.name, code: d.code }])
  )
  const deptMap = new Map(
    (departments ?? []).map((d) => [d.id, d.name])
  )
  const outstandingMap = new Map(
    ((outstandingRows ?? []) as { fund_source_id: string; outstanding: number }[]).map(
      (o) => [o.fund_source_id, Number(o.outstanding)]
    )
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
    const days = dayjs(s.maturity_date).diff(officeToday(), 'day')
    return days >= 0 && days <= 30
  })

  // Filter sources by tab
  const tab = statusFilter ?? 'active'
  const filtered = tab === 'all' ? sources : sources.filter((s) => s.status === tab)

  // Status counts for tab badges
  const counts = {
    pending_approval: sources.filter((s) => s.status === 'pending_approval').length,
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
    if (s.from_department_id) {
      const name = deptMap.get(s.from_department_id)
      return name ?? '—'
    }
    // Item 4: free-text takes priority over legacy from_director_id; fallback
    // for old director_loan rows where free-text wasn't backfilled.
    if (s.from_freetext_name) {
      return s.from_freetext_name
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
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · CAPITAL IN
          </div>
          <h1 className="page-title">Fund IN</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/ba?calc=1"
            className="bg-surface hover:bg-surface-2 border border-hairline text-graphite hover:text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            BA Calculator
          </Link>
          <Link
            href="/repayment-schedule"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Repayment Schedule
          </Link>
          {canRaise ? (
            <Link
              href="/fund-in/new"
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Record new fund source
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Summary hero ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Total paid capital
          </div>
          <div className="statement-amount text-num-ink">
            {totalPaid > 0 ? (
              <>
                RM {formatMoney(totalPaid).replace('RM ', '').replace(/\.\d{2}$/, '')}
                <span className="text-graphite">
                  {formatMoney(totalPaid).slice(-3)}
                </span>
              </>
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            {counts.active} ACTIVE · {counts.matured} MATURED · {counts.repaid} REPAID · {counts.cancelled} CANCELLED
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="font-serif italic text-accent text-base mb-1">
            Weighted average cost
          </div>
          <div className="font-serif text-3xl text-num-ink tabular">
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
        <EmptyState canRaise={canRaise} />
      ) : (
        <section>
          <div className="sect-head">
            <h2>Fund sources</h2>
            <span className="rule" aria-hidden />
            <span className="count">{filtered.length} {tab === 'all' ? 'TOTAL' : tab.toUpperCase()}</span>
          </div>

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
              <FundSourcesTable
                rows={filtered.map((source) => ({
                  id: source.id,
                  typeLabel: SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type,
                  fromLabel: getFromLabel(source),
                  effectiveDate: source.effective_date,
                  amount: Number(source.amount),
                  outstanding:
                    source.status === 'active' || source.status === 'matured'
                      ? outstandingMap.get(source.id) ?? Number(source.amount)
                      : null,
                  costRate: Number(source.cost_rate),
                  lockInMonths: source.lock_in_months,
                  maturityDate: source.maturity_date,
                  status: source.status,
                  notes: source.notes,
                }))}
              />
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function EmptyState({ canRaise }: { canRaise: boolean }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-graphite text-lg mb-4">
        No fund sources yet.
      </p>
      <p className="font-serif italic text-muted text-sm mb-6">
        Finance can record the first fund source — subsidiary loan, director loan, or internal pool transfer.
      </p>
      {canRaise ? (
        <Link
          href="/fund-in/new"
          className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          Record first fund source
        </Link>
      ) : null}
    </div>
  )
}
