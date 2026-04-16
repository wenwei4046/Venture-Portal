import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { cancelLoan } from '../actions'
import RepaymentForm from '../_components/RepaymentForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LoanDetailPage({ params }: Props) {
  const user = await requireRole(['principal', 'finance'])
  const { id } = await params
  const supabase = await createClient()

  const { data: loan, error } = await supabase
    .from('loans')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !loan) notFound()

  const [
    { data: company },
    { data: outstanding },
    { data: repayments },
    { data: approver },
    { data: creator },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('name, short_code')
      .eq('id', loan.company_id)
      .single(),
    supabase
      .from('loan_outstanding')
      .select('outstanding, total_principal_paid, total_interest_paid, total_penalty_paid')
      .eq('loan_id', loan.id)
      .single(),
    supabase
      .from('repayments')
      .select('*')
      .eq('loan_id', loan.id)
      .order('payment_date', { ascending: false }),
    loan.approved_by
      ? supabase.from('users').select('name').eq('id', loan.approved_by).single()
      : Promise.resolve({ data: null }),
    supabase.from('users').select('name').eq('id', loan.created_by).single(),
  ])

  const outstandingAmount = Number(outstanding?.outstanding ?? loan.principal)
  const monthlyInterest = outstandingAmount * Number(loan.effective_rate)
  const totalPrincipalPaid = Number(outstanding?.total_principal_paid ?? 0)
  const totalInterestPaid = Number(outstanding?.total_interest_paid ?? 0)
  const repaymentList = repayments ?? []
  const tenureMonths = Number(loan.tenure_months ?? 0)
  const maturityDate = loan.disbursement_date && tenureMonths > 0
    ? dayjs(loan.disbursement_date).add(tenureMonths, 'month')
    : null

  const canRecordRepayment = user.role === 'finance' && loan.status === 'active'
  const canCancelLoan = user.role === 'finance' && loan.status === 'pending_approval'

  return (
    <div>
      <Link
        href="/fund-out"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Fund OUT
      </Link>

      {/* ───────── Header ───────── */}
      <div className="flex items-baseline justify-between mt-3 mb-10">
        <div>
          <p className="font-serif italic text-accent text-base mb-1">Loan to</p>
          <h1 className="font-serif text-3xl text-ink">{company?.name ?? '—'}</h1>
          <p className="font-mono text-xs text-muted mt-1">
            {company?.short_code} · Created{' '}
            {dayjs(loan.created_at).format('D MMM YYYY')}
          </p>
        </div>
        <LoanStatus status={loan.status} />
      </div>

      {/* ───────── Hero outstanding ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-graphite text-sm mb-1">
            {loan.status === 'active' ? 'Outstanding' : 'Principal'}
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {formatMoney(
              loan.status === 'active' ? outstandingAmount : Number(loan.principal)
            )}
          </div>
          {loan.status === 'active' && totalPrincipalPaid > 0 ? (
            <div className="font-mono text-xs text-muted mt-2">
              Repaid {formatMoney(totalPrincipalPaid)} of{' '}
              {formatMoney(Number(loan.principal))}
            </div>
          ) : (
            <div className="font-mono text-xs text-muted mt-2">
              Principal {formatMoney(Number(loan.principal))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="font-serif italic text-graphite text-sm mb-1">
              Effective rate
            </div>
            <div className="font-serif text-3xl text-ink">
              {(Number(loan.effective_rate) * 100).toFixed(3)}
              <span className="text-graphite text-xl">% /mo</span>
            </div>
            <div className="font-mono text-xs text-muted mt-1">
              {(Number(loan.base_rate) * 100).toFixed(3)}% base +{' '}
              {(Number(loan.risk_premium) * 100).toFixed(3)}% custom
            </div>
          </div>

          {loan.status === 'active' ? (
            <div>
              <div className="font-serif italic text-graphite text-sm mb-1">
                Monthly interest
              </div>
              <div className="font-serif text-xl text-ink">
                {formatMoney(monthlyInterest)}
              </div>
            </div>
          ) : null}

          <div>
            <div className="font-serif italic text-graphite text-sm mb-1">
              Tenure
            </div>
            <div className="font-serif text-xl text-ink">
              {tenureMonths} {tenureMonths === 1 ? 'month' : 'months'}
            </div>
            {maturityDate ? (
              <div className="font-mono text-xs text-muted mt-1">
                Matures {maturityDate.format('D MMM YYYY')}
              </div>
            ) : (
              <div className="font-mono text-xs text-muted mt-1 italic font-serif">
                Maturity set once disbursed
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ───────── Approval info ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-3">Approval trail</h2>
        <div className="font-sans text-sm text-graphite space-y-1">
          <div>
            Submitted by{' '}
            <span className="text-ink font-serif italic">{creator?.name ?? '—'}</span>{' '}
            on{' '}
            <span className="font-mono text-muted">
              {dayjs(loan.created_at).format('D MMM YYYY HH:mm')}
            </span>
          </div>
          {loan.approved_at ? (
            <div>
              Approved by{' '}
              <span className="text-ink font-serif italic">
                {approver?.name ?? '—'}
              </span>{' '}
              on{' '}
              <span className="font-mono text-muted">
                {dayjs(loan.approved_at).format('D MMM YYYY HH:mm')}
              </span>
              {loan.disbursement_date ? (
                <>
                  {' '}· Disbursed{' '}
                  <span className="font-mono text-muted">
                    {dayjs(loan.disbursement_date).format('D MMM YYYY')}
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <div className="italic font-serif">
              <em className="text-alert">Awaiting Principal approval</em>
            </div>
          )}
        </div>

        {canCancelLoan ? (
          <form action={cancelLoan} className="mt-5">
            <input type="hidden" name="id" value={loan.id} />
            <button
              type="submit"
              className="text-sm text-alert border border-alert/30 px-4 py-2 rounded-md hover:bg-alert/5 font-sans transition-colors"
            >
              Cancel this loan
            </button>
            <p className="text-xs text-muted mt-1.5 italic font-serif">
              Finance can cancel before Principal approves. The loan and its approval request are
              both marked rejected in one transaction.
            </p>
          </form>
        ) : null}

        {loan.repayment_terms ? (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted font-sans mb-1">
              Repayment terms
            </div>
            <p className="font-serif italic text-graphite text-sm whitespace-pre-wrap">
              {loan.repayment_terms}
            </p>
          </div>
        ) : null}
      </section>

      {/* ───────── Repayment history ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">Repayment history</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Interest, principal, penalty, and netting entries.
        </p>

        {repaymentList.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No repayments recorded yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Date</th>
                  <th className="text-left py-3 pr-4 font-medium">Type</th>
                  <th className="text-right py-3 pr-4 font-medium">Amount</th>
                  <th className="text-left py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {repaymentList.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="py-3 pr-4 font-mono tabular font-medium text-ink">
                      {dayjs(r.payment_date).format('D MMM YYYY')}
                    </td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">
                      {r.payment_type}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(Number(r.amount))}
                    </td>
                    <td className="py-3 text-sm text-muted italic font-serif">
                      {r.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 pt-4 border-t border-hairline text-xs font-mono text-muted flex flex-wrap gap-6">
              <span>
                Principal paid: <span className="text-ink">{formatMoney(totalPrincipalPaid)}</span>
              </span>
              <span>
                Interest paid: <span className="text-ink">{formatMoney(totalInterestPaid)}</span>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ───────── Record repayment form (Finance, active loans only) ───────── */}
      {canRecordRepayment ? (
        <section className="border-t border-hairline pt-8">
          <h2 className="font-serif text-xl text-ink mb-1">Record repayment</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Finance enters interest/principal/penalty payments.
          </p>
          <RepaymentForm loanId={loan.id} outstanding={outstandingAmount} />
        </section>
      ) : null}
    </div>
  )
}

function LoanStatus({ status }: { status: string }) {
  if (status === 'active') {
    return <span className="status-morph font-serif italic text-graphite text-md">active</span>
  }
  if (status === 'pending_approval') {
    return <span className="status-morph font-serif italic text-alert text-md">pending approval</span>
  }
  if (status === 'fully_repaid') {
    return <span className="status-morph font-serif italic text-ledger text-md">fully repaid</span>
  }
  return <span className="status-morph font-serif italic text-muted text-md">cancelled</span>
}
