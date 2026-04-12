import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { cancelFundSource } from '../actions'
import { ConfirmButton } from './_components/ConfirmButton'

const SOURCE_TYPE_LABELS: Record<string, string> = {
  subsidiary: 'Subsidiary',
  director_loan: 'Director loan',
  department_pool: 'Dept pool transfer',
  director_saving: 'Director saving',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function FundSourceDetailPage({ params }: Props) {
  const user = await requireRole(['principal', 'finance'])
  const { id } = await params

  const supabase = await createClient()

  const [
    { data: source, error },
    { data: outstandingRow },
    { data: repayments },
  ] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('id', id).single(),
    supabase.from('fund_source_outstanding').select('*').eq('fund_source_id', id).single(),
    supabase
      .from('fund_source_repayments')
      .select('*')
      .eq('fund_source_id', id)
      .order('payment_date', { ascending: false }),
  ])

  if (error || !source) notFound()

  // Resolve from-label
  let fromLabel = '—'
  let fromSubLabel = ''
  if (source.from_company_id) {
    const { data: c } = await supabase
      .from('companies')
      .select('name, short_code, tier')
      .eq('id', source.from_company_id)
      .single()
    if (c) {
      fromLabel = c.name
      fromSubLabel = `${c.short_code} · Tier ${c.tier}`
    }
  } else if (source.from_director_id) {
    const { data: d } = await supabase
      .from('directors')
      .select('name, code')
      .eq('id', source.from_director_id)
      .single()
    if (d) {
      fromLabel = d.name
      fromSubLabel = `Director ${d.code}`
    }
  }

  // Resolve repaid_by name
  let repaidByName: string | null = null
  if (source.status === 'repaid' && source.repaid_by) {
    const { data: u } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', source.repaid_by)
      .single()
    if (u) repaidByName = u.name ?? u.email
  }

  const isActive = source.status === 'active'
  const isMatured = source.status === 'matured'
  const isRepaid = source.status === 'repaid'
  const canFinanceEdit = user.role === 'finance'

  const maturityDays = source.maturity_date
    ? dayjs(source.maturity_date).diff(dayjs(), 'day')
    : null

  // Outstanding balance from view (falls back to original amount if no repayments)
  const outstanding = Number(outstandingRow?.outstanding ?? source.amount)
  const totalPrincipalPaid = Number(outstandingRow?.total_principal_paid ?? 0)
  const totalInterestPaid = Number(outstandingRow?.total_interest_paid ?? 0)
  const totalInterestDue = Number(outstandingRow?.total_interest_due ?? 0)
  const monthlyPayment = Number(outstandingRow?.monthly_payment ?? 0)

  // Monthly interest = fixed rate × original principal
  const monthlyInterest = Number(source.amount) * Number(source.cost_rate)

  const repaymentsList = repayments ?? []

  return (
    <div>
      {/* ───────── Back link ───────── */}
      <Link
        href="/fund-in"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Fund IN
      </Link>

      {/* ───────── Header ───────── */}
      <div className="flex items-baseline justify-between mt-3 mb-10">
        <div>
          <p className="font-serif italic text-accent text-base mb-1">
            {SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type}
          </p>
          <h1 className="font-serif text-3xl text-ink">{fromLabel}</h1>
          <p className="font-mono text-xs text-muted mt-1">
            {fromSubLabel}{fromSubLabel ? ' · ' : ''}Recorded{' '}
            {dayjs(source.created_at).format('D MMM YYYY')}
          </p>
        </div>
        <StatusBadge status={source.status} />
      </div>

      {/* ───────── Hero: principal + outstanding ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-4">
          <div className="font-serif italic text-graphite text-sm mb-1">
            Principal
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            RM {formatMoney(Number(source.amount)).replace('RM ', '').replace(/\.\d{2}$/, '')}
            <span className="text-[32px] text-graphite">
              {formatMoney(Number(source.amount)).slice(-3)}
            </span>
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            Effective {dayjs(source.effective_date).format('D MMMM YYYY')}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="font-serif italic text-graphite text-sm mb-1">
            Outstanding
          </div>
          <div className="font-serif text-3xl text-ink">
            {formatMoney(outstanding)}
          </div>
          {totalPrincipalPaid > 0 ? (
            <div className="font-mono text-xs text-muted mt-1">
              Repaid <span className="text-ledger">{formatMoney(totalPrincipalPaid)}</span> of {formatMoney(Number(source.amount))}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div>
            <div className="font-serif italic text-graphite text-sm mb-1">
              Interest rate
            </div>
            <div className="font-serif text-xl text-ink">
              {(Number(source.cost_rate) * 100).toFixed(3)}
              <span className="text-graphite text-base">% /mo</span>
            </div>
            <div className="font-mono text-xs text-muted mt-1">
              Monthly interest{' '}
              <span className="text-ink">{formatMoney(monthlyInterest)}</span>
              {' · '}Total interest{' '}
              <span className="text-ink">{formatMoney(totalInterestDue)}</span>
            </div>
          </div>

          {source.lock_in_months ? (
            <div>
              <div className="font-serif italic text-graphite text-sm mb-1">
                Monthly payment
              </div>
              <div className="font-serif text-xl text-ink">
                {formatMoney(monthlyPayment)}
              </div>
              <div className="font-mono text-xs text-muted mt-1">
                ({source.lock_in_months} months ·{' '}
                {source.maturity_date
                  ? `matures ${dayjs(source.maturity_date).format('D MMM YYYY')}`
                  : 'no maturity'}
                {isActive && maturityDays !== null ? (
                  maturityDays < 0
                    ? ` · past maturity by ${Math.abs(maturityDays)}d`
                    : ` · ${maturityDays}d remaining`
                ) : null})
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ───────── Notes ───────── */}
      {source.notes ? (
        <section className="mb-12">
          <h2 className="font-serif text-xl text-ink mb-2">Notes</h2>
          <p className="font-serif italic text-graphite text-md max-w-3xl whitespace-pre-wrap">
            {source.notes}
          </p>
        </section>
      ) : null}

      {/* ───────── Repayment history ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">Repayment history</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Principal + interest payments recorded against this fund source
        </p>

        {repaymentsList.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No repayments recorded yet.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Date</th>
                    <th className="text-left py-3 pr-4 font-medium">Type</th>
                    <th className="text-right py-3 pr-4 font-medium">Amount</th>
                    <th className="text-left py-3 pr-4 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {repaymentsList.map((r) => (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-ink">
                        {dayjs(r.payment_date).format('D MMM YYYY')}
                      </td>
                      <td className="py-3 pr-4 font-serif italic text-graphite text-sm">
                        {r.payment_type}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(Number(r.amount))}
                      </td>
                      <td className="py-3 pr-4 font-serif italic text-muted text-sm truncate max-w-[200px]">
                        {r.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex gap-8 text-sm font-mono">
              <div>
                <span className="text-muted">Principal paid: </span>
                <span className="text-ink font-medium">{formatMoney(totalPrincipalPaid)}</span>
              </div>
              <div>
                <span className="text-muted">Interest paid: </span>
                <span className="text-ink font-medium">{formatMoney(totalInterestPaid)}</span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ───────── Repayment info (read-only — payments happen in /payments) ───────── */}
      {(isActive || isMatured) ? (
        <section className="mb-12 bg-accent-bg border border-accent-border rounded-md p-4 max-w-3xl">
          <p className="font-serif italic text-accent text-sm">
            To make a repayment on this fund source, go to{' '}
            <Link href="/payments/new" className="underline hover:text-accent-hover">Payments → Create payment</Link>{' '}
            and select &quot;Loan repayment&quot;. All payments require Principal approval.
          </p>
        </section>
      ) : null}

      {/* ───────── Fully repaid audit ───────── */}
      {isRepaid && source.repaid_at ? (
        <section className="mb-12 border-l-2 border-ledger pl-4 py-2 max-w-3xl">
          <h2 className="font-serif text-xl text-ink mb-1">Fully repaid</h2>
          <p className="font-serif text-md text-ink">
            Repaid on{' '}
            <em className="font-serif italic text-ledger">
              {dayjs(source.repaid_at).format('D MMM YYYY')}
            </em>
            {repaidByName ? (
              <> by <em className="font-serif italic text-ledger">{repaidByName}</em></>
            ) : null}
            .
          </p>
        </section>
      ) : null}

      {/* ───────── Actions (Finance only) ───────── */}
      {canFinanceEdit && isActive ? (
        <section className="border-t border-hairline pt-8">
          <h2 className="font-serif text-xl text-ink mb-1">Actions</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Cancellation requires Principal approval.
          </p>
          <ConfirmButton
            id={source.id}
            action={cancelFundSource}
            confirmMessage={`Cancel this fund source?\n\nThis will submit a cancellation request for Principal approval. The fund source remains active until approved.`}
            className="text-sm text-muted hover:text-danger font-sans transition-colors border border-hairline px-4 py-2 rounded-md"
          >
            Request cancellation
          </ConfirmButton>
        </section>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return <span className="status-morph font-serif italic text-graphite text-md">active</span>
  }
  if (status === 'matured') {
    return <span className="status-morph font-serif italic text-alert text-md">matured</span>
  }
  if (status === 'repaid') {
    return <span className="status-morph font-serif italic text-ledger text-md">repaid</span>
  }
  return <span className="status-morph font-serif italic text-muted text-md">cancelled</span>
}
