'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetDirectorStatutoryToLookup } from '../../actions'

interface Props {
  payoutId: string
  /** True iff the row has a non-NULL statutory_overridden_at — only show the
   *  reset button when the user actually edited something. Otherwise it's a
   *  no-op + clutters the UI. */
  overridden: boolean
  overriddenLabel?: string
}

// Phase 11.2: clears any manual statutory edits and re-runs the JADUAL
// lookup using the row's stored payroll_bk / invoice_bk wage bases.
export default function ResetStatutoryButton({ payoutId, overridden, overriddenLabel }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!overridden) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="chip alert">
        <span className="dot" />
        Manually overridden{overriddenLabel ? ` · ${overriddenLabel}` : ''}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            try {
              await resetDirectorStatutoryToLookup(payoutId)
              router.refresh()
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Reset failed')
            }
          })
        }
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
      >
        {isPending ? 'Resetting…' : 'Reset to JADUAL'}
      </button>
    </div>
  )
}
