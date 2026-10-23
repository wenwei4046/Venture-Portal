'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { officeTime } from '@/lib/office-time'
import {
  EXTEND_MONTH_CHOICES,
  dayLabel,
  monthsLabel,
  probationDue,
  probationEnd,
  probationEndLine,
} from '@/lib/employment-status'
import { acknowledged } from '@/lib/probation-reviews'
import { deactivateStaff, reactivateStaff } from '../actions'
import { acknowledgeProbation, confirmProbation, extendProbation } from '../probation-actions'
import PersonWell from '../../_components/PersonWell'
import w from '../../_components/person-well.module.css'

/** A probation as the person's page acts on it (2026-10-23). */
export interface ProbationFacts {
  hireDate: string | null
  months: number | null
  /** Its last day — the database's, from the hire date and the months; null without a hire date. */
  endsOn: string | null
  ackEnd: string | null
  ackName: string | null
  ackAt: string | null
}

/**
 * The Deactivate / Reactivate control on a person's card.
 *
 * Nothing here deletes anybody. `hr_staff_costs` is referenced by payroll,
 * sales orders and commission statements under ON DELETE RESTRICT, so the row
 * must survive; what changes is the status every list filters on. A
 * deactivated person leaves both hierarchy charts and moves to the roster's
 * Inactive tab — they are one click away, not gone.
 *
 * Both directions, deliberately. The action existed for months in only one,
 * which made the roster a door with no handle on the far side: the only way
 * back was the database.
 *
 * On probation (2026-10-23 — the user: "if the probation is almost end, then it will notification hr acknowledge for
 * further action") a second line: the period and its end, Acknowledge while HR is being told and has not, then the
 * further action — Confirm as permanent or Extend; ending their employment is Deactivate, above it.
 */
export default function Employment({
  personId,
  personName,
  active,
  probation = null,
  today,
  onDone,
}: {
  personId: string
  personName: string
  active: boolean
  probation?: ProbationFacts | null
  /** The office's today (YYYY-MM-DD). */
  today: string
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run(fn: (id: string) => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn(personId)
        setConfirming(false)
        onDone()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save')
      }
    })
  }

  // A well of the person's page since 2026-10-16 (the 360): their status in
  // the reference's words, the one step at the end.
  return (
    <PersonWell title="Employment" icon="staff">
      <div className={w.line}>
        <div className={w.lineText}>
          <span className={w.label}>Status</span>
          <span className={w.value}>
            {active ? (
              confirming ? (
                <>
                  Deactivate <b className="font-semibold">{personName}</b>? They leave the org charts and every active
                  list. Nothing is deleted.
                </>
              ) : (
                'Active'
              )
            ) : (
              'Inactive'
            )}
          </span>
          {error ? <div className="sheet-danger mt-1 mb-0">{error}</div> : null}
        </div>

        {!active ? (
          <button type="button" onClick={() => run(reactivateStaff)} disabled={pending} className={btn('primary')}>
            {pending ? 'Reactivating…' : 'Reactivate'}
          </button>
        ) : confirming ? (
          <span className={w.actions}>
            {/* Red, not orange: this is the one destructive step, and red
                carries white lettering at a readable contrast. */}
            <button type="button" onClick={() => run(deactivateStaff)} disabled={pending} className={btn('dangerSolid')}>
              {pending ? 'Deactivating…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={btn('outline')}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={btn('danger')}>
            Deactivate
          </button>
        )}
      </div>

      {active && probation ? <ProbationLine personId={personId} personName={personName} probation={probation} today={today} onDone={onDone} /> : null}
    </PersonWell>
  )
}

/**
 * The probation's line: "3 months · ends 31 Oct 2026 · in 8 days", who acknowledged its reminder, and its steps —
 * Acknowledge (only while HR is being told and nobody has), Confirm as permanent, Extend by 1–3 months.
 */
function ProbationLine({
  personId,
  personName,
  probation,
  today,
  onDone,
}: {
  personId: string
  personName: string
  probation: ProbationFacts
  today: string
  onDone: () => void
}) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'extend'>('idle')
  const [by, setBy] = useState(String(EXTEND_MONTH_CHOICES[0]))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const due = probationDue(probation.endsOn, today)
  const acked = acknowledged(probation)
  const extendedEnd = probation.months ? probationEnd(probation.hireDate, probation.months + Number(by)) : null

  function go(fn: () => Promise<{ ok: true } | { ok: false; reason: string }>) {
    setError(null)
    startTransition(async () => {
      try {
        const done = await fn()
        if (!done.ok) return setError(done.reason)
        setStep('idle')
        onDone()
      } catch {
        setError('Could not save. Check the connection and try again.')
      }
    })
  }

  return (
    <div className={`${w.line} ${w.lineRule}`}>
      <div className={w.lineText}>
        <span className={w.label}>Probation</span>
        <span className={w.value}>
          {step === 'confirm' ? (
            <>
              Confirm <b className="font-semibold">{personName}</b> as permanent? Their probation ends here.
            </>
          ) : step === 'extend' ? (
            <>Extend it by {monthsLabel(Number(by))}{extendedEnd ? ` — to end ${dayLabel(extendedEnd)}` : ''}?</>
          ) : (
            [probation.months ? monthsLabel(probation.months) : null, probation.endsOn ? probationEndLine(probation.endsOn, today, true) : 'its end is counted from the hire date, which is missing']
              .filter(Boolean)
              .join(' · ')
          )}
        </span>
        {acked && step === 'idle' ? (
          <span className={w.note}>
            Acknowledged by {probation.ackName ?? 'HR'}
            {probation.ackAt ? ` · ${officeTime(probation.ackAt).format('D MMM YYYY')}` : ''}
          </span>
        ) : null}
        {error ? <div className="sheet-danger mt-1 mb-0">{error}</div> : null}
      </div>

      <span className={w.actions}>
        {step === 'idle' ? (
          <>
            {due && !acked ? (
              <button type="button" onClick={() => go(() => acknowledgeProbation(personId))} disabled={pending} className={btn('primary')}>
                {pending ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            ) : null}
            <button type="button" onClick={() => setStep('confirm')} disabled={pending} className={btn('outline')}>
              Confirm as permanent
            </button>
            <button type="button" onClick={() => setStep('extend')} disabled={pending || !probation.months} className={btn('outline')}>
              Extend
            </button>
          </>
        ) : step === 'confirm' ? (
          <>
            <button type="button" onClick={() => go(() => confirmProbation(personId))} disabled={pending} className={btn('primary')}>
              {pending ? 'Confirming…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setStep('idle')} disabled={pending} className={btn('outline')}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <Select value={by} onChange={event => setBy(event.target.value)} aria-label="Extend by" className={w.extendBy}>
              {EXTEND_MONTH_CHOICES.map(n => (
                <option key={n} value={String(n)}>
                  + {monthsLabel(n)}
                </option>
              ))}
            </Select>
            <button type="button" onClick={() => go(() => extendProbation(personId, Number(by)))} disabled={pending} className={btn('primary')}>
              {pending ? 'Extending…' : 'Extend'}
            </button>
            <button type="button" onClick={() => setStep('idle')} disabled={pending} className={btn('outline')}>
              Cancel
            </button>
          </>
        )}
      </span>
    </div>
  )
}
