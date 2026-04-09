'use client'

import { useState, useTransition } from 'react'
import { detectOverdue } from '../actions'

export default function DetectOverdueButton() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handleClick() {
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await detectOverdue()
        setMessage({ type: 'success', text: result.message })
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      {message ? (
        <span
          className={
            message.type === 'success'
              ? 'text-sm font-serif italic text-ledger'
              : 'text-sm font-serif italic text-danger'
          }
          role="status"
        >
          {message.text}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Scanning…' : 'Detect overdue'}
      </button>
    </div>
  )
}
