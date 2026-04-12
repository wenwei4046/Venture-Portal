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
      <div className="confirm-slide-in bg-surface border border-hairline rounded-md p-5 w-[26rem]">
        <h3 className="font-serif text-lg text-ink mb-2">Submit HR cost summary</h3>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Creates an immutable snapshot of the live HR staff data for the
          chosen period. <em>Cannot be edited or deleted after submission.</em>
        </p>

        <label
          htmlFor="period_month"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Period
        </label>
        <input
          id="period_month"
          type="month"
          value={period.slice(0, 7)}
          onChange={(e) => setPeriod(`${e.target.value}-01`)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border mb-4"
        />

        {error ? (
          <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mb-3 text-xs font-sans">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Submitting…' : 'Yes, submit'}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              setError(null)
            }}
            className="text-sm text-graphite hover:text-ink font-sans"
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
        <div className="text-right text-xs">
          <div className="font-serif italic text-ledger">
            Submitted for {dayjs(result.period).format('MMM YYYY')} ·{' '}
            {result.departments.length} departments
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Submit HR cost summary
      </button>
    </div>
  )
}
