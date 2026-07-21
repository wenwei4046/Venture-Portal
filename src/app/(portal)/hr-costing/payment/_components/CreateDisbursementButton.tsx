'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPayrollDisbursement, type PayrollScope } from '../actions'

interface Props {
  period: string
  scope: PayrollScope
  /** Card title, e.g. "Staff batch" / "Director batch". */
  label: string
  total: number
  count: number
  alreadyGenerated: boolean
  groupId: string | null
  defaultDate: string
}

function fmt(amount: number): string {
  return amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })
}

/**
 * Mig 20260721000000 — one card per scope: staff and directors are generated,
 * approved and PAID separately (HR may run them on different days), so each
 * batch carries its own payment date and its own approval group.
 */
export default function CreateDisbursementButton({
  period,
  scope,
  label,
  total,
  count,
  alreadyGenerated,
  groupId,
  defaultDate,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'confirm'>('idle')
  const [payDate, setPayDate] = useState(defaultDate)
  const [error, setError] = useState<string | null>(null)

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      try {
        await createPayrollDisbursement(period, scope, payDate)
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
            ✓ {label}: {count} voucher{count === 1 ? '' : 's'} generated
          </em>
          <span className="font-mono text-xs text-muted ml-2">RM {fmt(total)}</span>
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

  if (count === 0) {
    return (
      <div className="bg-surface border border-hairline rounded-md px-4 py-2">
        <span className="font-serif italic text-muted text-sm">
          {label}: nothing to pay this month.
        </span>
      </div>
    )
  }

  if (mode === 'confirm') {
    return (
      <div className="flex flex-col gap-3 bg-surface border border-accent-border rounded-md p-4 max-w-lg">
        <p className="font-serif text-sm text-ink">
          {label}: create <strong>{count}</strong> payment voucher
          {count === 1 ? '' : 's'} totalling <strong>RM {fmt(total)}</strong>?
        </p>
        <label className="flex items-center gap-2 font-sans text-xs text-graphite">
          <span className="text-muted">payment date</span>
          <input
            type="date"
            value={payDate}
            onChange={e => setPayDate(e.target.value)}
            disabled={isPending}
            className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none focus:border-accent-border"
          />
          <span className="font-serif italic text-muted">
            = the day the bank file goes out (drives the ledger date)
          </span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={isPending || !/^\d{4}-\d{2}-\d{2}$/.test(payDate)}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Creating…' : `Create ${count} vouchers`}
          </button>
          <button
            onClick={() => setMode('idle')}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink px-2"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setMode('confirm')}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors self-start"
      >
        {label} — create {count} voucher{count === 1 ? '' : 's'} (RM {fmt(total)})
      </button>
      {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
    </div>
  )
}
