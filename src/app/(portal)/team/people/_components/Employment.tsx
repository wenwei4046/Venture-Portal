'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { deactivateStaff, reactivateStaff } from '../actions'
import PersonWell from '../../_components/PersonWell'
import w from '../../_components/person-well.module.css'

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
 */
export default function Employment({
  personId,
  personName,
  active,
  onDone,
}: {
  personId: string
  personName: string
  active: boolean
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
    </PersonWell>
  )
}
