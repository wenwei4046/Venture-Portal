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
    supabase.from('companies').select('id, name, short_code, tier'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid, total_interest_paid'),
  ])

  const loanList = (loans ?? []) as LoanRow[]
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code, tier: c.tier }])
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
      <div className="flex items-baseline justify-between mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Fund OUT</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
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
          <div className="font-serif text-hero text-ink leading-none">
            {totalOutstanding > 0 ? (
              formatMoney(totalOutstanding)
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {active.length} active {active.length === 1 ? 'loan' : 'loans'}
            {pending.length > 0 ? ` · ${pending.length} pending approval` : ''}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="font-serif italic text-accent text-base mb-1">
            Weighted effective rate
          </div>
          <div className="font-serif text-3xl text-ink">
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
            <p className="font-mono text-xs text-muted mt-2">
              Monthly interest income{' '}
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
          <h2 className="font-serif text-2xl text-ink mb-1">Loans</h2>
          <p className="font-serif italic text-graphite text-sm mb-6">
            Sorted by creation date, <em>most recent first</em>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Company</th>
                  <th className="text-right py-3 pr-4 font-medium">Principal</th>
                  <th className="text-right py-3 pr-4 font-medium">Outstanding</th>
                  <th className="text-right py-3 pr-4 font-medium">Rate</th>
                  <th className="text-right py-3 pr-4 font-medium">Tier</th>
                  <th className="text-left py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {loanList.map((loan) => {
                  const company = companyMap.get(loan.company_id)
                  const out = outstandingMap.get(loan.id)
                  const outstanding = Number(out?.outstanding ?? loan.principal)
                  return (
                    <tr
                      key={loan.id}
                      className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="py-4 pr-4">
                        <div className="font-serif text-md text-ink">
                          {company?.name ?? '—'}
                        </div>
                        <div className="font-mono text-xs text-muted">
                          {company?.code ?? ''} · {dayjs(loan.created_at).format('D MMM YYYY')}
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(Number(loan.principal))}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {loan.status === 'active' ? formatMoney(outstanding) : '—'}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {(Number(loan.effective_rate) * 100).toFixed(3)}%
                      </td>
                      <td className="py-4 pr-4 text-right font-mono text-graphite">
                        {company?.tier ?? '—'}
                      </td>
                      <td className="py-4 pr-4">
                        <LoanStatusLabel status={loan.status} />
                      </td>
                      <td className="py-4 text-right">
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
