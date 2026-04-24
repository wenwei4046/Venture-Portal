import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import ExportCSVButton from './_components/ExportCSVButton'

type LoanRow = {
  id: string
  company_id: string
  principal: number
  base_rate: number
  risk_premium: number
  effective_rate: number
  disbursement_date: string | null
  status: 'pending_approval' | 'active' | 'fully_repaid' | 'cancelled'
  created_at: string
}

type OutstandingRow = {
  loan_id: string
  outstanding: number
  total_principal_paid: number
  total_interest_paid: number
}

export default async function FundOutPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

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
          <p className="font-serif italic text-graphite text-base mt-3">
            Loans disbursed by HV to subsidiaries.{' '}
            <em>Rates lock at creation, never change.</em>
          </p>
        </div>
        <div className="flex items-center gap-3">
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
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Total outstanding
          </div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
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
            <span className="count">{loanList.length} TOTAL · MOST RECENT FIRST</span>
          </div>

          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="right">Principal</th>
                  <th className="right">Outstanding</th>
                  <th className="right">Rate</th>
                  <th>Status</th>
                  <th className="right"></th>
                </tr>
              </thead>
              <tbody className="row-stagger">
                {loanList.map((loan, i) => {
                  const company = companyMap.get(loan.company_id)
                  const out = outstandingMap.get(loan.id)
                  const outstanding = Number(out?.outstanding ?? loan.principal)
                  return (
                    <tr
                      key={loan.id}
                      style={{ '--i': i } as React.CSSProperties}
                    >
                      <td>
                        <div className="font-serif text-[15px] text-ink">
                          {company?.name ?? '—'}
                        </div>
                        <div className="font-mono text-[11px] text-graphite mt-0.5">
                          {company?.code ?? ''} · {dayjs(loan.created_at).format('D MMM YYYY')}
                        </div>
                      </td>
                      <td className="num">
                        {formatMoney(Number(loan.principal))}
                      </td>
                      <td className="num">
                        {loan.status === 'active' ? formatMoney(outstanding) : <span className="text-muted">—</span>}
                      </td>
                      <td className="num">
                        {(Number(loan.effective_rate) * 100).toFixed(3)}%
                      </td>
                      <td>
                        <LoanStatusLabel status={loan.status} />
                      </td>
                      <td className="right">
                        <Link
                          href={`/fund-out/${loan.id}`}
                          className="text-sm text-accent hover:text-accent-hover font-serif italic"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function LoanStatusLabel({ status }: { status: LoanRow['status'] }) {
  if (status === 'active') {
    return <em className="font-serif text-graphite text-sm">active</em>
  }
  if (status === 'pending_approval') {
    return <em className="font-serif text-alert text-sm">pending approval</em>
  }
  if (status === 'fully_repaid') {
    return <em className="font-serif text-ledger text-sm">fully repaid</em>
  }
  return <em className="font-serif text-muted text-sm">cancelled</em>
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
