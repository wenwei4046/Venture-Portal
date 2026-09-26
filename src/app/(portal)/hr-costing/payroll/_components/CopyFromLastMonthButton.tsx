'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { copyFromLastMonth } from '../actions'

interface Props {
  period: string
}

export default function CopyFromLastMonthButton({ period }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)

  function handleClick() {
    setStatus(null)
    startTransition(async () => {
      try {
        const { copied } = await copyFromLastMonth(period)
        setStatus(copied === 0 ? 'No prior month found' : `${copied} rows copied`)
        router.refresh()
        setTimeout(() => setStatus(null), 2500)
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Copy failed')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-2 rounded-control transition-colors disabled:opacity-50"
      >
        {isPending ? 'Copying...' : 'Copy from last month'}
      </button>
      {status && <span className="text-xs">{status}</span>}
    </div>
  )
}
