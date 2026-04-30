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
  outsource: 'Outsource',
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
      .select('name, short_code')
      .eq('id', source.from_company_id)
      .single()
    if (c) {
      fromLabel = c.name
      fromSubLabel = c.short_code
    }
  } else if (source.from_department_id) {
    const { data: d } = await supabase
      .from('departments')
      .select('name')
      .eq('id', source.from_department_id)
      .single()
    if (d) {
      fromLabel = d.name
      fromSubLabel = 'Department pool'
    }
  } else if (source.from_freetext_name) {
    // Item 4: director_loan + outsource use free text (no FK lookup).
    fromLabel = source.from_freetext_name
    fromSubLabel =
      source.source_type === 'director_loan' ? 'Director (free text)' : 'Outsource party'
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
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {(SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type).toUpperCase()}
          </div>
          <h1 className="page-title">{fromLabel}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {fromSubLabel}{fromSubLabel ? ' · ' : ''}Recorded <em>{dayjs(source.created_at).format('D MMMM YYYY')}</em>
          </p>
        </div>
        <StatusBadge status={source.status} />
      </div>

      {/* ───────── Hero: principal + outstanding ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-4">
          <div className="font-serif italic text-accent text-base mb-1">
            Principal
          </div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {formatMoney(Number(source.amount))}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            EFFECTIVE {dayjs(source.effective_date).format('D MMMM YYYY').toUpperCase()}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="font-serif italic text-accent text-base mb-1">
            Outstanding
          </div>
          <div className="font-serif text-3xl text-num-ink tabular tracking-[-0.01em]">
            {formatMoney(outstanding)}
          </div>
          {totalPrincipalPaid > 0 ? (
            <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
              REPAID <span className="text-ledger">{formatMoney(totalPrincipalPaid)}</span> OF {formatMoney(Number(source.amount))}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div>
            <div className="font-serif italic text-accent text-base mb-1">
              Interest rate
            </div>
            <div className="font-serif text-xl text-num-ink tabular">
              {(Number(source.cost_rate) * 100).toFixed(3)}
              <span className="text-graphite text-base">% /mo</span>
            </div>
            <div className="font-mono text-[11.5px] text-graphite mt-2 tracking-[0.02em] font-medium">
              MONTHLY INTEREST{' '}
              <span className="text-num-ink">{formatMoney(monthlyInterest)}</span>
              {' · '}TOTAL{' '}
              <span className="text-num-ink">{formatMoney(totalInterestDue)}</span>
            </div>
          </div>

          {source.lock_in_months ? (
            <div>
              <div className="font-serif italic text-accent text-base mb-1">
                Monthly payment
              </div>
              <div className="font-serif text-xl text-num-ink tabular">
                {formatMoney(monthlyPayment)}
              </div>
              <div className="font-mono text-[11.5px] text-graphite mt-2 tracking-[0.02em] font-medium">
                {source.lock_in_months}M ·{' '}
                {source.maturity_date
                  ? `MATURES ${dayjs(source.maturity_date).format('D MMM YYYY').toUpperCase()}`
                  : 'NO MATURITY'}
                {isActive && maturityDays !== null ? (
                  maturityDays < 0
                    ? ` · PAST BY ${Math.abs(maturityDays)}D`
                    : ` · ${maturityDays}D REMAINING`
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ───────── Notes ───────── */}
      {source.notes ? (
        <section className="mb-12">
          <div className="sect-head">
            <h2>Notes</h2>
            <span className="rule" aria-hidden />
          </div>
          <p className="font-serif italic text-graphite text-md max-w-3xl whitespace-pre-wrap">
            {source.notes}
          </p>
        </section>
      ) : null}

      {/* ───────── Repayment history ───────── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Repayment history</h2>
          <span className="rule" aria-hidden />
          <span className="count">{repaymentsList.length} ENTR{repaymentsList.length === 1 ? 'Y' : 'IES'} · PRINCIPAL + INTEREST</span>
        </div>

        {repaymentsList.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No repayments recorded yet.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto mb-4">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th className="right">Amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {repaymentsList.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs text-ink">
                        {dayjs(r.payment_date).format('D MMM YYYY')}
                      </td>
                      <td className="font-serif italic text-graphite text-sm">
                        {r.payment_type}
                      </td>
                      <td className="num">
                        {formatMoney(Number(r.amount))}
                      </td>
                      <td className="font-serif italic text-muted text-sm truncate max-w-[200px]">
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
                <span className="num">{formatMoney(totalPrincipalPaid)}</span>
              </div>
              <div>
                <span className="text-muted">Interest paid: </span>
                <span className="num">{formatMoney(totalInterestPaid)}</span>
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
          <h2 className="font-serif italic text-xl text-ink mb-1">Fully repaid</h2>
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
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">CANCELLATION NEEDS PRINCIPAL APPROVAL</span>
          </div>
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
