'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatMoneyBare } from '@/lib/utils'
import {
  isNotableMove,
  shortDate,
  varianceLabel,
  type CycleTotals,
  type Headline,
  type Milestone,
  type VarianceSummary,
} from '@/lib/payment-cycle'

/** The numbers behind BambooHR's four explained figures. Computed on the server. */
export interface Facts {
  ctc: number
  fundedAll: boolean
  fundedDate: string | null
  fundingPvs: string[]
  /** What the funding is waiting on when it is not complete. */
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
  facts: Facts
  bankLabel: string
  /** The CTA for a `generate-salary` / `generate-statutory` headline; links render themselves. */
  actionLabel: string
  actionDisabled: boolean
  actionTitle?: string
  onAction: () => void
  /** The funding-request control (RequestPayrollPaymentButton) for the pre-funding phases. */
  fundingSlot: ReactNode
  /** The confirm bar, when the CTA has been pressed. */
  confirm: ReactNode
  onOpenGroup: (key: string) => void
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function DateChip({ date }: { date: string | null }) {
  if (!date) {
    return (
      <div className="dc">
        <b>—</b>
        <i>tbd</i>
      </div>
    )
  }
  return (
    <div className="dc">
      <b>{Number(date.slice(8, 10))}</b>
      <i>{MONTHS[Number(date.slice(5, 7)) - 1]}</i>
    </div>
  )
}

const MARK: Record<Milestone['state'], string> = { done: '✓ done', next: 'next', upcoming: '', late: 'late', none: '' }

function datedFact(date: string | null): string {
  if (!date) return '—'
  const weekday = new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
  return `${weekday} ${shortDate(date)}`
}

function FactMark({ done, label }: { done: boolean; label?: string }) {
  return <span className={`fact-mark ${done ? 'done' : 'pending'}`} aria-hidden="true">{done ? '✓' : label ?? '●'}</span>
}

/**
 * Selected mockup B: a white payroll review with dated facts in the header,
 * a warm grey net-pay hero, explained checklist figures, and the current
 * action beside the footer's step trail. The side cards keep their layout.
 */
export default function Overview({
  periodLabel,
  periodRange,
  prevMonthName,
  headline: h,
  milestones,
  variances,
  totals,
  facts: f,
  bankLabel,
  actionLabel,
  actionDisabled,
  actionTitle,
  onAction,
  fundingSlot,
  confirm,
  onOpenGroup,
}: Props) {
  const days = h.due.days
  const statusTone = h.word === 'Salaries paid' ? 'ledger' : h.tone
  const countdown = days == null ? '' : days < 0 ? `${-days} ${days === -1 ? 'day' : 'days'} overdue` : days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'}`
  const dueTone = days == null ? '' : days < 0 ? 'danger' : days <= 7 ? 'alert' : 'accent'
  const payDate = f.staffCount > 0 ? f.staffDate : f.dirDate
  const separatePayDates = f.staffCount > 0 && f.dirCount > 0 && f.staffDate !== f.dirDate
  const fundingDates = milestones.filter((m) => m.key.startsWith('funded-') && m.state === 'done' && m.date).map((m) => m.date as string).sort()
  const fundedDate = f.fundedAll ? fundingDates[fundingDates.length - 1] ?? f.fundedDate : null
  const totalDelta = totals.prevNet == null ? null : { abs: Math.round((totals.net - totals.prevNet) * 100) / 100, pct: totals.prevNet === 0 ? null : Math.round(((totals.net - totals.prevNet) / totals.prevNet) * 10000) / 100, dir: (Math.abs(totals.net - totals.prevNet) < 0.005 ? 'flat' : totals.net > totals.prevNet ? 'up' : 'down') as 'flat' | 'up' | 'down' }

  const cta = (() => {
    switch (h.action.kind) {
      case 'payroll':
      case 'approvals':
        return (
          <Link href={h.action.href ?? '/approvals'} className="pay-cta" title={h.detail}>
            {h.action.label}
          </Link>
        )
      case 'funding':
        return fundingSlot
      case 'generate-salary':
      case 'generate-statutory':
        return (
          <button type="button" className="pay-cta" onClick={onAction} disabled={actionDisabled} title={actionTitle}>
            {actionLabel}
          </button>
        )
      default:
        return null
    }
  })()
  return (
    <div className="pay-over">
      <section className="pay-status pay-panel" aria-label={`${periodLabel} payroll review`}>
        <div className="top">
          <div className="review-heading">
            <div className="eyebrow">Pay cycle · {periodRange}</div>
            <div className="review-title">
              <h2>{periodLabel.replace(/\s+\d{4}$/, '')} payroll</h2>
              <span className={`word ${statusTone}`} title={h.detail}>
                <span aria-hidden="true">{statusTone === 'ledger' ? '✓' : '●'}</span> {h.word}
              </span>
            </div>
          </div>
          <dl className="review-dates">
            <div>
              <dt>{h.due.label}</dt>
              <dd className={dueTone}>{datedFact(h.due.date)}{countdown ? ` · ${countdown}` : ''}</dd>
            </div>
            <div>
              <dt>{separatePayDates ? 'Staff pay date' : 'Pay date'}</dt>
              <dd>{datedFact(payDate)}</dd>
            </div>
            <div>
              <dt>Funded</dt>
              <dd>{f.fundedAll ? datedFact(fundedDate) : 'Pending'}</dd>
            </div>
          </dl>
        </div>
        {h.word !== 'Salaries paid' ? <p className="detail">{h.detail}</p> : null}

        <div className={`facts${totals.people === 0 ? ' empty' : ''}`}>
          <div className="hero">
            <div className="amt">
              <small>RM</small>
              {formatMoneyBare(totals.net)}
            </div>
            <div className="lab">
              Total net payroll · {totals.staffCount} staff + {totals.directorCount} directors
            </div>
            <div className="say">
              {totalDelta ? (
                  <span className={isNotableMove(totalDelta) ? 'pay-delta notable' : 'pay-delta'}>
                    {varianceLabel(totalDelta, prevMonthName)}
                  </span>
              ) : (
                <> No {prevMonthName} figures to compare.</>
              )}
            </div>
          </div>
          {totals.people === 0 ? null : (
          <div className="list">
            <div className="f">
              <FactMark done={f.fundedAll} />
              <span className="v">{formatMoneyBare(f.ctc)}</span>
              <span className="s">
                {f.fundedAll ? (
                  <>
                    <b>Funded by Finance</b> {fundedDate ? `on ${shortDate(fundedDate)}` : ''} · {f.fundingPvs.filter(Boolean).join(' · ') || 'funding PV'}. The HR pool holds RM {formatMoneyBare(f.poolBalance)} now.
                  </>
                ) : (
                  <>
                    <b>To be funded by Finance</b> · {f.fundingWord} · HR pool holds RM {formatMoneyBare(f.poolBalance)} now.
                  </>
                )}
              </span>
            </div>
            <div className="f">
              <FactMark done={f.staffPaid} />
              <span className="v">{formatMoneyBare(f.staffNet)}</span>
              <span className="s">
                <b>Staff</b> · {f.staffCount} people ·{' '}
                {f.staffPaid ? (
                  <>
                    left {bankLabel}{f.staffDate ? ` on ${shortDate(f.staffDate)}` : ''}.
                  </>
                ) : (
                  <>
                    leaves {bankLabel} on {f.staffDate ? shortDate(f.staffDate) : 'the pay date'}.
                  </>
                )}
              </span>
            </div>
            {f.dirCount > 0 ? (
              <div className="f">
                <FactMark done={f.dirPaid} />
                <span className="v">{formatMoneyBare(f.dirNet)}</span>
                <span className="s">
                  <b>Directors</b> · {f.dirCount} · own batch ·{' '}
                  {f.dirPaid ? (
                    <>
                      paid{f.dirDate ? ` ${shortDate(f.dirDate)}` : ''}.
                    </>
                  ) : f.dirFunded ? (
                    <>on {f.dirDate ? shortDate(f.dirDate) : 'their pay date'}.</>
                  ) : (
                    <>waiting for their own funding request.</>
                  )}
                </span>
              </div>
            ) : null}
            <div className="f">
              <FactMark done={f.statDone} label="4" />
              <span className="v">{formatMoneyBare(f.statutory)}</span>
              <span className="s">
                <b>Statutory</b> · 4 bodies ·{' '}
                {f.statDone ? (
                  <>
                    all paid {shortDate(f.statPaidDate)}.
                  </>
                ) : (
                  <>
                    due {shortDate(f.statDue)}. Pool after salaries RM {formatMoneyBare(f.poolAfterSalary)} —{' '}
                    {f.poolAfterSalary >= f.statutory ? (
                      <span className="ok">covers it</span>
                    ) : (
                      <span className="short">short RM {formatMoneyBare(Math.round((f.statutory - f.poolAfterSalary) * 100) / 100)}</span>
                    )}
                    .
                  </>
                )}
              </span>
            </div>
          </div>
          )}
        </div>

        <div className="act">
          <ol className="pay-trail" aria-label="Payroll progress">
            {h.segments.map((s) => (
              <li key={s.key} className={s.state} title={`${s.label}: ${s.note}`} aria-current={s.state === 'now' || s.state === 'late' ? 'step' : undefined}>
                <span aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'late' ? '!' : s.state === 'now' ? '●' : '○'}</span>
                {s.label}<span className="sr-only">: {s.state}, {s.note}</span>
              </li>
            ))}
          </ol>
          {cta}
        </div>
        {confirm ? <div className="review-confirm">{confirm}</div> : null}
      </section>

      <aside className="pay-side">
        <div className="pay-panel">
          <h3>
            Due dates
            <span className="chip">{milestones.filter((m) => m.state !== 'none').length}</span>
          </h3>
          <div className="pay-ms">
            {milestones.map((m) => (
              <div key={m.key} className={`m ${m.state}`}>
                <DateChip date={m.date} />
                <div className="t">{m.label}</div>
                <div className="k">{MARK[m.state]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="pay-panel">
          <h3>
            Pay variances
            <span className={`chip${variances.notable > 0 ? ' alert' : ''}`}>{variances.changed}</span>
          </h3>
          {variances.top.length ? (
            <div className="pay-var">
              {variances.top.map((v) => {
                const pct = v.d.pct == null ? `RM ${formatMoneyBare(Math.abs(v.d.abs))}` : `${v.d.dir === 'up' ? '+' : '−'}${Math.abs(v.d.pct).toFixed(0)}%`
                return (
                  <div key={v.row_id} className="r">
                    <button type="button" onClick={() => onOpenGroup(v.key)} title={`${v.dept} · open`}>
                      {v.name}
                    </button>
                    <span className="pv2">
                      {formatMoneyBare(v.prev)} → {formatMoneyBare(v.now)}
                    </span>
                    <span className={`pc ${v.d.dir}${isNotableMove(v.d) ? ' notable' : ''}`}>{pct}</span>
                  </div>
                )
              })}
            </div>
          ) : null}
          <div className="foot">
            {variances.compared === 0
              ? `No ${prevMonthName} figures to compare.`
              : `${variances.changed} of ${variances.compared} moved vs ${prevMonthName}${variances.joiners ? ` · ${variances.joiners} new` : ''}${variances.notable ? ` · ${variances.notable} by 20% or more` : ''}.`}
          </div>
        </div>
      </aside>
    </div>
  )
}
