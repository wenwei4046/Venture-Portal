'use client'

import { useState, useTransition } from 'react'
import { deactivateStaff, reactivateStaff } from '../actions'

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

  return (
    <div className="mt-6 pt-4 border-t border-hairline flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em]">Employment</div>
        <div className="text-sm mt-1.5">
          {active ? (
            confirming ? (
              <>
                Deactivate <span className="font-bold">{personName}</span>? They leave the org
                charts and every active list. Nothing is deleted.
              </>
            ) : (
              'Active.'
            )
          ) : (
            'Inactive.'
          )}
        </div>
        {error ? <div className="sheet-danger mt-2 mb-0">{error}</div> : null}
      </div>

      {!active ? (
        <button
          type="button"
          onClick={() => run(reactivateStaff)}
          disabled={pending}
          className="bg-accent hover:bg-accent-hover text-ink text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? 'Reactivating…' : 'Reactivate'}
        </button>
      ) : confirming ? (
        <div className="flex items-center gap-3">
          {/* Red, not orange: this is the one destructive step, and red on
              white carries white lettering at a readable contrast. */}
          <button
            type="button"
            onClick={() => run(deactivateStaff)}
            disabled={pending}
            className="bg-danger hover:bg-danger/90 text-white text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? 'Deactivating…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-sm hover:underline underline-offset-[3px]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border border-hairline bg-surface hover:border-danger hover:bg-danger-bg hover:text-danger text-sm px-4 py-2 rounded-control transition-colors"
        >
          Deactivate
        </button>
      )}
    </div>
  )
}
