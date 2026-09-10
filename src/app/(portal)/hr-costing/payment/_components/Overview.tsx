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

/**
 * Personio's Overview: the status card (a big word, the countdown to what is
 * due next, Deel's segmented bar, BambooHR's explained figures, the one
 * action) with the Due dates and Pay variances cards beside it. The card is
 * the page's one dark object.
 */
export default function Overview({
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
  const countdown =
    days == null ? (
      <span style={{ fontSize: 22 }}>{h.due.date ? shortDate(h.due.date) : '—'}</span>
    ) : days < 0 ? (
      <>
        {-days}
        <small>{-days === 1 ? 'day' : 'days'} overdue</small>
      </>
    ) : days === 0 ? (
      <span style={{ fontSize: 24 }}>Today</span>
    ) : (
      <>
        {days}
        <small>{days === 1 ? 'day' : 'days'}</small>
      </>
    )
  const totalDelta = totals.prevNet == null ? null : { abs: Math.round((totals.net - totals.prevNet) * 100) / 100, pct: totals.prevNet === 0 ? null : Math.round(((totals.net - totals.prevNet) / totals.prevNet) * 10000) / 100, dir: (Math.abs(totals.net - totals.prevNet) < 0.005 ? 'flat' : totals.net > totals.prevNet ? 'up' : 'down') as 'flat' | 'up' | 'down' }

  const cta = (() => {
    switch (h.action.kind) {
      case 'payroll':
      case 'approvals':
        return (
          <Link href={h.action.href ?? '/approvals'} className="pay-cta">
            {h.action.label}
          </Link>
        )
      case 'funding':
        return fundingSlot
      case 'generate-salary':
      case 'generate-statutory':
        return (
          <button type="button" className="pay-cta" onClick={onAction} disabled={actionDisabled} title={actionTitle}>
            {actionLabel} →
          </button>
        )
      default:
        return null
    }
  })()
  const note =
    h.action.kind === 'generate-salary'
      ? 'Principal approves each batch; approval is the payment.'
      : h.action.kind === 'generate-statutory'
        ? 'One PV per body, staff and directors together, from the Alliance payroll account.'
        : h.action.kind === 'approvals'
          ? 'Approval is the payment — the bank file goes out the same day.'
          : h.action.kind === 'funding'
            ? 'Finance generates the funding PV; Principal approves it into the HR pool.'
            : h.action.kind === 'payroll'
              ? 'The cycle starts when the payroll is submitted to Finance.'
              : 'Nothing left to do this month.'

  return (
    <div className="pay-over">
      <section className="pay-status hero-walnut" aria-label="This month">
        <div className="top">
          <div>
            <div className="eyebrow">Pay cycle · {periodRange}</div>
            <div className={`word ${h.tone}`}>{h.word}</div>
          </div>
          <div className="cd">
            <div className="eyebrow">{h.due.label}</div>
            <div className={`n${days != null && days < 0 ? ' danger' : ''}`}>{countdown}</div>
          </div>
        </div>
        <div className="detail">{h.detail}</div>
        <div>
          <div className="pay-bar4" role="img" aria-label={h.segments.map((s) => `${s.label}: ${s.state}`).join(', ')}>
            {h.segments.map((s) => (
              <span key={s.key} className={`seg ${s.state}`} />
            ))}
          </div>
          <div className="pay-seglbl" aria-hidden>
            {h.segments.map((s) => (
              <div key={s.key} className={`l ${s.state}`}>
                {s.label}
                <span>{s.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="facts">
          <div className="hero">
            <div className="amt">
              <small>RM</small>
              {formatMoneyBare(totals.net)}
            </div>
            <div className="lab">
              net to pay · {totals.staffCount} staff + {totals.directorCount} directors
            </div>
            <div className="say">
              Gross RM {formatMoneyBare(totals.gross)} · CTC RM {formatMoneyBare(f.ctc)}.
              {totalDelta ? (
                <>
                  {' '}
                  <span className={isNotableMove(totalDelta) ? 'pay-delta notable' : ''} style={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
                    {varianceLabel(totalDelta, prevMonthName)}
                  </span>
                  .
                </>
              ) : (
                <> No {prevMonthName} figures to compare.</>
              )}
            </div>
          </div>
          {totals.people === 0 ? null : (
          <div className="list">
            <div className="f">
              <span className="v">{formatMoneyBare(f.ctc)}</span>
              <span className="s">
                {f.fundedAll ? (
                  <>
                    <b>Funded by Finance</b> {shortDate(f.fundedDate)} · {f.fundingPvs.filter(Boolean).join(' · ') || 'funding PV'} → HR pool holds RM {formatMoneyBare(f.poolBalance)} now.
                  </>
                ) : (
                  <>
                    <b>To be funded by Finance</b> · {f.fundingWord} · HR pool holds RM {formatMoneyBare(f.poolBalance)} now.
                  </>
                )}
              </span>
            </div>
            <div className="f">
              <span className="v">{formatMoneyBare(f.staffNet)}</span>
              <span className="s">
                <b>Staff</b> · {f.staffCount} people ·{' '}
                {f.staffPaid ? (
                  <>
                    left {bankLabel} on {shortDate(f.staffDate)} <span className="ok">✓</span>
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
                <span className="v">{formatMoneyBare(f.dirNet)}</span>
                <span className="s">
                  <b>Directors</b> · {f.dirCount} · own batch ·{' '}
                  {f.dirPaid ? (
                    <>
                      paid {shortDate(f.dirDate)} <span className="ok">✓</span>
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
              <span className="v">{formatMoneyBare(f.statutory)}</span>
              <span className="s">
                <b>Statutory</b> · 4 bodies ·{' '}
                {f.statDone ? (
                  <>
                    all paid {shortDate(f.statPaidDate)} <span className="ok">✓</span>
                  </>
                ) : (
                  <>
                    due {shortDate(f.statDue)} · pool after salaries RM {formatMoneyBare(f.poolAfterSalary)}{' '}
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
          <span className="note">{note}</span>
          {cta}
        </div>
        {confirm}
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
