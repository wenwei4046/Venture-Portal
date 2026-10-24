'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import {
  EXTEND_MONTH_CHOICES,
  dayLabel,
  monthsLabel,
  probationEnd,
  reminderDue,
  termEndLine,
} from '@/lib/employment-status'
import { ackLine, acknowledged } from '@/lib/term-reviews'
import type { LetterChoice } from '@/lib/documentation/attach'
import { deactivateStaff, reactivateStaff } from '../actions'
import { acknowledgeProbation, confirmProbation, extendProbation } from '../probation-actions'
import { acknowledgeContract } from '../contract-actions'
import PersonWell from '../../_components/PersonWell'
import w from '../../_components/person-well.module.css'
import RenewContract from './RenewContract'

/** A probation or a contract as the person's page acts on it (2026-10-23; a contract 2026-10-24). */
export interface TermFacts {
  hireDate: string | null
  months: number | null
  /** Its last day — the database's, from its first day and the months; null without a hire date. */
  endsOn: string | null
  /** A contract's first day: the hire date, until a renewal starts the one they are on now (2026-10-24). */
  startsOn?: string | null
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
 * further action — Confirm as permanent or Extend; ending their employment is Deactivate, above it. On a contract
 * (2026-10-24 — "need 30 days and 15 days before remind, 2 reminder") the same line with Acknowledge, and Renew (the
 * same day — "按一下 renew，就可以再选一次是几个月 … 同时要 attach 一个新的 contract") for whoever may file its new contract;
 * making them permanent is the card's Employment Status, above.
 */
export default function Employment({
  personId,
  personName,
  active,
  probation = null,
  contract = null,
  renew = null,
  today,
  onDone,
}: {
  personId: string
  personName: string
  active: boolean
  probation?: TermFacts | null
  contract?: TermFacts | null
  /** Renew's letter types — null for a viewer who may not file the new contract (Documentation · Create). */
  renew?: { types: readonly LetterChoice[] } | null
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
      {active && contract ? <ContractLine personId={personId} personName={personName} contract={contract} renew={renew} today={today} onDone={onDone} /> : null}
    </PersonWell>
  )
}

/** A term's period and its end: "3 months · ends 31 Oct 2026 · in 8 days" — "· from 1 Oct 2027" once a contract is renewed. */
function termValue(t: TermFacts, today: string): string {
  const renewedFrom = t.startsOn && t.startsOn !== t.hireDate ? `from ${dayLabel(t.startsOn)}` : null
  return [t.months ? monthsLabel(t.months) : null, renewedFrom, t.endsOn ? termEndLine(t.endsOn, today, true) : 'its end is counted from the hire date, which is missing']
    .filter(Boolean)
    .join(' · ')
}

/**
 * The probation's line: "3 months · ends 31 Oct 2026 · in 8 days", who acknowledged its reminder, and its steps —
 * Acknowledge (only while a reminder stands that nobody has), Confirm as permanent, Extend by 1–3 months.
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
  probation: TermFacts
  today: string
  onDone: () => void
}) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'extend'>('idle')
  const [by, setBy] = useState(String(EXTEND_MONTH_CHOICES[0]))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const due = reminderDue(probation.endsOn, today)
  const acked = acknowledged(probation, today)
  const said = ackLine(probation, today, 'D MMM YYYY')
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
            termValue(probation, today)
          )}
        </span>
        {said && step === 'idle' ? <span className={w.note}>{said}</span> : null}
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

/**
 * The contract's line (2026-10-24): "12 months · ends 30 Sep 2027 · in 30 days", who acknowledged its reminder,
 * Acknowledge while a reminder stands that nobody has — and Renew, which opens under the line (RenewContract).
 */
function ContractLine({
  personId,
  personName,
  contract,
  renew,
  today,
  onDone,
}: {
  personId: string
  personName: string
  contract: TermFacts
  renew: { types: readonly LetterChoice[] } | null
  today: string
  onDone: () => void
}) {
  const [renewing, setRenewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const said = ackLine(contract, today, 'D MMM YYYY')
  const waiting = reminderDue(contract.endsOn, today) && !acknowledged(contract, today)
  // Renewed from its end: without one (no hire date) there is nothing to count the new contract from.
  const mayRenew = renew !== null && !!contract.endsOn

  function acknowledge() {
    setError(null)
    startTransition(async () => {
      try {
        const done = await acknowledgeContract(personId)
        if (!done.ok) return setError(done.reason)
        onDone()
      } catch {
        setError('Could not save. Check the connection and try again.')
      }
    })
  }

  return (
    <div className={`${w.line} ${w.lineRule}`}>
      <div className={w.lineText}>
        <span className={w.label}>Contract</span>
        <span className={w.value}>{termValue(contract, today)}</span>
        {said && !renewing ? <span className={w.note}>{said}</span> : null}
        {error ? <div className="sheet-danger mt-1 mb-0">{error}</div> : null}
      </div>
      {!renewing && (waiting || mayRenew) ? (
        <span className={w.actions}>
          {waiting ? (
            <button type="button" onClick={acknowledge} disabled={pending} className={btn('primary')}>
              {pending ? 'Acknowledging…' : 'Acknowledge'}
            </button>
          ) : null}
          {mayRenew ? (
            <button type="button" onClick={() => setRenewing(true)} disabled={pending} className={btn('outline')}>
              Renew
            </button>
          ) : null}
        </span>
      ) : null}
      {renewing && renew ? (
        <RenewContract
          personId={personId}
          personName={personName}
          contract={contract}
          types={renew.types}
          onCancel={() => setRenewing(false)}
          onDone={() => {
            setRenewing(false)
            onDone()
          }}
        />
      ) : null}
    </div>
  )
}
