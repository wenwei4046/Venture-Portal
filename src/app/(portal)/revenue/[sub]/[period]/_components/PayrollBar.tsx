import type { ReactNode } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import type { PayrollState } from '@/lib/commission/payroll-send'
import s from './commission-workbench.module.css'

interface Props {
  /** "September 2026". */
  monthLabel: string
  /** YYYY-MM-01 — where HR › Payroll holds each salesperson once sent. */
  period?: string
  state: PayrollState
  /**
   * The screen holds a draft — Open Bill picks not yet saved, a preview. The
   * figures in this bar leave it out.
   */
  draft?: boolean
  /** What this month pays (the scheme switches), under the status. */
  switches?: ReactNode
}

type Tone = 'ok' | 'stale' | 'blocked' | 'idle' | 'quiet'

function sentOn(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur',
  })
}

function difference(now: number, before: number): string {
  const d = Math.round((now - before) * 100) / 100
  return d > 0 ? `${formatMoney(d)} more` : `${formatMoney(-d)} less`
}

/**
 * Payroll, for this month — what it holds of this page (2026-09-27).
 *
 * The commission above is worked out LIVE every time the page opens; payroll
 * holds only what was sent, and the page used to leave that to *Recompute &
 * sync payroll* at the foot of a folded section — so the live figure read as
 * money already in payroll. This bar says which it is and what is still in
 * the way.
 *
 * It sends nothing. It carried a whole-month *Send to payroll* for a few hours
 * the day it shipped; the user's Send is per SALESPERSON (Send = Complete: tick
 * five people and send them, or send everybody not yet sent), so the send
 * belongs to the per-person close, not to one button for the month.
 *
 * Where a sent salesperson goes (the unified Payroll, 2026-09-27): their row
 * on HR › Payroll takes the figure and shows Completed, and HR's Submit to
 * Finance sends them on in a batch. A month HR has Total Closed takes nothing.
 */
export default function PayrollBar({ monthLabel, period, state, draft = false, switches }: Props) {
  let tone: Tone
  let title: string
  let body: ReactNode
  let blockers: string[] = []

  switch (state.kind) {
    case 'settled':
      tone = 'quiet'
      title = 'Settled by hand'
      body = <>The portal pays from {state.settledBefore}, so nothing on this page goes to payroll — the commission above is the rules applied to {monthLabel}&apos;s bills.</>
      break
    case 'closed':
      tone = 'quiet'
      title = state.sentTotal === null ? 'Not in payroll' : `In payroll · ${formatMoney(state.sentTotal)}`
      body = state.closedAs === 'locked'
        ? <>This month&apos;s commission is locked in payroll. Nothing here can change it now.</>
        : /closed for good/.test(state.closedAs)
          ? <>HR has closed the {monthLabel} payroll for good (Total Close), so nothing here can change it. Only the Principal can reopen the month.</>
          : <>{state.closedAs.replace(/\.?$/, '.')} Until then nothing here can change the {monthLabel} payroll.</>
      break
    case 'not_sent':
      blockers = state.blockers
      tone = blockers.length ? 'blocked' : 'idle'
      title = 'Not in payroll yet'
      body = <>The commission above is worked out live from the ERP bills every time this page opens. None of it is in payroll yet: it goes salesperson by salesperson, as each one is sent{blockers.length
        ? <> — and {blockers.length === 1 ? 'one thing has' : `${blockers.length} things have`} to be settled first:</>
        : '.'}</>
      break
    case 'sent':
      blockers = state.blockers
      tone = blockers.length ? 'blocked' : state.current ? 'ok' : 'stale'
      title = `In payroll · ${formatMoney(state.sentTotal)}`
      body = <>Sent {sentOn(state.sentAt)}. {state.current
        ? <>The commission above matches it.</>
        : <>The commission above has moved since: {formatMoney(state.total)}, {difference(state.total, state.sentTotal)}{state.changedPeople > 0 ? ` · ${state.changedPeople} ${state.changedPeople === 1 ? 'person' : 'people'} changed` : ''}.</>}
        {blockers.length ? <> Still to settle:</> : null}</>
      break
  }

  return (
    <section className={s.payroll} aria-label={`Payroll · ${monthLabel}`} data-tone={tone}>
      <div className={s.payrollMain}>
        <div className={s.payrollText}>
          <div className={s.eyebrow}>Payroll · {monthLabel}</div>
          <div className={s.payrollState}><span className={s.payrollDot} aria-hidden />{title}</div>
          <p className={s.payrollNote}>{body}</p>
          {blockers.length > 0 && (
            <ul className={s.payrollBlockers} aria-label="To settle before payroll">
              {blockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
          {period && (state.kind === 'not_sent' || state.kind === 'sent') && (
            <p className={s.payrollNote}>
              A salesperson sent from here shows on{' '}
              <Link href={`/hr-costing/payroll/${period}`} className="underline underline-offset-[3px]">HR › Payroll →</Link>
              {' '}as Completed; HR&apos;s Submit to Finance sends them on.
            </p>
          )}
          {draft && (state.kind === 'not_sent' || state.kind === 'sent') && (
            <p className={s.payrollNote}>
              This screen holds a draft — Open Bill picks not yet saved, or a preview. The figures in this bar are the month as saved.
            </p>
          )}
        </div>
      </div>
      {switches ? <div className={s.payrollSwitches}>{switches}</div> : null}
    </section>
  )
}
