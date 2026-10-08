'use client'

import { useTransition } from 'react'
import { approveClaim, rejectClaim, markClaimPaid } from '../actions'

// The sheet's small row actions: the decision in orange (black lettering),
// the refusal as an outline that says it in danger red.
const PRIMARY = 'bg-accent hover:bg-accent-hover text-xs font-medium px-3 py-1.5 rounded-control transition-colors disabled:opacity-50'

interface Props {
  claimId: string
  claimStatus: string
  userRole: string
}

/** A pool claim's decision: Finance (or the Principal) approves and pays it. */
export default function ClaimActions({ claimId, claimStatus, userRole }: Props) {
  const [isPending, startTransition] = useTransition()

  const canDecide = userRole === 'principal' || userRole === 'finance'

  if (claimStatus === 'approved' && canDecide) {
    return (
      <button
        onClick={() => startTransition(() => markClaimPaid(claimId))}
        disabled={isPending}
        className={PRIMARY}
      >
        {isPending ? '...' : 'Mark Paid'}
      </button>
    )
  }

  if (claimStatus !== 'pending' || !canDecide) return null

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => startTransition(() => approveClaim(claimId))}
        disabled={isPending}
        className={PRIMARY}
      >
        {isPending ? '...' : 'Approve'}
      </button>
      <button
        onClick={() => startTransition(() => rejectClaim(claimId))}
        disabled={isPending}
        className="border border-hairline bg-surface hover:bg-danger-bg text-danger text-xs font-medium px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  )
}
