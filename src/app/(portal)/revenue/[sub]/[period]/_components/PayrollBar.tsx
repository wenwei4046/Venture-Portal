'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import type { PayrollState } from '@/lib/commission/payroll-send'
import { sendToPayroll, takeBackFromPayroll } from '../../../run-actions'
import s from './commission-workbench.module.css'

interface Props {
  /** YYYY-MM-01. */
  period: string
  /** "September 2026". */
  monthLabel: string
  subDepartmentId: string
  /** The saved run — what Take back takes back. */
  runId: string | null
  state: PayrollState
  /**
   * The screen holds a draft — bills excluded here, Open Bill picks not yet
   * saved, a preview. None of it is sent; the figures here leave it out.
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
 * Payroll, for this month — what it holds of this page, and the one button
 * that puts it there (2026-09-27).
 *
 * The commission above is worked out LIVE every time the page opens. Payroll
 * gets it only when it is sent, and the page used to leave that to a button
 * called "Recompute & sync payroll" at the bottom of a folded section — so the
 * live figure read as money already in payroll, and September never went.
 * This bar says which it is, and what is still in the way.
 */
export default function PayrollBar({ period, monthLabel, subDepartmentId, runId, state, draft = false, switches }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function act(work: () => Promise<string>) {
    setError(null)
    setNote(null)
    startTransition(async () => {
      try {
        setNote(await work())
        setConfirming(false)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not work'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  const send = () =>
    act(async () => {
      const sent = await sendToPayroll(period, subDepartmentId)
      return `${formatMoney(sent.totalCommission)} is in the ${monthLabel} payroll · ${sent.staffCount} ${sent.staffCount === 1 ? 'person' : 'people'}.`
    })

  const takeBack = () =>
    act(async () => {
      await takeBackFromPayroll(runId as string)
      return `Taken back — the ${monthLabel} payroll no longer holds this page's commission.`
    })

  let tone: Tone
  let title: string
  let body: ReactNode
  let blockers: string[] = []
  let actions: ReactNode = null

  const takeBackButton = runId ? (
    <button type="button" className={s.ghostButton} disabled={isPending} onClick={() => setConfirming(true)}>
      Take back
    </button>
  ) : null

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
        : <>{state.closedAs.replace(/\.?$/, '.')} Until then nothing here can change the {monthLabel} payroll.</>
      break
    case 'not_sent':
      blockers = state.blockers
      tone = blockers.length ? 'blocked' : 'idle'
      title = 'Not in payroll yet'
      body = <>The commission above is worked out live from the ERP bills every time this page opens. Payroll only gets it when it is sent{blockers.length
        ? <> — and {blockers.length === 1 ? 'one thing has' : `${blockers.length} things have`} to be settled first:</>
        : <>. Send it once the month is settled; sending again later replaces what was sent.</>}</>
      actions = (
        <button type="button" className={s.primaryButton} disabled={isPending || blockers.length > 0} onClick={send}>
          {isPending ? 'Sending…' : blockers.length ? 'Send to payroll' : `Send ${formatMoney(state.total)} to payroll`}
        </button>
      )
      break
    case 'sent':
      blockers = state.blockers
      tone = blockers.length ? 'blocked' : state.current ? 'ok' : 'stale'
      title = `In payroll · ${formatMoney(state.sentTotal)}`
      body = <>Sent {sentOn(state.sentAt)}. {state.current
        ? <>The commission above matches it. While it is in payroll, {monthLabel}&apos;s bills, Open Bill picks and ERP changes stay as they are — take it back to change them.</>
        : <>The commission above has moved since: {formatMoney(state.total)}, {difference(state.total, state.sentTotal)}{state.changedPeople > 0 ? ` · ${state.changedPeople} ${state.changedPeople === 1 ? 'person' : 'people'} changed` : ''}.</>}
        {blockers.length ? <> Payroll keeps what was sent until {blockers.length === 1 ? 'this is' : 'these are'} settled:</> : null}</>
      actions = <>
        {!state.current && (
          <button type="button" className={s.primaryButton} disabled={isPending || blockers.length > 0} onClick={send}>
            {isPending ? 'Updating…' : `Update payroll to ${formatMoney(state.total)}`}
          </button>
        )}
        {takeBackButton}
      </>
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
          {draft && (state.kind === 'not_sent' || state.kind === 'sent') && (
            <p className={s.payrollNote}>
              This screen holds a draft — bills excluded here, Open Bill picks not yet saved or a preview. It is not sent: the
              figures in this bar are the month as saved.
            </p>
          )}
          {note && <p className={s.payrollDone} role="status">{note}</p>}
          {error && <p className={s.payrollError} role="alert">{error}</p>}
        </div>
        {confirming ? (
          <div className={s.payrollConfirm}>
            <p>Take this page&apos;s commission back out of the {monthLabel} payroll? Nothing is paid from here until it is sent again. Other sub-departments stay, and so do titles already raised.</p>
            <div className={s.payrollActions}>
              <button type="button" className={s.primaryButton} disabled={isPending} onClick={takeBack}>
                {isPending ? 'Taking back…' : 'Take back'}
              </button>
              <button type="button" className={s.ghostButton} disabled={isPending} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        ) : actions ? <div className={s.payrollActions}>{actions}</div> : null}
      </div>
      {switches ? <div className={s.payrollSwitches}>{switches}</div> : null}
    </section>
  )
}
