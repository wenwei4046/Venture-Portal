'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatMoneyBare } from '@/lib/utils'
import {
  round2,
  shortDate,
  type ContributionTotals,
  type CycleTotals,
  type DeptGroup,
  type Headline,
  type Milestone,
  type StatutoryRow,
  type VarianceSummary,
} from '@/lib/payment-cycle'
import ContribBand from './ContribBand'

/** Funding and payroll facts supplied by the period's server read. */
export interface Facts {
  ctc: number
  fundedAmount: number
  fundedAll: boolean
  fundedDate: string | null
  fundingPvs: string[]
  fundingWord: string
  poolBalance: number
  staffNet: number
  staffCount: number
  staffDate: string | null
  staffPaid: boolean
  dirNet: number
  dirCount: number
  dirDate: string | null
  dirPaid: boolean
  dirFunded: boolean
  statutory: number
  statDue: string | null
  poolAfterSalary: number
  statDone: boolean
  statPaidDate: string | null
}

interface Props {
  periodLabel: string
  periodRange: string
  prevMonthName: string
  headline: Headline
  milestones: Milestone[]
  variances: VarianceSummary
  totals: CycleTotals
  band: ContributionTotals
  rows: StatutoryRow[]
  groups: DeptGroup[]
  facts: Facts
  bankLabel: string
  actionLabel: string
  actionDisabled: boolean
  actionTitle?: string
  onAction: () => void
  fundingSlot: ReactNode
  confirm: ReactNode
  onOpenGroup: (key: string) => void
}

const MARK: Record<Milestone['state'], string> = { done: 'Done', next: 'Next', upcoming: 'Planned', late: 'Overdue', none: 'Not set' }

/** Reporting totals use the paid rows, including partly paid departments. */
export function paymentStatementAmounts(groups: DeptGroup[], rows: StatutoryRow[], poolBalance: number) {
  const people = groups.flatMap((group) => group.people)
  const salaryPaid = round2(people.reduce((sum, person) => sum + (person.voucher?.status === 'paid' ? person.net : 0), 0))
  const salaryOutstanding = round2(people.reduce((sum, person) => sum + (person.voucher?.status === 'paid' ? 0 : Math.max(0, person.net)), 0))
  const statutoryOutstanding = round2(rows.reduce((sum, row) => sum + Math.max(0, row.total - row.paidAmount), 0))
  const poolAfterSalary = round2(poolBalance - salaryOutstanding)
  return {
    salaryPaid,
    salaryOutstanding,
    statutoryOutstanding,
    poolAfterSalary,
    fundingGap: salaryOutstanding + statutoryOutstanding > 0
      ? round2(Math.max(0, statutoryOutstanding - poolAfterSalary))
      : 0,
  }
}

