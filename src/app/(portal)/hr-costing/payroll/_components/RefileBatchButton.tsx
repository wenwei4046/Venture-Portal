'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoneyBare } from '@/lib/utils'
import { refilePayrollBatchRequest } from '../actions'

/** A batch whose funding request was cancelled: file it again, same amount. */
export default function RefileBatchButton({ period, batchId, batchNo, amount }: {
  period: string
  batchId: string
  batchNo: number
  amount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              await refilePayrollBatchRequest(period, batchId)
              router.refresh()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Request failed')
            }
          })
        }}
        title={`Ask Finance to fund batch #${batchNo} again — RM ${formatMoneyBare(amount)}`}
        className="text-xs px-2.5 py-1 rounded-control border border-accent disabled:opacity-40"
      >
        {isPending ? 'Filing…' : 'File request again'}
      </button>
      {error && <span className="text-xs text-danger" role="alert">{error}</span>}
    </span>
  )
}
