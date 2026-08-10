'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSession, setSessionStatus } from '../actions'

export default function SessionRowActions({
  sessionId,
  status,
}: {
  sessionId: string
  status: 'open' | 'done'
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await setSessionStatus(sessionId, status === 'done' ? 'open' : 'done')
            router.refresh()
          })
        }
        className="text-xs text-graphite hover:text-ink font-serif italic disabled:opacity-50"
      >
        {status === 'done' ? 'Reopen' : 'Mark done'}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm('Delete this reconciliation (statement lines and matches)?')) return
          startTransition(async () => {
            await deleteSession(sessionId)
            router.refresh()
          })
        }}
        className="text-xs text-danger/80 hover:text-danger font-serif italic disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  )
}
