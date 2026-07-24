'use client'

import { useState, useTransition } from 'react'
import { withdrawFundSource } from '../../actions'

// Finance pulls back a wrongly-submitted PENDING fund source. Errors render
// inline (red text) instead of throwing into the app-wide error page.
export default function WithdrawButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (
            !confirm(
              '撤回这笔 fund source?\n\n单会直接变 cancelled,Principal 队列里的审批卡也会一并消掉。钱还没进账,所以没有任何账要冲。想重新记就开一张新的。'
            )
          )
            return
          startTransition(async () => {
            setError(null)
            const r = await withdrawFundSource(id)
            if (r?.error) setError(r.error)
          })
        }}
        className="text-sm text-muted hover:text-danger font-sans transition-colors border border-hairline px-4 py-2 rounded-md disabled:opacity-50"
      >
        {isPending ? '撤回中…' : '撤回 · Withdraw'}
      </button>
      {error ? <p className="text-xs font-sans text-danger mt-1.5">{error}</p> : null}
    </div>
  )
}
