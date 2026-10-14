import { notFound } from 'next/navigation'
import { officeToday } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
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
import { FullAudit, FullCard, FullFact, FullPanelRow, FullRow, FullTrail, fullDay, fullStyles as s } from '@/components/finv/FullParts'
import ReturnLink from '@/components/layout/ReturnLink'
import { dealReturn } from '@/lib/deal-return'
import { loadLoanPage } from './_lib/loan-page'

// A loan's full page (2026-10-15, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff`, the drawer's *View full page ↗*; the prototype
// draws every record's full page one way): *← Fund OUT* and the crumb;
// *Fund out · Loan out*, the borrower with its status, four facts, Print (its
// schedule); then the numbered cards — Transfer to, the Repayment schedule
// (the payments as recorded fold under it, each still reversible), Terms over
// time, Repayment settings, Record repayment, the Trail and the Audit log —
// beside the sticky dark panel: the amount, when and where, the booking, and
// the steps this reader may take. Everything the loan's page did, it still
// does; an instalment past its day unpaid still reads it overdue. The reads are
// `loadLoanPage`'s — the Finance phone app's record reads them too.

interface Props {
  params: Promise<{ id: string }>
  /** print=1 — the list's Print schedule: the sheet opens straight away. */
  searchParams?: Promise<{ print?: string; from?: string; month?: string }>
}

