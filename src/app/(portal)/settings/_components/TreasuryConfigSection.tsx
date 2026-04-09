'use client'

import { useState, useTransition } from 'react'
import { updateTreasuryConfig } from '../actions'

interface Props {
  opMargin: number // stored as decimal (0-1), e.g., 0.003 for 0.3%
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
    <section className="bg-white rounded-md border border-slate-200 p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Treasury</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Base rate inputs + solvency buffer threshold.
        </p>
      </header>

      <form action={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="op_margin" className="block text-sm font-medium text-slate-700 mb-1">
              Op Margin
              <span className="text-xs text-slate-400 ml-1">(% per month)</span>
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
                className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-md text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Added to weighted cost of capital to compute Base Rate
            </p>
          </div>

          <div>
            <label htmlFor="buffer_amount" className="block text-sm font-medium text-slate-700 mb-1">
              Buffer Amount
              <span className="text-xs text-slate-400 ml-1">(RM)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">RM</span>
              <input
                id="buffer_amount"
                name="buffer_amount"
                type="number"
                step="100"
                min="0"
                defaultValue={bufferAmount.toFixed(2)}
                required
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Alert fires when Free Cash falls below this</p>
          </div>

          <div>
            <label htmlFor="saving_rate" className="block text-sm font-medium text-slate-700 mb-1">
              Saving Rate
              <span className="text-xs text-slate-400 ml-1">(% of director gross)</span>
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
                className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-md text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Phase 3: Director Salary 5% saving deduction</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Saving...' : 'Save Treasury'}
          </button>
          {message && (
            <span
              className={`text-sm ${
                message.type === 'success' ? 'text-green-700' : 'text-red-700'
              }`}
              role="status"
            >
              {message.type === 'success' ? '✓' : '✗'} {message.text}
            </span>
          )}
        </div>
      </form>
    </section>
  )
}