export default function Overview({
  periodLabel,
  headline: h,
  milestones,
  totals,
  band,
  rows,
  groups,
  facts: f,
  bankLabel,
  actionLabel,
  actionDisabled,
  actionTitle,
  onAction,
  fundingSlot,
  confirm,
}: Props) {
  const amounts = paymentStatementAmounts(groups, rows, f.poolBalance)
  const salaryComplete = totals.people > 0 && amounts.salaryOutstanding < 0.005
  const statutoryComplete = rows.some((row) => row.total > 0) && amounts.statutoryOutstanding < 0.005
  const unpaidRows = rows.filter((row) => row.total - row.paidAmount > 0.005)
  const unpaidBodies = new Set(unpaidRows.map((row) => row.body)).size
  const nextStatutoryDue = unpaidRows.map((row) => row.due).sort()[0]
  const paidSalaryDates = groups.flatMap((group) => group.people)
    .filter((person) => person.voucher?.status === 'paid' && person.voucher.payment_date)
    .map((person) => person.voucher!.payment_date!).sort()
  const fundingDates = milestones.filter((m) => m.key.startsWith('funded-') && m.state === 'done' && m.date)
    .map((m) => m.date!).sort()
  const fundedDate = fundingDates.at(-1) ?? f.fundedDate
  const salaryDate = paidSalaryDates.at(-1)
  const otherDeductions = round2(band.cost - totals.net - totals.statutory)
  const paymentDates = milestones.filter((m) => m.state !== 'none').map((m) => {
    const scope = m.key === 'pay-staff' ? 'staff' : m.key === 'pay-dirs' ? 'directors' : null
    if (!scope) return { ...m, mark: MARK[m.state], dateNote: null }
    const payable = groups.filter((group) => group.scope === scope).flatMap((group) => group.people).filter((person) => person.net > 0)
    const paidPeople = payable.filter((person) => person.voucher?.status === 'paid')
    const dates = [...new Set(payable.map((person) => person.voucher?.payment_date).filter((date): date is string => !!date))].sort()
    return {
      ...m,
      date: dates.at(-1) ?? m.date,
      label: `${scope === 'staff' ? 'Staff' : 'Director'} ${dates.length > 1 ? 'payment dates' : 'pay date'}`,
      mark: paidPeople.length > 0 && paidPeople.length < payable.length ? `${paidPeople.length}/${payable.length} paid` : MARK[m.state],
      dateNote: dates.length > 1 ? dates.map((date) => shortDate(date)).join(' · ') : null,
    }
  })
  const action = (() => {
    switch (h.action.kind) {
      case 'payroll':
      case 'approvals':
        return <Link href={h.action.href ?? '/approvals'} className="pay-cta">{h.action.label}</Link>
      case 'funding':
        return fundingSlot
      case 'generate-salary':
      case 'generate-statutory':
        return <button type="button" className="pay-cta" onClick={onAction} disabled={actionDisabled} title={actionTitle}>{actionLabel}</button>
      default:
        return null
    }
  })()

  return (
    <div className="payment-overview">
      <section className="payment-summary" aria-label={`${periodLabel} payment totals`}>
        <div>
          <div className="payment-label">Total payroll cost</div>
          <div className="payment-amount"><small>RM</small>{formatMoneyBare(band.cost)}</div>
          <div className="payment-under">
            {f.fundedAll ? `Funded${fundedDate ? ` ${shortDate(fundedDate)}` : ''}` : f.fundingWord} · {totals.people} people
          </div>
        </div>
        <div>
          <div className="payment-label">Salary paid</div>
          <div className="payment-amount">{formatMoneyBare(amounts.salaryPaid)}</div>
          <div className={`payment-under${salaryComplete ? ' good' : ''}`}>
            {salaryComplete
              ? `All salary PVs paid${salaryDate ? ` · ${shortDate(salaryDate)}` : ''}`
              : amounts.salaryOutstanding > 0
                ? `RM ${formatMoneyBare(amounts.salaryOutstanding)} still to pay`
                : 'No salary payable'}
          </div>
        </div>
        <div>
          <div className="payment-label">Statutory outstanding</div>
          <div className="payment-amount">{formatMoneyBare(amounts.statutoryOutstanding)}</div>
          <div className={`payment-under${statutoryComplete ? ' good' : amounts.statutoryOutstanding > 0 ? ' pending' : ''}`}>
            {statutoryComplete ? 'All statutory PVs paid'
              : nextStatutoryDue ? `Due ${shortDate(nextStatutoryDue)} · ${unpaidBodies} ${unpaidBodies === 1 ? 'body' : 'bodies'}`
                : 'No statutory amounts payable'}
          </div>
        </div>
      </section>

      <section className="payment-allocation" aria-label="Payroll reconciliation, funding and payment dates">
        <div className="payment-reconciliation">
          <h3>Payroll reconciliation</h3>
          <div className="payment-metric"><span>Gross salary</span><span>{formatMoneyBare(band.gross)}</span></div>
          <div className="payment-metric"><span>Employee deductions</span><span>−{formatMoneyBare(band.employee.total)}</span></div>
          <div className="payment-metric"><span>Net salary</span><span>{formatMoneyBare(totals.net)}</span></div>
          <div className="payment-metric"><span>Statutory remittances</span><span>{formatMoneyBare(totals.statutory)}</span></div>
          {Math.abs(otherDeductions) >= 0.005 ? <div className="payment-metric"><span>{otherDeductions > 0 ? 'Other deductions retained' : 'Other payroll adjustments'}</span><span>{formatMoneyBare(otherDeductions)}</span></div> : null}
          <div className="payment-metric total"><span>Total payroll cost · CTC</span><span>{formatMoneyBare(band.cost)}</span></div>
          <details className="payment-contributions">
            <summary>Contribution breakdown</summary>
            <ContribBand band={band} />
          </details>
          <div className="payment-funding-received">
            <div className="payment-metric"><span>Funding received from Finance</span><span>{formatMoneyBare(f.fundedAmount)}</span></div>
            {f.fundingPvs.length > 0 ? <p>{f.fundingPvs.join(' · ')}</p> : null}
          </div>
        </div>
        <div>
          <div className={`payment-funding${amounts.fundingGap > 0 ? ' gap' : ''}`}>
            <h3>{amounts.fundingGap > 0 ? (amounts.salaryOutstanding > 0 ? 'Payment funding gap' : 'Statutory funding gap') : 'Payment funding'}</h3>
            <div className="payment-metric"><span>Current HR pool</span><span>{formatMoneyBare(f.poolBalance)}</span></div>
            {amounts.salaryOutstanding > 0 ? <>
              <div className="payment-metric"><span>Salary still to pay</span><span>{formatMoneyBare(amounts.salaryOutstanding)}</span></div>
              <div className="payment-metric"><span>Pool after remaining salaries</span><span>{formatMoneyBare(amounts.poolAfterSalary)}</span></div>
            </> : null}
            <div className="payment-metric"><span>Statutory still to pay</span><span>{formatMoneyBare(amounts.statutoryOutstanding)}</span></div>
            {amounts.fundingGap > 0
              ? <div className="payment-metric total"><span>Additional funding needed</span><strong>{formatMoneyBare(amounts.fundingGap)}</strong></div>
              : <p className="payment-under good">{amounts.salaryOutstanding + amounts.statutoryOutstanding > 0 ? 'Current pool covers the remaining payments.' : 'No remaining payments for this month.'}</p>}
          </div>
          <h3>Payment dates</h3>
          <ol className="payment-dates">
            {paymentDates.map((m) => (
              <li key={m.key} className={m.state}>
                {m.date ? <time dateTime={m.date} title={m.dateNote ?? undefined}>{m.dateNote ? 'Multiple' : shortDate(m.date)}</time> : <span className="payment-date-empty">—</span>}
                <span>{m.label}{m.dateNote ? <span className="block text-muted text-xs">{m.dateNote}</span> : null}</span><span className="payment-date-state">{m.mark}</span>
              </li>
            ))}
          </ol>
          <p className="payment-bank">Payments from {bankLabel}</p>
        </div>
      </section>
      {action ? <div className="payment-next-action"><div><strong>{h.word}</strong><p>{h.detail}</p></div>{action}</div> : null}
      {confirm ? <div className="payment-report-confirm">{confirm}</div> : null}
    </div>
  )
}
