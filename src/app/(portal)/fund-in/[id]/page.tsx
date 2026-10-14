import { notFound } from 'next/navigation'
import { officeToday } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { requestFundSourceCancel, withdrawFundSource } from '../actions'
import RepaymentStartEditor from './_components/RepaymentStartEditor'
import MinPayInterestToggle from './_components/MinPayInterestToggle'
import NotesEditor from './_components/NotesEditor'
import RecordRepaymentForm from './_components/RecordRepaymentForm'
import TermsTimeline from '@/components/treasury/TermsTimeline'
import RepaymentScheduleSection, { scheduleCount } from '@/components/treasury/RepaymentScheduleSection'
import PrintSchedule from '@/components/treasury/PrintSchedule'
import DealPageSteps from '@/components/treasury/DealPageSteps'
import { FullAudit, FullCard, FullFact, FullPanelRow, FullRow, FullTrail, fullDay, fullStyles as s } from '@/components/finv/FullParts'
import ReturnLink from '@/components/layout/ReturnLink'
import { dealReturn } from '@/lib/deal-return'
import { loadSourcePage } from './_lib/source-page'

// A fund source's full page (2026-10-15, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff`, the drawer's *View full page ↗*; the prototype
// draws every record's full page one way): *← Fund IN* and the crumb;
// *Fund in · {type}*, the lender with its status, four facts, Print (its
// schedule); then the numbered cards — Received from, the Repayment schedule
// (the payments as recorded fold under it), Terms over time, Repayment
// settings, Notes, Record repayment, the Trail and the Audit log — beside the
// sticky dark panel: the amount, when and where, the booking, and the steps
// this reader may take. Everything the fund source's page did, it still does.
// The reads are `loadSourcePage`'s — the Finance phone app's record reads them too.

interface Props {
  params: Promise<{ id: string }>
  /** print=1 — the list's Print schedule: the sheet opens straight away. */
  searchParams?: Promise<{ print?: string; from?: string; month?: string }>
}

