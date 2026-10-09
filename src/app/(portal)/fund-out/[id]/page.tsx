import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { buildRepaymentPlan } from '@/lib/repayment-plan'
import { cancelLoan } from '../actions'
import RepaymentForm from '../_components/RepaymentForm'
import FundingSourceEditor from './_components/FundingSourceEditor'
import RepaymentStartEditor from './_components/RepaymentStartEditor'
import MinPayInterestToggle from './_components/MinPayInterestToggle'
import VoidRepaymentButton from './_components/VoidRepaymentButton'
import TermsTimeline from '@/components/treasury/TermsTimeline'
import RepaymentScheduleSection from '@/components/treasury/RepaymentScheduleSection'
import PrintSchedule from '@/components/treasury/PrintSchedule'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DetailGroups, { type DetailGroup } from '@/components/sheet/DetailGroups'
import ReturnLink from '@/components/layout/ReturnLink'
import { dealReturn } from '@/lib/deal-return'
import { allTermsChanges, buildTermsSegments, currentSegment } from '@/lib/treasury-terms'
import { fetchTermsHistory, isLoanPrincipal, paidByMonthByType, principalPaidByMonth, termsForLoan } from '@/lib/treasury-terms-data'

// A loan's page (2026-10-09, the user's Claude Design handoff — Phase 3 of the
// Finance revamp): the borrower as the title with its status chip (an open
// record on the Overdue page reads it overdue), Print schedule and Amend
// terms at the head, the cards, the terms, dates and approval trail in
// groups, then Repayment settings, Terms over time, the Repayment schedule
// (it replaces the repayment history; the payments as recorded fold away
// under it, each still reversible), Record repayment and the Actions.

interface Props {
  params: Promise<{ id: string }>
  /** print=1 — the list's Print schedule: the sheet opens straight away. */
  searchParams?: Promise<{ print?: string; from?: string; month?: string }>
}

/** "Auto-synced from voucher HV-OR-…" — the voucher a repayment came in on. */
const voucherOf = (notes: string | null) => notes?.match(/voucher\s+(\S+)/i)?.[1] ?? null

