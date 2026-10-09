import Link from 'next/link'
import { Suspense } from 'react'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import FundSourceTabs from './_components/FundSourceTabs'
import FundSourcesTable from './_components/FundSourcesTable'

// Fund IN on the sheet (2026-10-09, the user's Claude Design handoff — Phase 3
// of the Finance revamp): five cards — the paid capital, its weighted cost,
// what is still owed, what matures within 30 days, what awaits the
// Principal — the status tabs counted, and the sources in a scroll box with
// their status as chips. A double-click opens a source; a right-click also
// prints its schedule or amends its terms.

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
  // Recording a fund source raises one: Treasury · Create (2026-10-08, PR2);
  // amending a booked one is Treasury · Approve.
  const canRaise = canDo(user, 'treasury', 'create')
  const canAmend = canDo(user, 'treasury', 'approve')
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

  // The cards are always about the active sources, whichever tab is open.
  const active = sources.filter((s) => s.status === 'active')
  const totalPaid = active.reduce((sum, s) => sum + Number(s.amount), 0)
  const weightedCost =
    totalPaid > 0
      ? active.reduce((sum, s) => sum + Number(s.amount) * Number(s.cost_rate), 0) / totalPaid
      : 0
  const outstandingActive = active.reduce((sum, s) => sum + (outstandingMap.get(s.id) ?? Number(s.amount)), 0)

  const today = officeToday()
  const maturingIn30d = active.filter((s) => {
    if (!s.maturity_date) return false
    const days = dayjs(s.maturity_date).diff(today, 'day')
    return days >= 0 && days <= 30
  })

  // Filter sources by tab
  const tab = statusFilter ?? 'active'
  const filtered = tab === 'all' ? sources : sources.filter((s) => s.status === tab)

  // Status counts for the tabs
  const counts: Record<string, number> = {
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

  const tabWord: Record<string, string> = { pending_approval: 'PENDING', all: 'TOTAL' }

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/ba?calc=1" className="btn-quiet-sheet">
            BA Calculator
          </Link>
          <Link href="/repayment-schedule" className="btn-quiet-sheet">
            Repayment Schedule
          </Link>
          {canRaise ? (
            <Link href="/fund-in/new" className="btn-pri-sheet">
              Record new fund source
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Cards ───────── */}
      <StatCards label="Fund IN">
        <StatCard
          tone="primary"
          label="Total paid capital"
          value={formatMoney(totalPaid)}
          icon="coin"
          note={`${counts.active} active · ${counts.matured} matured · ${counts.repaid} repaid · ${counts.cancelled} cancelled`}
        />
        <StatCard
          label="Weighted average cost"
          value={totalPaid > 0 ? `${(weightedCost * 100).toFixed(3)}% /mo` : '—'}
          icon="percent"
          note="Active sources"
        />
        <StatCard label="Outstanding" value={formatMoney(outstandingActive)} icon="wallet" note="After repayments" />
        <StatCard
          tone={maturingIn30d.length > 0 ? 'wait' : 'default'}
          label="Maturing in 30 days"
          value={String(maturingIn30d.length)}
          icon="calendar"
          note={maturingIn30d.length > 0 ? formatMoney(maturingIn30d.reduce((s, x) => s + Number(x.amount), 0)) : 'None due'}
        />
        <StatCard label="Pending approval" value={String(counts.pending_approval)} icon="clock" note="Awaiting Principal" />
      </StatCards>

      {/* ───────── Status tabs + the list ───────── */}
      {sources.length === 0 ? (
        <EmptyState canRaise={canRaise} />
      ) : (
        <section>
          <Suspense fallback={null}>
            <FundSourceTabs counts={counts} />
          </Suspense>

          <div className="sect-head">
            <h2>Fund sources</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {filtered.length} {tabWord[tab] ?? tab.toUpperCase()}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-8 text-center">
              <p className="font-sans text-muted text-sm">No {tab.replace('_', ' ')} fund sources.</p>
            </div>
          ) : (
            // The queue's small print and footer (2026-10-09).
            <div className="fin-queue">
              <FundSourcesTable
                canSetDefault={canRaise}
                canAmend={canAmend}
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
      <p className="font-sans text-graphite text-lg mb-4">No fund sources yet.</p>
      <p className="font-sans text-muted text-sm mb-6">
        Finance can record the first fund source — subsidiary loan, director loan, or internal pool transfer.
      </p>
      {canRaise ? (
        <Link href="/fund-in/new" className="btn-pri-sheet">
          Record first fund source
        </Link>
      ) : null}
    </div>
  )
}