const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const pct = (n: number) => `${(n * 100).toFixed(3)}%`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default async function LoanDetailPage({ params, searchParams }: Props) {
  await requirePage('/fund-out/[id]')
  const user = await requirePermission('treasury')
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const supabase = await createClient()

  const loan = await loadLoanPage(supabase, user, id)
  if (!loan) notFound()

  const { plan, tone, chip, late, can } = loan
  const today = officeToday()
  const isActive = loan.status === 'active'
  const isRepaid = loan.status === 'fully_repaid'
  const noRepayments = loan.repayments.length === 0

  // Opened from the Overview or the repayment calendar, it says so and goes back there.
  const back = dealReturn({ href: '/fund-out', label: 'Fund OUT' }, sp)
  let n = 0

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <ReturnLink href={back.href} className={s.back}>
          ← {back.label}
        </ReturnLink>
        <span className={s.crumb}>Fund · Fund OUT · {loan.companyName}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>Fund out · Loan out</div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{loan.companyName}</h1>
            <span className={s.pill} data-tone={tone}>
              <span className={s.pillDot} />
              {chip}
            </span>
          </div>
          <div className={s.facts}>
            <FullFact label="Amount" value={rm(loan.principal)} mono />
            <FullFact label="To" value={loan.borrower} />
            <FullFact label="Date" value={fullDay(loan.disbursementDate)} mono />
            <FullFact label="Created by" value={`${loan.createdBy ?? 'Unknown'} · ${loan.createdAt}`} />
          </div>
        </div>
        <div className={s.topActs}>
          {loan.status !== 'cancelled' ? (
            <PrintSchedule
              autoOpen={sp.print === '1'}
              triggerClassName={s.topBtn}
              triggerLabel="Print"
              kicker="FUND OUT · LOAN"
              name={loan.companyName}
              plan={plan}
              printed={`Printed ${fullDay(today)} · ${(user as { name?: string | null }).name ?? 'Finance'}`}
              meta={[
                { label: 'Borrower', value: loan.borrower },
                { label: 'Principal', value: formatMoney(loan.principal) },
                { label: 'Rate', value: `${pct(loan.rate.effective)} /mo` },
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
            <div className={s.lead}>{loan.borrower}</div>
            <dl className={s.dl}>
              <FullRow label="Type" value="Loan out" />
              <FullRow label="Term" value={loan.noFixedTerm ? 'No fixed term' : plural(loan.tenureMonths, 'month', 'months')} sub={loan.maturity ? `matures ${fullDay(loan.maturity)}` : null} />
              {loan.fundingSource ? <FullRow label="Funding source" value={`SC ${loan.fundingSource}`} /> : null}
              {loan.repaymentTerms ? <FullRow label="Terms" value={loan.repaymentTerms} /> : null}
            </dl>
          </FullCard>

          <FullCard n={++n} title="Repayment schedule" aside={scheduleCount(plan)}>
            <RepaymentScheduleSection
              bare
              plan={plan}
              cancelled={loan.status === 'cancelled'}
              recorded={
                loan.repayments.length > 0
                  ? {
                      count: loan.repayments.length,
                      content: (
                        <div className="overflow-x-auto">
                          <table className="ledger-table w-full">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th className="text-right right">Amount</th>
                                <th className="m-hide">Notes</th>
                                {can.void ? <th className="text-right right m-hide">Action</th> : null}
                              </tr>
                            </thead>
                            <tbody>
                              {loan.repayments.map((r) => (
                                <tr key={r.id}>
                                  <td className="whitespace-nowrap">{fullDay(r.date)}</td>
                                  <td className="text-graphite">{r.type}</td>
                                  <td className="num">{formatMoney(r.amount)}</td>
                                  <td className="m-hide text-muted">{r.notes ?? '—'}</td>
                                  {can.void ? (
                                    <td className="text-right m-hide">
                                      <VoidRepaymentButton repaymentId={r.id} loanId={loan.id} label={`${r.type} RM ${formatMoney(r.amount)} · ${fullDay(r.date)}`} />
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

          {loan.termsSegments.some((seg) => seg.changed) ? (
            <FullCard n={++n} title="Terms over time" aside={plural(loan.termsChanges.length, 'CHANGE', 'CHANGES')}>
              <TermsTimeline bare kind="loan" recordId={loan.id} segments={loan.termsSegments} changes={loan.termsChanges} canRevert={can.amend && isActive} />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Repayment settings">
            <div className="fin-form">
              <FundingSourceEditor loanId={loan.id} repaymentTerms={loan.repaymentTerms} />
              <RepaymentStartEditor loanId={loan.id} current={loan.start.set ? loan.start.date : null} min={loan.disbursementDate ?? undefined} />
              <MinPayInterestToggle loanId={loan.id} current={loan.minPayInterest} />
            </div>
          </FullCard>

          {can.recordRepayment ? (
            <FullCard n={++n} title="Record repayment">
              <RepaymentForm loanId={loan.id} outstanding={loan.outstanding} />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Trail" aside={`${loan.trail.filter((t) => t.state !== 'todo').length} / ${loan.trail.length} steps`}>
            <FullTrail steps={loan.trail} />
          </FullCard>

          <FullCard n={++n} title="Audit log" aside={plural(loan.audit.length, 'EVENT', 'EVENTS')}>
            <FullAudit rows={loan.audit} />
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
          <div className={s.pAmount}>−{rm(loan.principal)}</div>
          <p className={s.pTo}>To {loan.borrower}</p>

          <div className={s.pGroup}>When &amp; where</div>
          <FullPanelRow label="Disbursed" value={fullDay(loan.disbursementDate)} mono />
          <FullPanelRow label="First instalment" value={plan.firstDue ? fullDay(plan.firstDue) : '—'} mono={!!plan.firstDue} />
          <FullPanelRow label="Maturity" value={loan.maturity ? fullDay(loan.maturity) : 'No fixed term'} mono={!!loan.maturity} />

          <div className={s.pGroup}>Booking</div>
          <FullPanelRow label="Rate" value={`${pct(loan.rate.effective)} /mo`} sub={`${pct(loan.rate.base)} base + ${pct(loan.rate.premium)}`} mono />
          {isActive ? <FullPanelRow label="Monthly interest" value={rm(loan.monthlyInterest)} mono /> : null}
          <FullPanelRow label="Outstanding" value={isActive ? rm(loan.outstanding) : '—'} sub={loan.totalPrincipalPaid > 0 ? `${rm(loan.totalPrincipalPaid)} repaid` : null} mono={isActive} />
          {late ? <FullPanelRow label="Overdue" value={rm(late.outstanding)} sub={`since ${fullDay(late.oldestDue)} · ${plural(late.daysPast, 'day', 'days')}`} mono /> : null}

          <DealPageSteps
            side="out"
            id={loan.id}
            party={loan.borrower}
            amount={loan.principal}
            status={isRepaid ? 'repaid' : loan.status}
            amendHref={can.amend ? `/fund-out/${loan.id}/edit` : null}
            withdraw={can.void ? cancelPendingLoan : null}
            requestCancel={can.void ? requestLoanCancel : null}
            cancelShut={isActive && !noRepayments ? `${plural(loan.repayments.length, 'repayment', 'repayments')} recorded — reverse those first (Repayments recorded, under the schedule)` : null}
            pendingCancel={loan.pendingCancel}
          />
        </aside>
      </div>
    </div>
  )
}
