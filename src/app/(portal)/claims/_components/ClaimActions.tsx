'use client'

import { useTransition } from 'react'
import { approveClaim, rejectClaim } from '../actions'

interface Props {
  claimId: string
  claimType: 'project' | 'benefit'
  userRole: string
}

export default function ClaimActions({ claimId, claimType, userRole }: Props) {
  const [isPending, startTransition] = useTransition()

  const canApprove =
    userRole === 'principal' ||
    (claimType === 'project' && userRole === 'finance') ||
    (claimType === 'benefit' && userRole === 'hr')

  if (!canApprove) return null

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
