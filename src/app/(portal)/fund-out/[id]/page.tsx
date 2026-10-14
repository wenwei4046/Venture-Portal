import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, fundingSourceFromTerms } from '@/lib/utils'
import { buildRepaymentPlan } from '@/lib/repayment-plan'
import { loanStart } from '@/lib/repayment-start'
import { overdueOf } from '@/lib/repayment-calendar'
import { dealChangeLine, type DealChange } from '@/lib/deal-audit'
import { withCode } from '@/lib/fund-hub'
import { addMonths } from '../_lib/loan-hub'
import { cancelPendingLoan, requestLoanCancel } from '../actions'
import RepaymentForm from '../_components/RepaymentForm'
import FundingSourceEditor from './_components/FundingSourceEditor'
import RepaymentStartEditor from './_components/RepaymentStartEditor'
import MinPayInterestToggle from './_components/MinPayInterestToggle'
import VoidRepaymentButton from './_components/VoidRepaymentButton'
import TermsTimeline from '@/components/treasury/TermsTimeline'
import RepaymentScheduleSection, { scheduleCount } from '@/components/treasury/RepaymentScheduleSection'
import PrintSchedule from '@/components/treasury/PrintSchedule'
import DealPageSteps from '@/components/treasury/DealPageSteps'
import { FullAudit, FullCard, FullFact, FullPanelRow, FullRow, FullTrail, fullDay, fullStyles as s, type FullStep } from '@/components/finv/FullParts'
import ReturnLink from '@/components/layout/ReturnLink'
import { dealReturn } from '@/lib/deal-return'
import { allTermsChanges, buildTermsSegments, currentSegment } from '@/lib/treasury-terms'
import { fetchTermsHistory, isLoanPrincipal, paidByMonthByType, principalPaidByMonth, termsForLoan } from '@/lib/treasury-terms-data'

// A loan's full page (2026-10-15, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff`, the drawer's *View full page ↗*; the prototype
// draws every record's full page one way): *← Fund OUT* and the crumb;
// *Fund out · Loan out*, the borrower with its status, four facts, Print (its
// schedule); then the numbered cards — Transfer to, the Repayment schedule
// (the payments as recorded fold under it, each still reversible), Terms over
// time, Repayment settings, Record repayment, the Trail and the Audit log —
// beside the sticky dark panel: the amount, when and where, the booking, and
// the steps this reader may take. Everything the loan's page did, it still
// does; an instalment past its day unpaid still reads it overdue.

interface Props {
  params: Promise<{ id: string }>
  /** print=1 — the list's Print schedule: the sheet opens straight away. */
  searchParams?: Promise<{ print?: string; from?: string; month?: string }>
}

