'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPayrollDisbursement } from '../actions'

interface Props {
  period: string
  totalNet: number
  staffCount: number
  alreadyGenerated: boolean
  groupId: string | null
}

function fmt(amount: number): string {
  return amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })
}

export default function CreateDisbursementButton({
  period,
  totalNet,
  staffCount,
  alreadyGenerated,
  groupId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'confirm'>('idle')
  const [error, setError] = useState<string | null>(null)

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      try {
        await createPayrollDisbursement(period)
        router.refresh()
        setMode('idle')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Creation failed')
      }
    })
  }

  if (alreadyGenerated) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-surface border border-ledger/40 rounded-md px-4 py-2">
          <em className="font-serif italic text-ledger text-sm">
            ✓ {staffCount} voucher{staffCount === 1 ? '' : 's'} generated
          </em>
          <span className="font-mono text-xs text-muted ml-2">
            RM {fmt(totalNet)}
          </span>
        </div>
        {groupId && (
          <Link
            href={`/approvals?group_id=${groupId}`}
            className="text-xs font-sans text-muted hover:text-accent"
          >
            View in approvals →
          </Link>
        )}
      </div>
    )
  }

  if (mode === 'confirm') {
    return (
      <div className="flex flex-col gap-3 bg-surface border border-accent-border rounded-md p-4 max-w-lg">
        <p className="font-serif text-sm text-ink">
          Create <strong>{staffCount}</strong> payment voucher
          {staffCount === 1 ? '' : 's'} totalling{' '}
          <strong>RM {fmt(totalNet)}</strong>?
        </p>
        <p className="font-serif italic text-graphite text-xs">
          One voucher per staff, from HR Pool to each staff&apos;s account.
          All will be sent to Principal for approval as a batch.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Creating…' : `Create ${staffCount} vouchers`}
          </button>
          <button
            onClick={() => setMode('idle')}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink px-2"
          >
            Cancel
          </button>
        </div>
        {error && (
          <span className="text-sm font-serif italic text-danger">{error}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setMode('confirm')}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors self-start"
      >
        Create Payment Vouchers
      </button>
      {error && (
        <span className="text-sm font-serif italic text-danger">{error}</span>
      )}
    </div>
  )
}
