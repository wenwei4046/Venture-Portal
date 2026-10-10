import Link from 'next/link'
import { Suspense } from 'react'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, fundingSourceFromTerms } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import ExportCSVButton from './_components/ExportCSVButton'
import LoansTable from './_components/LoansTable'
import LoanTabs from './_components/LoanTabs'

// Fund OUT on the sheet (2026-10-09, the user's Claude Design handoff — Phase 3
// of the Finance revamp): five cards — what is lent out, the weighted rate,
// its spread over the cost of the funds (Fund IN's weighted cost), what
// matures within 30 days, what is overdue (an open record on the Overdue
// page) — the status tabs counted with Overdue among them, and the loans in a
// scroll box with their status as chips.

type LoanRow = {
  id: string
  company_id: string
  principal: number
  base_rate: number
  risk_premium: number
  effective_rate: number
  tenure_months: number | null
  disbursement_date: string | null
  repayment_terms: string | null
  status: 'pending_approval' | 'active' | 'fully_repaid' | 'cancelled'
  created_at: string
}

type OutstandingRow = {
  loan_id: string
  outstanding: number
  total_principal_paid: number
  total_interest_paid: number
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function FundOutPage({ searchParams }: Props) {
  await requirePage('/fund-out')
  const user = await requirePermission('treasury')
  // Recording a loan raises one; the CSV is an export; amending a booked loan
  // is Treasury · Approve (2026-10-08, PR2).
  const canRaise = canDo(user, 'treasury', 'create')
  const canAmend = canDo(user, 'treasury', 'approve')
  const supabase = await createClient()
  const { status: statusFilter } = await searchParams

  const [
    { data: loans },
    { data: companies },
    { data: outstandingRows },
    { data: overdueRows },
    { data: sourceRows },
  ] = await Promise.all([
    supabase.from('loans').select('*').order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid, total_interest_paid'),
    // Overdue = an open record on the Overdue page (Detect overdue writes them).
    supabase.from('overdue_records').select('loan_id').eq('status', 'pending'),
    // The cost of the funds: Fund IN's active sources.
    supabase.from('fund_sources').select('amount, cost_rate').eq('status', 'active'),
  ])

  const loanList = (loans ?? []) as LoanRow[]
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )
  const outstandingMap = new Map(
    (outstandingRows ?? []).map((o) => [o.loan_id, o as OutstandingRow])
  )
  const overdueIds = new Set(((overdueRows ?? []) as Array<{ loan_id: string }>).map((o) => o.loan_id))
  const outstandingOf = (l: LoanRow) => Number(outstandingMap.get(l.id)?.outstanding ?? l.principal)

  const active = loanList.filter((l) => l.status === 'active')
  const overdue = active.filter((l) => overdueIds.has(l.id))
  const pending = loanList.filter((l) => l.status === 'pending_approval')
  const repaid = loanList.filter((l) => l.status === 'fully_repaid')

  const totalOutstanding = active.reduce((sum, l) => sum + outstandingOf(l), 0)
  const monthlyInterest = active.reduce((sum, l) => sum + outstandingOf(l) * Number(l.effective_rate), 0)
  const weightedRate = totalOutstanding > 0 ? monthlyInterest / totalOutstanding : 0

  const sources = (sourceRows ?? []) as Array<{ amount: number; cost_rate: number }>
  const capital = sources.reduce((s, x) => s + Number(x.amount), 0)
  const costOfFunds = capital > 0 ? sources.reduce((s, x) => s + Number(x.amount) * Number(x.cost_rate), 0) / capital : 0
  const spread = weightedRate - costOfFunds

  // Maturing within 30 days: a scheduled loan's disbursement + its tenure.
  const today = officeToday()
  const maturing = active.filter((l) => {
    if (isLoanUnscheduled(l.repayment_terms) || !l.disbursement_date || !l.tenure_months) return false
    const days = dayjs(l.disbursement_date).add(Number(l.tenure_months), 'month').diff(today, 'day')
    return days >= 0 && days <= 30
  })

  // Tab filter (defaults to active, mirroring Fund IN)
  const tab = statusFilter ?? 'active'
  const filtered =
    tab === 'all' ? loanList : tab === 'overdue' ? overdue : loanList.filter((l) => l.status === tab)
  const counts: Record<string, number> = {
    pending_approval: pending.length,
    active: active.length,
    overdue: overdue.length,
    fully_repaid: repaid.length,
    cancelled: loanList.filter((l) => l.status === 'cancelled').length,
    all: loanList.length,
  }
  const tabWord: Record<string, string> = { pending_approval: 'PENDING', fully_repaid: 'REPAID', all: 'TOTAL' }
  const pct = (n: number) => `${(n * 100).toFixed(3)}% /mo`

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · CAPITAL OUT
          </div>
          <h1 className="page-title">Fund OUT</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/ba?calc=1" className="btn-quiet-sheet">
            BA Calculator
          </Link>
          <Link href="/repayment-schedule" className="btn-quiet-sheet">
            Repayment Schedule
          </Link>
          {canDo(user, 'treasury', 'export') ? <ExportCSVButton /> : null}
          {canRaise ? (
            <Link href="/fund-out/new" className="btn-pri-sheet">
              Record new loan
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Cards ───────── */}
      <StatCards label="Fund OUT">
        <StatCard
          tone="primary"
          label="Total outstanding"
          value={formatMoney(totalOutstanding)}
          icon="send"
          note={`${active.length} active · ${overdue.length} overdue · ${repaid.length} repaid${pending.length > 0 ? ` · ${pending.length} pending approval` : ''}`}
        />
        <StatCard
          label="Weighted effective rate"
          value={totalOutstanding > 0 ? pct(weightedRate) : '—'}
          icon="percent"
          note={`Monthly interest income ${formatMoney(monthlyInterest)}`}
        />
        <StatCard
          tone={totalOutstanding > 0 && capital > 0 ? (spread >= 0 ? 'ledger' : 'danger') : 'default'}
          label="Net spread"
          value={totalOutstanding > 0 && capital > 0 ? pct(spread) : '—'}
          icon="trend"
          note={capital > 0 ? `Over ${(costOfFunds * 100).toFixed(3)}% cost of funds` : 'No active fund sources'}
        />
        <StatCard
          tone={maturing.length > 0 ? 'wait' : 'default'}
          label="Maturing in 30 days"
          value={String(maturing.length)}
          icon="calendar"
          note={maturing.length > 0 ? formatMoney(maturing.reduce((s, l) => s + outstandingOf(l), 0)) : 'None due'}
        />
        <StatCard
          tone={overdue.length > 0 ? 'danger' : 'default'}
          label="Overdue"
          value={formatMoney(overdue.reduce((s, l) => s + outstandingOf(l), 0))}
          icon="alert"
          href={overdue.length > 0 ? '/overdue' : undefined}
          note={overdue.length > 0 ? `${overdue.length} ${overdue.length === 1 ? 'loan' : 'loans'} · see Overdue` : 'None'}
        />
      </StatCards>

      {/* ───────── Status tabs + the list ───────── */}
      {loanList.length === 0 ? (
        <EmptyState canRaise={canRaise} />
      ) : (
        <section>
          <Suspense fallback={null}>
            <LoanTabs counts={counts} />
          </Suspense>

          <div className="sect-head">
            <h2>Loans</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {filtered.length} {tabWord[tab] ?? tab.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-8 text-center">
              <p className="font-sans text-muted text-sm">No {tab.replace('_', ' ')} loans.</p>
            </div>
          ) : (
            // The queue's small print and footer (2026-10-09).
            <div className="fin-queue">
              <LoansTable
                canSetDefault={canRaise}
                canAmend={canAmend}
                rows={filtered.map((loan) => {
                  const company = companyMap.get(loan.company_id)
                  return {
                    id: loan.id,
                    companyName: company?.name ?? '—',
                    companyCode: company?.code ?? '',
                    createdAt: loan.created_at as string,
                    disbursedAt: loan.disbursement_date,
                    principal: Number(loan.principal),
                    outstanding: outstandingOf(loan),
                    effectiveRate: Number(loan.effective_rate),
                    status: loan.status,
                    fundingSource: fundingSourceFromTerms(loan.repayment_terms),
                    overdue: loan.status === 'active' && overdueIds.has(loan.id),
                  }
                })}
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
      <p className="font-sans text-graphite text-lg mb-4">No loans yet.</p>
      <p className="font-sans text-muted text-sm mb-6">Finance can submit the first loan for Principal approval.</p>
      {canRaise ? (
        <Link href="/fund-out/new" className="btn-pri-sheet">
          Record first loan
        </Link>
      ) : null}
    </div>
  )
}
