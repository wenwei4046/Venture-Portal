'use client'

import { useState, useTransition } from 'react'
import dayjs from 'dayjs'
import { submitHRCostSummary } from '../actions'

interface Props {
  defaultPeriod: string
}

export default function SubmitHRCostButton({ defaultPeriod }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [period, setPeriod] = useState(defaultPeriod)
  const [result, setResult] = useState<{ period: string; departments: string[] } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('period_month', period)

    startTransition(async () => {
      try {
        const res = await submitHRCostSummary(formData)
        setResult(res)
        setConfirming(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  if (confirming) {
    return (
      <div className="confirm-slide-in bg-surface border border-hairline rounded-card p-5 w-[26rem] max-w-full">
        <h3 className="text-[15px] font-bold mb-2">Submit HR cost summary</h3>
        <p className="text-sm mb-4">
          Creates an immutable snapshot of the live HR staff data for the
          chosen period. <strong className="font-bold">Cannot be edited or deleted after submission.</strong>
        </p>

        <label
          htmlFor="period_month"
          className="block text-xs font-medium mb-1.5"
        >
          Period
        </label>
        <input
          id="period_month"
          type="month"
          value={period.slice(0, 7)}
          onChange={(e) => setPeriod(`${e.target.value}-01`)}
          className="w-full px-3 py-2 bg-surface border border-hairline rounded-control text-sm font-mono text-ink focus:outline-none focus:border-accent-border mb-4"
        />

        {error ? (
          <div className="bg-danger-bg border border-danger/40 text-danger rounded-control p-2 mb-3 text-xs">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Submitting…' : 'Yes, submit'}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              setError(null)
            }}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {result ? (
        // A finished submission is a state, so it reads as one: a word on a
        // green wash rather than green lettering.
        <span className="chip ledger">
          <span className="dot" />
          Submitted for {dayjs(result.period).format('MMM YYYY')} ·{' '}
          {result.departments.length} departments
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
      >
        Submit HR cost summary
      </button>
    </div>
  )
}
