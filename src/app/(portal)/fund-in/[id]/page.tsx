import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatMoneyBare, formatDate } from '@/lib/utils'
import { expectedFullRepaymentDate } from '@/lib/fund-source-dates'
import { cancelFundSource } from '../actions'
import { ConfirmButton } from './_components/ConfirmButton'
import WithdrawButton from './_components/WithdrawButton'
import RepaymentStartEditor from './_components/RepaymentStartEditor'
import MinPayInterestToggle from './_components/MinPayInterestToggle'
import NotesEditor from './_components/NotesEditor'
import TermsTimeline from '@/components/treasury/TermsTimeline'
import { allTermsChanges, buildTermsSegments, currentSegment, termsChanged } from '@/lib/treasury-terms'
import { fetchTermsHistory, isFundSourcePrincipal, paidByMonthByType, principalPaidByMonth, termsForFundSource } from '@/lib/treasury-terms-data'

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
  const user = await requirePermission('treasury')
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

  // Terms over time (2026-09-21): segments + each 从某月起 change with its 差价.
  const termsHistory = await fetchTermsHistory(supabase, 'fund_source', [source.id])
  const repRows = (repayments ?? []).map((r) => ({ id: source.id, amount: Number(r.amount), payment_date: r.payment_date as string, payment_type: r.payment_type as string }))
  const termsSegments = buildTermsSegments(termsForFundSource(source, termsHistory.get(source.id) ?? []), principalPaidByMonth(repRows, isFundSourcePrincipal).get(source.id) ?? {})
  const termsChanges = allTermsChanges(termsSegments, { currentYM: dayjs().format('YYYY-MM'), paidByMonth: paidByMonthByType(repRows, isFundSourcePrincipal).get(source.id) ?? {} })

  // A filed-but-not-yet-approved cancellation (cancelFundSource files a
  // tier_change approval). Finance can't see /approvals (principal-only), so
  // surface "审批中" here so the click doesn't look like a no-op (2026-06-15).
  const { data: pendingCancel } = await supabase
    .from('approval_requests')
    .select('created_at, submitted_by, users:submitted_by(name)')
    .eq('reference_id', source.id)
    .eq('reference_table', 'fund_sources')
    .eq('request_type', 'tier_change')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .maybeSingle()

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

  // Receiving bank (mig 20260708100000). NULL = falls back to the primary bank
  // at approval, so say so rather than showing a blank.
  let bankLabel: string | null = null
  if (source.bank_account_id) {
    const { data: b } = await supabase
      .from('bank_accounts')
      .select('bank_name, account_number')
      .eq('id', source.bank_account_id)
      .maybeSingle()
    if (b) bankLabel = `${b.bank_name} — ${b.account_number}`
  }

  // Liability sub-account (mig 247). NULL falls back to the umbrella 4000.
  let accountLabel: string | null = null
  if (source.account_code) {
    const { data: a } = await supabase
      .from('chart_of_accounts')
      .select('code, name')
      .eq('code', source.account_code)
      .maybeSingle()
    accountLabel = a ? `${a.code} — ${a.name}` : source.account_code
  }

  const isActive = source.status === 'active'
  const isMatured = source.status === 'matured'
  const isRepaid = source.status === 'repaid'
  const isPending = source.status === 'pending_approval'
  const canFinanceEdit = user.role === 'finance' || user.role === 'principal'

  const maturityDays = source.maturity_date
    ? dayjs(source.maturity_date).diff(dayjs(), 'day')
    : null

  // Outstanding balance from view (falls back to original amount if no repayments)
  const outstanding = Number(outstandingRow?.outstanding ?? source.amount)
  const totalPrincipalPaid = Number(outstandingRow?.total_principal_paid ?? 0)
  const totalInterestPaid = Number(outstandingRow?.total_interest_paid ?? 0)
  const totalInterestDue = Number(outstandingRow?.total_interest_due ?? 0)
  const monthlyPayment = Number(outstandingRow?.monthly_payment ?? 0)

  // Monthly interest = fixed rate × original principal — or, once the terms
  // changed mid-life, the current segment's figure (rate × principal still
  // owed when it began).
  const monthlyInterest = termsChanged(termsSegments)
    ? currentSegment(termsSegments, dayjs().format('YYYY-MM')).interestPerMonth
    : Number(source.amount) * Number(source.cost_rate)

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
        <div className="flex items-center gap-3">
          {user.role === 'principal' && isActive ? (
            <Link
              href={`/fund-in/${source.id}/edit`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Amend terms
            </Link>
          ) : null}
          <StatusBadge status={source.status} />
        </div>
      </div>

      {/* ───────── Hero: principal + outstanding ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-4">
          <div className="font-serif italic text-accent text-base mb-1">
            Principal
          </div>
          <div className="statement-amount text-num-ink">
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
          <div className="statement-amount text-num-ink">
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
              <div className="statement-amount compact text-num-ink">
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

          {source.repayment_date ? (
            <div>
              <div className="font-serif italic text-accent text-base mb-1">
                Expected repayment date (first installment)
              </div>
              <div className="font-serif text-xl text-num-ink tabular">
                {formatDate(source.repayment_date)}
              </div>
              {source.lock_in_months ? (
                <div className="font-mono text-[11.5px] text-graphite mt-2 tracking-[0.02em] font-medium">
                  EXPECTED FULL REPAYMENT:{' '}
                  <span className="text-num-ink">
                    {formatDate(expectedFullRepaymentDate(source.repayment_date, source.lock_in_months))}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ───────── Details ───────── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Details</h2>
          <span className="rule" aria-hidden />
          <span className="count">TERMS &amp; ROUTING</span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5 max-w-4xl">
          <Detail
            label="Source type"
            value={SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type}
          />
          <Detail label="From" value={fromLabel} sub={fromSubLabel} />
          <Detail
            label="Receive into bank"
            value={bankLabel ?? 'Primary bank (not specified)'}
          />
          <Detail
            label="Amount due to (BS account)"
            value={accountLabel ?? '4000 — Fund Sources Payable (default)'}
          />
          <Detail
            label="Interest rate"
            value={`${(Number(source.cost_rate) * 100).toFixed(3)}% /mo · ${source.compound_interest ? 'compound' : 'simple'}`}
          />
          <Detail
            label="Repayment period"
            value={source.lock_in_months ? `${source.lock_in_months} months` : 'No fixed term'}
          />
          <Detail label="Effective date" value={formatDate(source.effective_date)} />
          <Detail
            label="Expected repayment"
            value={source.repayment_date ? formatDate(source.repayment_date) : '—'}
          />
          <Detail
            label="Maturity date"
            value={source.maturity_date ? formatDate(source.maturity_date) : '—'}
          />
        </dl>
      </section>

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

      <RepaymentStartEditor
        sourceId={source.id}
        current={((source as { repayment_start_month?: string | null }).repayment_start_month ?? null)?.slice(0, 7) ?? null}
        defaultHint={
          source.effective_date
            ? dayjs(`${(source.effective_date as string).slice(0, 7)}-01`).add(1, 'month').format('YYYY-MM')
            : 'the month after receipt'
        }
      />

      <MinPayInterestToggle
        sourceId={source.id}
        current={(source as { min_pay_interest?: boolean }).min_pay_interest === true}
      />

      <div className="mt-8">
        <TermsTimeline kind="fund_source" recordId={source.id} segments={termsSegments} changes={termsChanges} canRevert={user.role === 'principal' && source.status === 'active'} />
      </div>

      <NotesEditor sourceId={source.id} current={(source.notes as string | null) ?? null} />

      {/* ───────── Actions (Finance only) ───────── */}
      {pendingCancel ? (
        // Cancellation already filed — show it (Finance can't open /approvals).
        <section className="border-t border-hairline pt-8">
          <div className="border border-alert/30 bg-alert/5 rounded-md px-4 py-3">
            <div className="text-sm text-alert font-sans font-medium">
              ⏳ Cancellation pending Principal approval
            </div>
            <p className="text-xs text-muted mt-1 italic font-serif">
              Requested by {((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance'} on{' '}
              {dayjs(pendingCancel.created_at).format('D MMM YYYY HH:mm')}. Principal approves it in
              Approvals; the deposit reverses (bank, Venture Pool, GL) and is marked cancelled.
            </p>
          </div>
        </section>
      ) : canFinanceEdit && isPending ? (
        <section className="border-t border-hairline pt-8">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">EDITABLE UNTIL PRINCIPAL APPROVES</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href={`/fund-in/${source.id}/edit`}
              className="text-sm text-accent hover:text-accent-hover font-serif italic border border-hairline px-4 py-2 rounded-md transition-colors inline-block"
            >
              Edit fund source
            </Link>
            <WithdrawButton id={source.id} />
          </div>
          <p className="text-xs text-muted mt-2 italic font-serif">
            Fix typos, wrong amount, wrong rate, or wrong dates while the request is still pending. Locks once Principal approves.
            Submitted the whole thing by mistake? Withdraw it directly — no Principal needed.
          </p>
        </section>
      ) : canFinanceEdit && isActive ? (
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

function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted mb-1">
        {label}
      </dt>
      <dd className="font-serif text-md text-ink">
        {value}
        {sub ? <span className="font-mono text-[11px] text-graphite ml-2">{sub}</span> : null}
      </dd>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending_approval') {
    return <span className="status-morph font-serif italic text-alert text-md">pending approval</span>
  }
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