/** "Auto-synced from voucher HV-OR-…" — the voucher a repayment came in on. */
const voucherOf = (notes: string | null) => notes?.match(/voucher\s+(\S+)/i)?.[1] ?? null
const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const pct = (n: number) => `${(n * 100).toFixed(3)}%`
const stamp = (at: string) => officeTime(at).format('DD MMM YYYY · HH:mm')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default async function LoanDetailPage({ params, searchParams }: Props) {
  await requirePage('/fund-out/[id]')
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

  // Terms over time (2026-09-21): segments + each 从某月起 change with its 差价.
  const termsHistory = await fetchTermsHistory(supabase, 'loan', [loan.id])
  const repRows = (repayments ?? []).map((r) => ({ id: loan.id, amount: Number(r.amount), payment_date: r.payment_date as string, payment_type: r.payment_type as string }))
  const terms = termsForLoan(loan, termsHistory.get(loan.id) ?? [])
  const termsSegments = buildTermsSegments(terms, principalPaidByMonth(repRows, isLoanPrincipal).get(loan.id) ?? {})
  const termsChanges = allTermsChanges(termsSegments, { currentYM: officeMonth(), paidByMonth: paidByMonthByType(repRows, isLoanPrincipal).get(loan.id) ?? {} })

  // A filed-but-not-yet-approved cancellation (Finance can't see /approvals, so the page says it).
  // audit_changes postdates database.types.ts — asked through the untyped client.
  const db = supabase as unknown as SupabaseClient
  const [{ data: pendingCancel }, audit] = await Promise.all([
    supabase
      .from('approval_requests')
      .select('created_at, submitted_by, users:submitted_by(name)')
      .eq('reference_id', loan.id)
      .eq('reference_table', 'loans')
      .eq('request_type', 'loan_cancel')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .maybeSingle(),
    // The audit log: the loan's own changes and its repayments' (what this reader's permissions open).
    Promise.all([
      db.rpc('audit_changes', { p_tables: ['loans'], p_row: loan.id, p_limit: 60 }).then((r) => r),
      ...(repayments ?? []).slice(0, 12).map((r) => db.rpc('audit_changes', { p_tables: ['repayments'], p_row: r.id as string, p_limit: 5 }).then((x) => x)),
    ]),
  ])

  const outstandingAmount = Number(outstanding?.outstanding ?? loan.principal)
  const totalPrincipalPaid = Number(outstanding?.total_principal_paid ?? 0)
  const repaymentList = repayments ?? []
  const tenureMonths = Number(loan.tenure_months ?? 0)
  // No-fixed-term loans store tenure_months=1 as a placeholder (isLoanUnscheduled reads the terms).
  const noFixedTerm = isLoanUnscheduled(loan.repayment_terms as string | null)

  // Each step asks for the action its Server Action asks (2026-10-08, PR2).
  const canVoid = canDo(user, 'treasury', 'void')
  const canAmend = canDo(user, 'treasury', 'approve')
  const canRecordRepayment = canDo(user, 'treasury', 'create') && loan.status === 'active'
  const isPendingApproval = loan.status === 'pending_approval'
  const isActive = loan.status === 'active'
  const isRepaid = loan.status === 'fully_repaid'
  const noRepayments = repaymentList.length === 0

  // The repayment start (2026-10-12): the date the first instalment falls due, and every instalment's day.
  const start = loanStart(loan)
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
    dueDay: start.day,
    status: loan.status,
  })
  // Overdue (2026-10-12): an instalment past its day unpaid, on this plan.
  const late = isActive ? overdueOf(plan, today) : null
  const thisRow = plan.rows.find((r) => r.ym === officeMonth()) ?? plan.rows[plan.rows.length - 1] ?? null
  const monthlyInterest = thisRow?.interest ?? currentSegment(termsSegments, officeMonth()).interestPerMonth
  const maturity = !noFixedTerm && loan.disbursement_date && tenureMonths > 0 ? addMonths(String(loan.disbursement_date), tenureMonths) : null

  const companyName = company?.name ?? '—'
  const borrower = company ? withCode(company.name, company.short_code) : '—'
  const fundingSource = fundingSourceFromTerms(loan.repayment_terms as string | null)
  const principal = Number(loan.principal)
  const [tone, chip] = late
    ? ['danger', 'overdue']
    : isActive
      ? ['ledger', 'active']
      : isPendingApproval
        ? ['wait', 'pending approval']
        : isRepaid
          ? ['info', 'repaid']
          : ['def', 'cancelled']

  const steps: FullStep[] = [
    { label: 'Created', by: creator?.name ?? null, when: stamp(loan.created_at), state: 'done' },
    loan.approved_at || isActive || isRepaid
      ? { label: 'Disbursed', by: approver?.name ?? null, when: loan.approved_at ? stamp(loan.approved_at) : fullDay(loan.disbursement_date), state: 'done' as const }
      : loan.status === 'cancelled'
        ? { label: 'Cancelled', by: null, when: null, state: 'bad' as const }
        : { label: 'Disbursed', by: null, when: null, state: 'todo' as const },
  ]
  if (isRepaid) steps.push({ label: 'Repaid', by: null, when: null, state: 'done' })
  if (loan.status === 'cancelled' && steps[1].label !== 'Cancelled') steps.push({ label: 'Cancelled', by: null, when: null, state: 'bad' })

  const changes = audit
    .flatMap((r) => (r.error ? [] : ((r.data ?? []) as unknown as Array<DealChange & { id: number; occurred_at: string; actor_id: string | null; actor_name: string | null }>)))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
    .map((c) => ({ at: stamp(c.occurred_at), who: c.actor_name ?? (c.actor_id ? 'Removed account' : 'System'), what: dealChangeLine(c) }))

  // Opened from the Overview or the repayment calendar, it says so and goes back there.
  const back = dealReturn({ href: '/fund-out', label: 'Fund OUT' }, sp)
  const filed = pendingCancel
    ? { by: ((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance', at: stamp(pendingCancel.created_at) }
    : null
  let n = 0

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <ReturnLink href={back.href} className={s.back}>
          ← {back.label}
        </ReturnLink>
        <span className={s.crumb}>Fund · Fund OUT · {companyName}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>Fund out · Loan out</div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{companyName}</h1>
            <span className={s.pill} data-tone={tone}>
              <span className={s.pillDot} />
              {chip}
            </span>
          </div>
          <div className={s.facts}>
            <FullFact label="Amount" value={rm(principal)} mono />
            <FullFact label="To" value={borrower} />
            <FullFact label="Date" value={fullDay(loan.disbursement_date)} mono />
            <FullFact label="Created by" value={`${creator?.name ?? 'Unknown'} · ${stamp(loan.created_at)}`} />
          </div>
        </div>
        <div className={s.topActs}>
          {loan.status !== 'cancelled' ? (
            <PrintSchedule
              autoOpen={sp.print === '1'}
              triggerClassName={s.topBtn}
              triggerLabel="Print"
              kicker="FUND OUT · LOAN"
              name={companyName}
              plan={plan}
              printed={`Printed ${fullDay(today)} · ${(user as { name?: string | null }).name ?? 'Finance'}`}
              meta={[
                { label: 'Borrower', value: borrower },
                { label: 'Principal', value: formatMoney(principal) },
                { label: 'Rate', value: `${pct(Number(loan.effective_rate))} /mo` },
                { label: 'Installments', value: plan.months ? String(plan.months) : 'No fixed term' },
                { label: 'First installment', value: plan.firstDue ? fullDay(plan.firstDue) : '—' },
                { label: 'Installment', value: formatMoney(plan.firstInstallment) },
                { label: 'Total interest', value: `${formatMoney(plan.totalInterest)}${plan.kind === 'open' ? ' (to date)' : ''}` },
                { label: 'Paid', value: formatMoney(plan.principalPaid + plan.interestPaid) },
                { label: 'Outstanding', value: formatMoney(plan.kind === 'open' ? plan.principalOwed : plan.outstandingDue) },
                { label: 'Principal owed', value: formatMoney(plan.principalOwed) },
              ]}
            />
          ) : null}
        </div>
      </div>

      <div className={s.body}>
        <div className={s.cards}>
          <FullCard n={++n} title="Transfer to">
            <div className={s.lead}>{borrower}</div>
            <dl className={s.dl}>
              <FullRow label="Type" value="Loan out" />
              <FullRow label="Term" value={noFixedTerm ? 'No fixed term' : plural(tenureMonths, 'month', 'months')} sub={maturity ? `matures ${fullDay(maturity)}` : null} />
              {fundingSource ? <FullRow label="Funding source" value={`SC ${fundingSource}`} /> : null}
              {loan.repayment_terms ? <FullRow label="Terms" value={loan.repayment_terms as string} /> : null}
            </dl>
          </FullCard>

          <FullCard n={++n} title="Repayment schedule" aside={scheduleCount(plan)}>
            <RepaymentScheduleSection
              bare
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
                                  <td className="whitespace-nowrap">{fullDay(r.payment_date as string)}</td>
                                  <td className="text-graphite">{r.payment_type}</td>
                                  <td className="num">{formatMoney(Number(r.amount))}</td>
                                  <td className="m-hide text-muted">{r.notes ?? '—'}</td>
                                  {canVoid ? (
                                    <td className="text-right m-hide">
                                      <VoidRepaymentButton
                                        repaymentId={r.id as string}
                                        loanId={loan.id as string}
                                        label={`${r.payment_type} RM ${formatMoney(Number(r.amount))} · ${fullDay(r.payment_date as string)}`}
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
          </FullCard>

          {termsSegments.some((seg) => seg.changed) ? (
            <FullCard n={++n} title="Terms over time" aside={plural(termsChanges.length, 'CHANGE', 'CHANGES')}>
              <TermsTimeline bare kind="loan" recordId={loan.id} segments={termsSegments} changes={termsChanges} canRevert={canAmend && isActive} />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Repayment settings">
            <div className="fin-form">
              <FundingSourceEditor loanId={loan.id} repaymentTerms={(loan.repayment_terms as string | null) ?? null} />
              <RepaymentStartEditor loanId={loan.id} current={start.set ? start.date : null} min={loan.disbursement_date ?? undefined} />
              <MinPayInterestToggle loanId={loan.id} current={(loan as { min_pay_interest?: boolean }).min_pay_interest === true} />
            </div>
          </FullCard>

          {canRecordRepayment ? (
            <FullCard n={++n} title="Record repayment">
              <RepaymentForm loanId={loan.id} outstanding={outstandingAmount} />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Trail" aside={`${steps.filter((t) => t.state !== 'todo').length} / ${steps.length} steps`}>
            <FullTrail steps={steps} />
          </FullCard>

          <FullCard n={++n} title="Audit log" aside={plural(changes.length, 'EVENT', 'EVENTS')}>
            <FullAudit rows={changes} />
          </FullCard>
        </div>

        <aside className={s.panel} data-light={tone}>
          <div className={s.pTop}>
            <span className={s.pLabel}>Fund out</span>
            <span className={s.pChip}>
              <span className={s.pChipDot} />
              {chip}
            </span>
          </div>
          <div className={s.pAmount}>−{rm(principal)}</div>
          <p className={s.pTo}>To {borrower}</p>

          <div className={s.pGroup}>When &amp; where</div>
          <FullPanelRow label="Disbursed" value={fullDay(loan.disbursement_date)} mono />
          <FullPanelRow label="First instalment" value={plan.firstDue ? fullDay(plan.firstDue) : '—'} mono={!!plan.firstDue} />
          <FullPanelRow label="Maturity" value={maturity ? fullDay(maturity) : 'No fixed term'} mono={!!maturity} />

          <div className={s.pGroup}>Booking</div>
          <FullPanelRow label="Rate" value={`${pct(Number(loan.effective_rate))} /mo`} sub={`${pct(Number(loan.base_rate))} base + ${pct(Number(loan.risk_premium))}`} mono />
          {isActive ? <FullPanelRow label="Monthly interest" value={rm(monthlyInterest)} mono /> : null}
          <FullPanelRow label="Outstanding" value={isActive ? rm(outstandingAmount) : '—'} sub={totalPrincipalPaid > 0 ? `${rm(totalPrincipalPaid)} repaid` : null} mono={isActive} />
          {late ? <FullPanelRow label="Overdue" value={rm(late.outstanding)} sub={`since ${fullDay(late.oldestDue)} · ${plural(late.daysPast, 'day', 'days')}`} mono /> : null}

          <DealPageSteps
            side="out"
            id={loan.id}
            party={borrower}
            amount={principal}
            status={isRepaid ? 'repaid' : (loan.status as string)}
            amendHref={canAmend ? `/fund-out/${loan.id}/edit` : null}
            withdraw={canVoid ? cancelPendingLoan : null}
            requestCancel={canVoid ? requestLoanCancel : null}
            cancelShut={isActive && !noRepayments ? `${plural(repaymentList.length, 'repayment', 'repayments')} recorded — reverse those first (Repayments recorded, under the schedule)` : null}
            pendingCancel={filed}
          />
        </aside>
      </div>
    </div>
  )
}

