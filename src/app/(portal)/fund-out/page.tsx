import Link from 'next/link'
import { Suspense } from 'react'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, fundingSourceFromTerms } from '@/lib/utils'
import ExportCSVButton from './_components/ExportCSVButton'
import LoansTable from './_components/LoansTable'
import LoanTabs from './_components/LoanTabs'

type LoanRow = {
  id: string
  company_id: string
  principal: number
  base_rate: number
  risk_premium: number
  effective_rate: number
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
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()
  const { status: statusFilter } = await searchParams

  const [
    { data: loans },
    { data: companies },
    { data: outstandingRows },
  ] = await Promise.all([
    supabase.from('loans').select('*').order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid, total_interest_paid'),
  ])

  const loanList = (loans ?? []) as LoanRow[]
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )
  const outstandingMap = new Map(
    (outstandingRows ?? []).map((o) => [o.loan_id, o as OutstandingRow])
  )

  const active = loanList.filter((l) => l.status === 'active')
  const pending = loanList.filter((l) => l.status === 'pending_approval')

  // Tab filter (defaults to active, mirroring Fund IN)
  const tab = statusFilter ?? 'active'
  const filtered = tab === 'all' ? loanList : loanList.filter((l) => l.status === tab)

  const totalOutstanding = active.reduce((sum, l) => {
    const out = outstandingMap.get(l.id)
    return sum + Number(out?.outstanding ?? l.principal)
  }, 0)

  const monthlyInterest = active.reduce((sum, l) => {
    const out = outstandingMap.get(l.id)
    const outstanding = Number(out?.outstanding ?? l.principal)
    return sum + outstanding * Number(l.effective_rate)
  }, 0)

  const weightedRate = totalOutstanding > 0 ? monthlyInterest / totalOutstanding : 0

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · LOANS OUT
          </div>
          <h1 className="page-title">Fund OUT</h1>
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
          <ExportCSVButton />
          <Link
            href="/fund-out/new"
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Record new loan
          </Link>
        </div>
      </div>

      {/* ───────── Hero: outstanding + rate ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Total outstanding
          </div>
          <div className="font-serif text-[30px] sm:text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {totalOutstanding > 0 ? (
              formatMoney(totalOutstanding)
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            {active.length} ACTIVE {active.length === 1 ? 'LOAN' : 'LOANS'}
            {pending.length > 0 ? ` · ${pending.length} PENDING APPROVAL` : ''}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="font-serif italic text-accent text-base mb-1">
            Weighted effective rate
          </div>
          <div className="font-serif text-3xl text-num-ink tabular">
            {weightedRate > 0 ? (
              <>
                {(weightedRate * 100).toFixed(3)}
                <span className="text-graphite text-xl">% /mo</span>
              </>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          {monthlyInterest > 0 ? (
            <p className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
              MONTHLY INTEREST INCOME{' '}
              <span className="text-ledger">{formatMoney(monthlyInterest)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {/* ───────── Loans list ───────── */}
      {loanList.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          <div className="sect-head">
            <h2>Loans</h2>
            <span className="rule" aria-hidden />
            <span className="count">{filtered.length} {tab === 'all' ? 'TOTAL' : tab.replace('_', ' ').toUpperCase()}</span>
          </div>

          <Suspense fallback={null}>
            <LoanTabs />
          </Suspense>

          {filtered.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-8 text-center">
              <p className="font-serif italic text-muted text-sm">
                No {tab.replace('_', ' ')} loans.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <LoansTable
                rows={filtered.map((loan) => {
                  const company = companyMap.get(loan.company_id)
                  const out = outstandingMap.get(loan.id)
                  return {
                    id: loan.id,
                    companyName: company?.name ?? '—',
                    companyCode: company?.code ?? '',
                    createdAt: loan.created_at as string,
                    disbursedAt: loan.disbursement_date,
                    principal: Number(loan.principal),
                    outstanding: Number(out?.outstanding ?? loan.principal),
                    effectiveRate: Number(loan.effective_rate),
                    status: loan.status,
                    fundingSource: fundingSourceFromTerms(loan.repayment_terms),
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

function EmptyState() {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-graphite text-lg mb-4">
        No loans yet.
      </p>
      <p className="font-serif italic text-muted text-sm mb-6">
        Finance can submit the first loan for Principal approval.
      </p>
      <Link
        href="/fund-out/new"
        className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Record first loan
      </Link>
    </div>
  )
}
