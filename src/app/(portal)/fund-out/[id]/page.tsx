import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { cancelLoan } from '../actions'
import RepaymentForm from '../_components/RepaymentForm'
import FundingSourceEditor from './_components/FundingSourceEditor'
import RepaymentStartEditor from './_components/RepaymentStartEditor'
import VoidRepaymentButton from './_components/VoidRepaymentButton'
import LedgerRow from '@/components/LedgerRow'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LoanDetailPage({ params }: Props) {
  const user = await requirePermission('treasury')
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

  // A filed-but-not-yet-approved cancellation. Finance can't see /approvals
  // (principal-only), so surface "审批中" here so it doesn't look like the
  // Request cancellation click did nothing (user 2026-06-15).
  const { data: pendingCancel } = await supabase
    .from('approval_requests')
    .select('created_at, submitted_by, users:submitted_by(name)')
    .eq('reference_id', loan.id)
    .eq('reference_table', 'loans')
    .eq('request_type', 'loan_cancel')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .maybeSingle()

  const outstandingAmount = Number(outstanding?.outstanding ?? loan.principal)
  const monthlyInterest = outstandingAmount * Number(loan.effective_rate)
  const totalPrincipalPaid = Number(outstanding?.total_principal_paid ?? 0)
  const totalInterestPaid = Number(outstanding?.total_interest_paid ?? 0)
  const repaymentList = repayments ?? []
  const tenureMonths = Number(loan.tenure_months ?? 0)
  // No-fixed-term loans store tenure_months=1 as a placeholder (the schedule
  // keys off repayment_terms via isLoanUnscheduled). Don't render that "1
  // month" / maturity literally — show 无固定期限 instead (user 2026-06-15).
  const noFixedTerm = isLoanUnscheduled(loan.repayment_terms as string | null)
  const maturityDate = !noFixedTerm && loan.disbursement_date && tenureMonths > 0
    ? dayjs(loan.disbursement_date).add(tenureMonths, 'month')
    : null

  const isFinanceSide = user.role === 'finance' || user.role === 'principal'
  const canRecordRepayment = isFinanceSide && loan.status === 'active'
  // Item 3: Finance can cancel pending OR active loans. Active cancellation
  // requires Principal approval downstream and is blocked when repayments
  // already exist (RPC guards this too).
  const isPendingApproval = loan.status === 'pending_approval'
  const isActive = loan.status === 'active'
  const noRepayments = repaymentList.length === 0
  const canCancelLoan =
    isFinanceSide &&
    (isPendingApproval || (isActive && noRepayments))

  return (
    <div>
      <Link
        href="/fund-out"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Fund OUT
      </Link>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · LOAN OUT
          </div>
          <h1 className="page-title">{company?.name ?? '—'}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {company?.short_code} · Created <em>{dayjs(loan.created_at).format('D MMMM YYYY')}</em>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.role === 'principal' && loan.status === 'active' ? (
            <Link
              href={`/fund-out/${loan.id}/edit`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Amend terms
            </Link>
          ) : null}
          <LoanStatus status={loan.status} />
        </div>
      </div>

      {/* ───────── Hero outstanding ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            {loan.status === 'active' ? 'Outstanding' : 'Principal'}
          </div>
          <div className="font-serif text-[30px] sm:text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {formatMoney(
              loan.status === 'active' ? outstandingAmount : Number(loan.principal)
            )}
          </div>
          {loan.status === 'active' && totalPrincipalPaid > 0 ? (
            <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
              REPAID <span className="text-ledger">{formatMoney(totalPrincipalPaid)}</span> OF {formatMoney(Number(loan.principal))}
            </div>
          ) : (
            <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
              PRINCIPAL <span className="text-num-ink">{formatMoney(Number(loan.principal))}</span>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="font-serif italic text-accent text-base mb-1">
              Effective rate
            </div>
            <div className="font-serif text-3xl text-num-ink tabular">
              {(Number(loan.effective_rate) * 100).toFixed(3)}
              <span className="text-graphite text-xl">% /mo</span>
            </div>
            <div className="font-mono text-[11.5px] text-graphite mt-2 tracking-[0.02em] font-medium">
              {(Number(loan.base_rate) * 100).toFixed(3)}% BASE +{' '}
              {(Number(loan.risk_premium) * 100).toFixed(3)}% CUSTOM
            </div>
          </div>

          {loan.status === 'active' ? (
            <div>
              <div className="font-serif italic text-accent text-base mb-1">
                Monthly interest
              </div>
              <div className="font-serif text-xl text-num-ink tabular">
                {formatMoney(monthlyInterest)}
              </div>
            </div>
          ) : null}

          <div>
            <div className="font-serif italic text-accent text-base mb-1">
              Tenure
            </div>
            <div className="font-serif text-xl text-num-ink tabular">
              {noFixedTerm ? 'No fixed term' : `${tenureMonths} ${tenureMonths === 1 ? 'month' : 'months'}`}
            </div>
            {noFixedTerm ? (
              <div className="font-serif italic text-graphite text-xs mt-2">
                Interest accrues monthly from disbursement — no maturity date
              </div>
            ) : maturityDate ? (
              <div className="font-mono text-[11.5px] text-graphite mt-2 tracking-[0.02em] font-medium">
                MATURES {maturityDate.format('D MMM YYYY').toUpperCase()}
              </div>
            ) : (
              <div className="font-serif italic text-graphite text-xs mt-2">
                Maturity set once disbursed
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ───────── Approval info ───────── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Approval trail</h2>
          <span className="rule" aria-hidden />
          <span className="count">CREATION → APPROVAL → DISBURSEMENT</span>
        </div>
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

        {pendingCancel ? (
          // A cancellation request is already filed. Show it (Finance can't
          // open /approvals, so this is their only window into the status).
          <div className="mt-5 border border-alert/30 bg-alert/5 rounded-md px-4 py-3">
            <div className="text-sm text-alert font-sans font-medium">
              ⏳ Cancellation pending Principal approval
            </div>
            <p className="text-xs text-muted mt-1 italic font-serif">
              Requested by {((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance'} on{' '}
              {dayjs(pendingCancel.created_at).format('D MMM YYYY HH:mm')}. Principal approves it in
              Approvals; the loan reverses (bank, Venture Pool, GL) and is marked cancelled.
            </p>
          </div>
        ) : canCancelLoan ? (
          <form action={cancelLoan} className="mt-5">
            <input type="hidden" name="id" value={loan.id} />
            {isActive ? (
              <>
                <label htmlFor="reason" className="block text-xs uppercase tracking-wide text-muted font-sans mb-1">
                  Reason for cancellation
                </label>
                <input
                  id="reason"
                  name="reason"
                  type="text"
                  maxLength={200}
                  required
                  placeholder="e.g., wrong borrower, agreement voided"
                  className="w-full sm:max-w-md px-3 py-2 mb-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                />
              </>
            ) : null}
            <button
              type="submit"
              className="text-sm text-alert border border-alert/30 px-4 py-2 rounded-md hover:bg-alert/5 font-sans transition-colors"
            >
              {isActive ? 'Request cancellation (needs Principal)' : 'Cancel this loan'}
            </button>
            <p className="text-xs text-muted mt-1.5 italic font-serif">
              {isActive
                ? 'Active loan: files an approval request. Once Principal approves, bank balance, Venture Pool, and GL entries are reversed and the loan is marked cancelled.'
                : 'Finance can cancel before Principal approves. The loan and its approval request are both marked rejected in one transaction.'}
            </p>
          </form>
        ) : null}
        {isActive && !noRepayments && isFinanceSide ? (
          <p className="text-xs text-muted mt-3 italic font-serif">
            Cannot cancel — {repaymentList.length} repayment
            {repaymentList.length === 1 ? '' : 's'} recorded. Reverse those first.
          </p>
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

        <FundingSourceEditor
          loanId={loan.id}
          repaymentTerms={(loan.repayment_terms as string | null) ?? null}
        />

        <RepaymentStartEditor
          loanId={loan.id}
          current={((loan as { repayment_start_month?: string | null }).repayment_start_month ?? null)?.slice(0, 7) ?? null}
          defaultHint={
            loan.disbursement_date
              ? dayjs(`${(loan.disbursement_date as string).slice(0, 7)}-01`).add(1, 'month').format('YYYY-MM')
              : 'the month after disbursement'
          }
        />
      </section>

      {/* ───────── Repayment history ───────── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Repayment history</h2>
          <span className="rule" aria-hidden />
          <span className="count">{repaymentList.length} ENTR{repaymentList.length === 1 ? 'Y' : 'IES'} · INTEREST · PRINCIPAL · PENALTY · NETTING</span>
        </div>

        {repaymentList.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No repayments recorded yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="m-hide">Type</th>
                  <th className="right">Amount</th>
                  <th className="m-hide">Notes</th>
                  {isFinanceSide ? <th className="right m-hide">Action</th> : null}
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {repaymentList.map((r) => (
                  <LedgerRow key={r.id}>
                    <td className="font-mono tabular text-ink">
                      {dayjs(r.payment_date).format('D MMM YYYY')}
                    </td>
                    <td className="font-serif italic text-graphite m-hide" data-label="Type">
                      {r.payment_type}
                    </td>
                    <td className="num">
                      {formatMoney(Number(r.amount))}
                    </td>
                    <td className="text-sm text-muted italic font-serif m-hide" data-label="Notes">
                      {r.notes ?? '—'}
                    </td>
                    {isFinanceSide ? (
                      <td className="text-right m-hide">
                        <VoidRepaymentButton
                          repaymentId={r.id as string}
                          loanId={loan.id as string}
                          label={`${r.payment_type} RM ${formatMoney(Number(r.amount))} · ${dayjs(r.payment_date).format('D MMM YYYY')}`}
                        />
                      </td>
                    ) : null}
                  </LedgerRow>
                ))}
              </tbody>
            </table>
            <div className="mt-4 pt-4 border-t border-hairline text-xs font-mono text-muted flex flex-wrap gap-6">
              <span>
                Principal paid: <span className="num">{formatMoney(totalPrincipalPaid)}</span>
              </span>
              <span>
                Interest paid: <span className="num">{formatMoney(totalInterestPaid)}</span>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ───────── Record repayment form (Finance, active loans only) ───────── */}
      {canRecordRepayment ? (
        <section className="border-t border-hairline pt-8">
          <div className="sect-head">
            <h2>Record repayment</h2>
            <span className="rule" aria-hidden />
            <span className="count">FINANCE · INTEREST + PRINCIPAL + PENALTY</span>
          </div>
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
