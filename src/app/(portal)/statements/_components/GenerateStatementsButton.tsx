'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateStatements } from '../actions'

// 2026-10-14 — the page shows one month at a time: the dialog opens on the
// month on show (`month`, YYYY-MM), and generating another month goes there,
// the result beside the button on the month it was for.
export default function GenerateStatementsButton({ month }: { month: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [period, setPeriod] = useState(`${month}-01`)
  const [result, setResult] = useState<{
    generated: number
    skipped: number
    errors?: string[]
    period: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shownResult = result && result.period.slice(0, 7) === month ? result : null

  function handleConfirm() {
    setError(null)
    setResult(null)
    const formData = new FormData()
    formData.append('period_month', period)

    startTransition(async () => {
      try {
        const res = await generateStatements(formData)
        setResult(res)
        setConfirming(false)
        const generated = res.period.slice(0, 7)
        if (generated !== month) router.push(`/statements/monthly?period=${generated}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  if (confirming) {
    return (
      <div className="confirm-slide-in bg-surface border border-hairline rounded-md p-5 w-96">
        <h3 className="font-serif text-lg text-ink mb-2">Generate statements</h3>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Creates or regenerates draft statements for all 8 subsidiaries.{' '}
          <em>Already-issued statements will be skipped.</em>
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
            {isPending ? 'Generating…' : 'Yes, generate'}
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
      {shownResult ? (
        <div className="text-right text-xs">
          <div className="font-serif italic text-ledger">
            {shownResult.generated} generated
            {shownResult.skipped > 0 ? `, ${shownResult.skipped} skipped` : ''}
          </div>
          {shownResult.errors && shownResult.errors.length > 0 ? (
            <div className="font-serif italic text-danger mt-1">
              {shownResult.errors.length} error(s)
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setPeriod(`${month}-01`)
          setConfirming(true)
        }}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Generate statements
      </button>
    </div>
  )
}
