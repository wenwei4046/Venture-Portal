'use client'

import { useTransition } from 'react'
import { approveClaim, rejectClaim, markClaimPaid } from '../actions'

interface Props {
  claimId: string
  claimType: 'project' | 'benefit'
  claimStatus: string
  userRole: string
}

export default function ClaimActions({ claimId, claimType, claimStatus, userRole }: Props) {
  const [isPending, startTransition] = useTransition()

  const canApprove =
    userRole === 'principal' ||
    (claimType === 'project' && userRole === 'finance') ||
    (claimType === 'benefit' && userRole === 'hr')

  const canMarkPaid =
    userRole === 'principal' ||
    (claimType === 'project' && userRole === 'finance') ||
    (claimType === 'benefit' && userRole === 'hr')

  if (claimStatus === 'approved' && canMarkPaid) {
    return (
      <button
        onClick={() => startTransition(() => markClaimPaid(claimId))}
        disabled={isPending}
        className="text-sm text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
      >
        {isPending ? '...' : 'Mark Paid'}
      </button>
    )
  }

  if (claimStatus !== 'pending' || !canApprove) return null

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => startTransition(() => approveClaim(claimId))}
        disabled={isPending}
        className="text-sm text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
      >
        {isPending ? '...' : 'Approve'}
      </button>
      <button
        onClick={() => startTransition(() => rejectClaim(claimId))}
        disabled={isPending}
        className="text-sm text-graphite hover:text-ink font-sans disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  )
}