const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default async function FundSourceDetailPage({ params, searchParams }: Props) {
  await requirePage('/fund-in/[id]')
  const user = await requirePermission('treasury')
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const supabase = await createClient()

  const source = await loadSourcePage(supabase, user, id)
  if (!source) notFound()

  const { plan, st, status, can } = source
  const today = officeToday()
  const isActive = status === 'active'
  const isMatured = status === 'matured'

  // Opened from the Overview or the repayment calendar, it says so and goes back there.
  const back = dealReturn({ href: '/fund-in', label: 'Fund IN' }, sp)
  let n = 0

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <ReturnLink href={back.href} className={s.back}>
          ← {back.label}
        </ReturnLink>
        <span className={s.crumb}>Fund · Fund IN · {source.fromLabel}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>Fund in · {source.typeLabel}</div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{source.fromLabel}</h1>
            <span className={s.pill} data-tone={st.tone}>
              <span className={s.pillDot} />
              {st.text}
            </span>
          </div>
          <div className={s.facts}>
            <FullFact label="Amount" value={rm(source.amount)} mono />
            <FullFact label="From" value={source.fromWithCode} />
            <FullFact label="Date" value={fullDay(source.effectiveDate)} mono />
            <FullFact label="Created by" value={`${source.createdBy || 'Unknown'} · ${source.createdAt}`} />
          </div>
        </div>
        <div className={s.topActs}>
          {status !== 'cancelled' ? (
            <PrintSchedule
              autoOpen={sp.print === '1'}
              triggerClassName={s.topBtn}
              triggerLabel="Print"
              kicker={`FUND IN · ${source.typeLabel.toUpperCase()}`}
              name={source.fromLabel}
              plan={plan}
              printed={`Printed ${fullDay(today)} · ${(user as { name?: string | null }).name ?? 'Finance'}`}
              meta={[
                { label: 'Source', value: source.fromWithCode },
                { label: 'Principal', value: formatMoney(source.amount) },
                { label: 'Rate', value: source.rate },
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
          <FullCard n={++n} title="Received from">
            <div className={s.lead}>{source.fromWithCode}</div>
            <dl className={s.dl}>
              <FullRow label="Type" value={source.typeLabel} />
              <FullRow label="Rate" value={source.rate} sub={source.compound ? 'compound' : 'simple'} />
              <FullRow label="Term" value={source.lockInMonths ? plural(source.lockInMonths, 'month', 'months') : 'No fixed term'} sub={source.fullyRepaid ? `repaid in full by ${fullDay(source.fullyRepaid)}` : null} />
            </dl>
          </FullCard>

          <FullCard n={++n} title="Repayment schedule" aside={scheduleCount(plan)}>
            <RepaymentScheduleSection
              bare
              plan={plan}
              cancelled={status === 'cancelled'}
              recorded={
                source.repayments.length > 0
                  ? {
                      count: source.repayments.length,
                      content: (
                        <div className="overflow-x-auto">
                          <table className="ledger-table w-full">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th className="text-right right">Amount</th>
                                <th className="m-hide">Voucher</th>
                                <th className="m-hide">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {source.repayments.map((r) => (
                                <tr key={r.id}>
                                  <td className="whitespace-nowrap">{fullDay(r.date)}</td>
                                  <td className="text-graphite">{r.type}</td>
                                  <td className="num">{formatMoney(r.amount)}</td>
                                  <td className="m-hide whitespace-nowrap">{r.voucherNo || <span className="text-muted">—</span>}</td>
                                  <td className="m-hide text-muted">{r.notes ?? '—'}</td>
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

          {source.termsSegments.some((seg) => seg.changed) ? (
            <FullCard n={++n} title="Terms over time" aside={plural(source.termsChanges.length, 'CHANGE', 'CHANGES')}>
              <TermsTimeline bare kind="fund_source" recordId={source.id} segments={source.termsSegments} changes={source.termsChanges} canRevert={can.amend && isActive} />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Repayment settings">
            <div className="fin-form">
              <RepaymentStartEditor sourceId={source.id} current={source.start.set ? source.start.date : null} min={source.effectiveDate ?? undefined} />
              <MinPayInterestToggle sourceId={source.id} current={source.minPayInterest} />
            </div>
          </FullCard>

          <FullCard n={++n} title="Notes">
            <div className="fin-form">
              <NotesEditor sourceId={source.id} current={source.notes} />
            </div>
          </FullCard>

          {source.repay ? (
            <FullCard n={++n} title="Record repayment">
              <RecordRepaymentForm
                fundSourceId={source.id}
                lender={source.repay.lender}
                lenderCompanyId={source.repay.lenderCompanyId}
                accountCode={source.repay.accountCode}
                outstanding={source.repay.outstanding}
                monthlyPrincipal={source.repay.monthlyPrincipal}
                monthlyInterest={source.repay.monthlyInterest}
                bankAccounts={source.repay.bankAccounts}
                pools={source.repay.pools}
                activeAccounts={source.repay.activeAccounts}
              />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Trail" aside={`${source.trail.filter((t) => t.state !== 'todo').length} / ${source.trail.length} steps`}>
            <FullTrail steps={source.trail} />
          </FullCard>

          <FullCard n={++n} title="Audit log" aside={plural(source.audit.length, 'EVENT', 'EVENTS')}>
            <FullAudit rows={source.audit} />
          </FullCard>
        </div>

        <aside className={s.panel} data-light={st.tone}>
          <div className={s.pTop}>
            <span className={s.pLabel}>Fund in</span>
            <span className={s.pChip}>
              <span className={s.pChipDot} />
              {st.text}
            </span>
          </div>
          <div className={s.pAmount}>+{rm(source.amount)}</div>
          <p className={s.pTo}>From {source.fromWithCode}</p>

          <div className={s.pGroup}>When &amp; where</div>
          <FullPanelRow label="Received" value={fullDay(source.effectiveDate)} mono />
          <FullPanelRow label="First repayment" value={source.start.date ? fullDay(source.start.date) : '—'} mono={!!source.start.date} />
          <FullPanelRow label="Maturity" value={source.maturityDate ? fullDay(source.maturityDate) : 'No fixed term'} mono={!!source.maturityDate} />
          <FullPanelRow label="Into bank" value={source.bank?.label ?? 'Primary bank'} sub={source.bank?.number ?? (source.bank ? null : 'not specified')} />

          <div className={s.pGroup}>Booking</div>
          <FullPanelRow label="Account" value={source.account ? source.account.name : source.accountCode ? source.accountCode : 'Fund Sources Payable'} sub={source.account ? source.account.code : source.accountCode ? null : '4000 · the default'} />
          <FullPanelRow label="Rate" value={source.rate} sub={`${rm(source.monthlyInterest)} a month`} mono />
          {source.lockInMonths ? <FullPanelRow label="Monthly payment" value={rm(source.monthlyPayment)} mono /> : null}
          <FullPanelRow label="Outstanding" value={isActive || isMatured ? rm(source.outstanding) : '—'} sub={source.totalPrincipalPaid > 0 ? `${rm(source.totalPrincipalPaid)} repaid` : null} mono={isActive || isMatured} />

          <DealPageSteps
            side="in"
            id={source.id}
            party={source.fromLabel}
            amount={source.amount}
            status={status}
            amendHref={can.amend ? `/fund-in/${source.id}/edit` : null}
            editHref={can.financeEdit ? `/fund-in/${source.id}/edit` : null}
            withdraw={can.void ? withdrawFundSource : null}
            requestCancel={can.void ? requestFundSourceCancel : null}
            pendingCancel={source.pendingCancel}
          />
        </aside>
      </div>
    </div>
  )
}