export default async function LoanDetailPage({ params, searchParams }: Props) {
  const user = await requirePermission('treasury')
  const { id } = await params
  const sp = (await searchParams) ?? {}
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
    { data: overdueRows },
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
    // Overdue = an open record on the Overdue page (Detect overdue writes them).
    supabase.from('overdue_records').select('id').eq('loan_id', loan.id).eq('status', 'pending').limit(1),
  ])

  // Terms over time (2026-09-21): segments + each 从某月起 change with its 差价.
  const termsHistory = await fetchTermsHistory(supabase, 'loan', [loan.id])
  const repRows = (repayments ?? []).map((r) => ({ id: loan.id, amount: Number(r.amount), payment_date: r.payment_date as string, payment_type: r.payment_type as string }))
  const terms = termsForLoan(loan, termsHistory.get(loan.id) ?? [])
  const termsSegments = buildTermsSegments(terms, principalPaidByMonth(repRows, isLoanPrincipal).get(loan.id) ?? {})
  const termsChanges = allTermsChanges(termsSegments, { currentYM: officeMonth(), paidByMonth: paidByMonthByType(repRows, isLoanPrincipal).get(loan.id) ?? {} })

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
  const totalPrincipalPaid = Number(outstanding?.total_principal_paid ?? 0)
  const repaymentList = repayments ?? []
  const tenureMonths = Number(loan.tenure_months ?? 0)
  // No-fixed-term loans store tenure_months=1 as a placeholder (the schedule
  // keys off repayment_terms via isLoanUnscheduled). Don't render that "1
  // month" / maturity literally — show 无固定期限 instead (user 2026-06-15).
  const noFixedTerm = isLoanUnscheduled(loan.repayment_terms as string | null)
  const maturityDate = !noFixedTerm && loan.disbursement_date && tenureMonths > 0
    ? dayjs(loan.disbursement_date).add(tenureMonths, 'month')
    : null

  // Each button asks for the action its Server Action asks (2026-10-08, PR2):
  // a repayment is raised, a cancellation or a repayment's reversal voids, and
  // amending a booked loan is Treasury · Approve.
  const canVoid = canDo(user, 'treasury', 'void')
  const canAmend = canDo(user, 'treasury', 'approve')
  const canRecordRepayment = canDo(user, 'treasury', 'create') && loan.status === 'active'
  // Item 3: Finance can cancel pending OR active loans. Active cancellation
  // requires Principal approval downstream and is blocked when repayments
  // already exist (RPC guards this too).
  const isPendingApproval = loan.status === 'pending_approval'
  const isActive = loan.status === 'active'
  const isRepaid = loan.status === 'fully_repaid'
  const overdue = isActive && (overdueRows ?? []).length > 0
  const noRepayments = repaymentList.length === 0
  const canCancelLoan = canVoid && (isPendingApproval || (isActive && noRepayments))

  // The Repayment schedule (2026-10-09): the plan by the terms, the money in
  // set against it oldest first.
  const today = officeToday()
  const plan = buildRepaymentPlan({
    terms,
    payments: repaymentList.map((r) => ({
      date: String(r.payment_date).slice(0, 10),
      type: r.payment_type as string,
      amount: Number(r.amount),
      ref: voucherOf(r.notes as string | null),
    })),
    isPrincipal: isLoanPrincipal,
    today,
    dueDay: loan.disbursement_date ? dayjs(loan.disbursement_date).date() : 1,
    status: loan.status,
  })
  // This month's row (or the last one) gives the monthly figures.
  const thisRow = plan.rows.find((r) => r.ym === officeMonth()) ?? plan.rows[plan.rows.length - 1] ?? null
  const monthlyInterest = thisRow?.interest ?? currentSegment(termsSegments, officeMonth()).interestPerMonth

  const companyName = company?.name ?? '—'
  const borrower = company?.short_code ? `${companyName} (${company.short_code})` : companyName
  const pct = (n: number) => `${(n * 100).toFixed(3)}%`
  const dateLong = (d: string) => dayjs(d).format('D MMM YYYY')
  const stamp = (at: string) => officeTime(at).format('D MMM YYYY HH:mm')
  const [chipTone, chipLabel] = overdue
    ? ['danger', 'overdue']
    : isActive
      ? ['ledger', 'active']
      : isPendingApproval
        ? ['wait', 'pending approval']
        : isRepaid
          ? ['ledger', 'fully repaid']
          : ['', 'cancelled']

  const groups: DetailGroup[] = [
    {
      title: 'Terms',
      items: [
        { label: 'Borrower', value: borrower, text: true },
        { label: 'Effective rate', value: `${pct(Number(loan.effective_rate))} /mo` },
        { label: 'Base + custom', value: `${pct(Number(loan.base_rate))} + ${pct(Number(loan.risk_premium))}` },
        { label: 'Tenure', value: noFixedTerm ? 'No fixed term' : `${tenureMonths} ${tenureMonths === 1 ? 'month' : 'months'}`, text: true },
      ],
    },
    {
      title: 'Dates',
      items: [
        { label: 'Created', value: officeTime(loan.created_at).format('D MMM YYYY') },
        { label: 'Disbursed', value: loan.disbursement_date ? dateLong(loan.disbursement_date) : '—' },
        { label: 'Maturity date', value: maturityDate ? maturityDate.format('D MMM YYYY') : '—' },
      ],
    },
    {
      title: 'Approval trail',
      items: [
        { label: 'Submitted by', value: `${creator?.name ?? '—'} · ${stamp(loan.created_at)}`, text: true },
        {
          label: 'Approved by',
          value: loan.approved_at ? `${approver?.name ?? '—'} · ${stamp(loan.approved_at)}` : 'Awaiting Principal approval',
          text: true,
        },
      ],
    },
  ]
  if (loan.repayment_terms) groups.push({ title: 'Repayment terms', items: [{ label: 'Terms', value: loan.repayment_terms, text: true }] })
  // Opened from the Overview or the repayment calendar, it says so and goes back there.
  const back = dealReturn({ href: '/fund-out', label: 'Fund OUT' }, sp)

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href={back.href} className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to {back.label}
        </ReturnLink>
      </div>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · LOAN OUT
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{companyName}</h1>
            <span className={`chip lg${chipTone ? ` ${chipTone}` : ''}`}>
              <i className="dot" />
              {chipLabel}
            </span>
          </div>
          <p className="font-sans text-xs text-graphite mt-2">
            {company?.short_code ? `${company.short_code} · ` : ''}Created {officeTime(loan.created_at).format('D MMMM YYYY')}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {loan.status !== 'cancelled' ? (
            <PrintSchedule
              autoOpen={sp.print === '1'}
              kicker="FUND OUT · LOAN"
              name={companyName}
              plan={plan}
              printed={`Printed ${dateLong(today)} · ${(user as { name?: string | null }).name ?? 'Finance'}`}
              meta={[
                { label: 'Borrower', value: borrower },
                { label: 'Principal', value: formatMoney(Number(loan.principal)) },
                { label: 'Rate', value: `${pct(Number(loan.effective_rate))} /mo` },
                { label: 'Installments', value: plan.months ? String(plan.months) : 'No fixed term' },
                { label: 'First installment', value: plan.firstDue ? dateLong(plan.firstDue) : '—' },
                { label: 'Installment', value: formatMoney(plan.firstInstallment) },
                { label: 'Total interest', value: `${formatMoney(plan.totalInterest)}${plan.kind === 'open' ? ' (to date)' : ''}` },
                { label: 'Paid', value: formatMoney(plan.principalPaid + plan.interestPaid) },
                { label: 'Outstanding', value: formatMoney(plan.kind === 'open' ? plan.principalOwed : plan.outstandingDue) },
                { label: 'Principal owed', value: formatMoney(plan.principalOwed) },
              ]}
            />
          ) : null}
          {canAmend && isActive ? (
            <Link href={`/fund-out/${loan.id}/edit`} className="btn-quiet-sheet">
              Amend terms
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Cards ───────── */}
      <StatCards label="Loan">
        {isActive ? (
          <StatCard
            tone="primary"
            label="Outstanding"
            value={formatMoney(outstandingAmount)}
            icon="wallet"
            note={totalPrincipalPaid > 0 ? `Repaid ${formatMoney(totalPrincipalPaid)} of ${formatMoney(Number(loan.principal))}` : `Principal ${formatMoney(Number(loan.principal))}`}
          />
        ) : (
          <StatCard tone="primary" label="Principal" value={formatMoney(Number(loan.principal))} icon="coin" note={`Principal ${formatMoney(Number(loan.principal))}`} />
        )}
        <StatCard
          label="Effective rate"
          value={`${pct(Number(loan.effective_rate))} /mo`}
          icon="percent"
          note={`${pct(Number(loan.base_rate))} base + ${pct(Number(loan.risk_premium))} custom`}
        />
        {isActive ? (
          <StatCard
            tone={overdue ? 'danger' : 'default'}
            label="Monthly interest"
            value={formatMoney(monthlyInterest)}
            icon="calendar"
            note={plan.kind === 'fixed' && thisRow ? `On original principal · installment ${formatMoney(thisRow.installment)}` : 'On the principal lent · no fixed term'}
          />
        ) : null}
        <StatCard
          label="Tenure"
          value={noFixedTerm ? 'No fixed term' : `${tenureMonths} ${tenureMonths === 1 ? 'month' : 'months'}`}
          icon="clock"
          note={
            noFixedTerm
              ? 'Interest accrues monthly from disbursement — no maturity date'
              : maturityDate
                ? `Matures ${maturityDate.format('D MMM YYYY')}`
                : 'Maturity set once disbursed'
          }
        />
      </StatCards>

      {/* ───────── Details ───────── */}
      <DetailGroups title="Details" count="TERMS · DATES · APPROVAL TRAIL" groups={groups} />

      {/* ───────── Repayment settings ───────── */}
      <section className="mb-9">
        <div className="sect-head">
          <h2>Repayment settings</h2>
          <span className="rule" aria-hidden />
          <span className="count">FINANCE · EDITABLE ANYTIME</span>
        </div>
        <div className="fin-form">
          <FundingSourceEditor loanId={loan.id} repaymentTerms={(loan.repayment_terms as string | null) ?? null} />
          <RepaymentStartEditor
            loanId={loan.id}
            current={((loan as { repayment_start_month?: string | null }).repayment_start_month ?? null)?.slice(0, 7) ?? null}
            defaultHint={
              loan.disbursement_date
                ? dayjs(`${(loan.disbursement_date as string).slice(0, 7)}-01`).add(1, 'month').format('YYYY-MM')
                : 'the month after disbursement'
            }
          />
          <MinPayInterestToggle loanId={loan.id} current={(loan as { min_pay_interest?: boolean }).min_pay_interest === true} />
        </div>
      </section>

      {/* ───────── Terms over time ───────── */}
      <TermsTimeline kind="loan" recordId={loan.id} segments={termsSegments} changes={termsChanges} canRevert={canAmend && loan.status === 'active'} />

      {/* ───────── Repayment schedule (the payments fold under it) ───────── */}
      <RepaymentScheduleSection
        plan={plan}
        cancelled={loan.status === 'cancelled'}
        recorded={
          repaymentList.length > 0
            ? {
                count: repaymentList.length,
                content: (
                  <div className="overflow-x-auto">
                    <table className="ledger-table w-full">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th className="text-right right">Amount</th>
                          <th className="m-hide">Notes</th>
                          {canVoid ? <th className="text-right right m-hide">Action</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {repaymentList.map((r) => (
                          <tr key={r.id}>
                            <td className="whitespace-nowrap">{dateLong(r.payment_date)}</td>
                            <td className="text-graphite">{r.payment_type}</td>
                            <td className="num">{formatMoney(Number(r.amount))}</td>
                            <td className="m-hide text-muted">{r.notes ?? '—'}</td>
                            {canVoid ? (
                              <td className="text-right m-hide">
                                <VoidRepaymentButton
                                  repaymentId={r.id as string}
                                  loanId={loan.id as string}
                                  label={`${r.payment_type} RM ${formatMoney(Number(r.amount))} · ${dateLong(r.payment_date)}`}
                                />
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ),
              }
            : undefined
        }
      />

      {/* ───────── Record repayment form (Finance, active loans only) ───────── */}
      {canRecordRepayment ? (
        <section className="mb-9">
          <div className="sect-head">
            <h2>Record repayment</h2>
            <span className="rule" aria-hidden />
            <span className="count">FINANCE · INTEREST + PRINCIPAL + PENALTY</span>
          </div>
          <RepaymentForm loanId={loan.id} outstanding={outstandingAmount} />
        </section>
      ) : null}

      {/* ───────── Actions ───────── */}
      {pendingCancel || canCancelLoan || (isActive && !noRepayments && canVoid) ? (
        <section className="mb-6">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">{isPendingApproval ? 'BEFORE PRINCIPAL APPROVES' : 'CANCELLATION NEEDS PRINCIPAL APPROVAL'}</span>
          </div>
          {pendingCancel ? (
            // A cancellation request is already filed. Show it (Finance can't
            // open /approvals, so this is their only window into the status).
            <div className="fin-actions">
              <span className="note">
                ⏳ Cancellation pending Principal approval — requested by {((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance'} on{' '}
                {stamp(pendingCancel.created_at)}. The Principal approves it in Approvals; the loan reverses (bank, Venture Pool, GL)
                and is marked cancelled.
              </span>
            </div>
          ) : canCancelLoan ? (
            <form action={cancelLoan} className="fin-actions">
              <input type="hidden" name="id" value={loan.id} />
              {isActive ? (
                <div className="fin-field" style={{ flex: '1 1 320px' }}>
                  <label htmlFor="reason" className="text-[11.5px] text-graphite">
                    Reason for cancellation
                  </label>
                  <input
                    id="reason"
                    name="reason"
                    type="text"
                    maxLength={200}
                    required
                    placeholder="e.g., wrong borrower, agreement voided"
                    className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink"
                  />
                </div>
              ) : null}
              <button type="submit" className="btn-danger">
                {isActive ? 'Request cancellation (needs Principal)' : 'Cancel this loan'}
              </button>
              <span className="note">
                {isActive
                  ? 'Active loan: files an approval request. Once the Principal approves, bank balance, Venture Pool, and GL entries are reversed and the loan is marked cancelled.'
                  : 'Finance can cancel before the Principal approves. The loan and its approval request are both marked rejected in one transaction.'}
              </span>
            </form>
          ) : (
            <div className="fin-actions">
              <span className="note">
                Cannot cancel — {repaymentList.length} repayment{repaymentList.length === 1 ? '' : 's'} recorded. Reverse those first
                (under the schedule, Repayments recorded).
              </span>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
