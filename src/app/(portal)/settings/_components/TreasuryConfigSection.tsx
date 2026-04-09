'use client'

import { useState, useTransition } from 'react'
import { updateTreasuryConfig } from '../actions'

interface Props {
  opMargin: number
  bufferAmount: number
  savingRate: number
}

export default function TreasuryConfigSection({
  opMargin,
  bufferAmount,
  savingRate,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(formData: FormData) {
    setMessage(null)
    startTransition(async () => {
      try {
        await updateTreasuryConfig(formData)
        setMessage({ type: 'success', text: 'Treasury config saved.' })
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })
  }

  return (
    <section className="bg-surface border border-hairline rounded-md p-6">
      <header className="mb-5">
        <h2 className="font-serif text-xl text-ink">Treasury</h2>
        <p className="font-serif italic text-graphite text-sm mt-0.5">
          Base rate inputs + solvency buffer threshold.
        </p>
      </header>

      <form action={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label htmlFor="op_margin" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              Op Margin
              <span className="text-xs text-muted ml-1 font-normal">(% per month)</span>
            </label>
            <div className="relative">
              <input
                id="op_margin"
                name="op_margin"
                type="number"
                step="0.001"
                min="0"
                max="99.999"
                defaultValue={(opMargin * 100).toFixed(3)}
                required
                className="w-full px-3 py-2 pr-8 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
            </div>
            <p className="text-xs text-muted mt-1.5 font-sans">
              Added to weighted cost of capital to compute Base Rate
            </p>
          </div>

          <div>
            <label htmlFor="buffer_amount" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              Buffer Amount
              <span className="text-xs text-muted ml-1 font-normal">(RM)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">RM</span>
              <input
                id="buffer_amount"
                name="buffer_amount"
                type="number"
                step="100"
                min="0"
                defaultValue={bufferAmount.toFixed(2)}
                required
                className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
              />
            </div>
            <p className="text-xs text-muted mt-1.5 font-sans">
              Alert fires when Free Cash falls below this
            </p>
          </div>

          <div>
            <label htmlFor="saving_rate" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              Saving Rate
              <span className="text-xs text-muted ml-1 font-normal">(% of director gross)</span>
            </label>
            <div className="relative">
              <input
                id="saving_rate"
                name="saving_rate"
                type="number"
                step="0.1"
                min="0"
                max="99.9"
                defaultValue={(savingRate * 100).toFixed(1)}
                required
                className="w-full px-3 py-2 pr-8 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
            </div>
            <p className="text-xs text-muted mt-1.5 font-sans">
              Phase 3: Director Salary 5% saving deduction
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving…' : 'Save Treasury'}
          </button>
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
        </div>
      </form>
    </section>
  )
}
