'use client'

import { useState, useTransition } from 'react'
import { updateTierPremiums } from '../actions'
import type { CompanyTier, TierConfig } from '@/types'

interface Props {
  tiers: TierConfig[]
}

const TIER_DESCRIPTIONS: Record<CompanyTier, string> = {
  T1: 'Lowest risk — base rate only',
  T2: 'Low-medium risk',
  T3: 'Medium-high risk',
  T4: 'Highest risk — maximum premium',
}

export default function TierPremiumSection({ tiers }: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(formData: FormData) {
    setMessage(null)
    startTransition(async () => {
      try {
        await updateTierPremiums(formData)
        setMessage({ type: 'success', text: 'Tier premiums saved.' })
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })
  }

  // Sort tiers T1 → T4 for predictable display order
  const sorted = [...tiers].sort((a, b) => a.tier.localeCompare(b.tier))

  return (
    <section className="bg-white rounded-md border border-slate-200 p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Tier Premiums</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Risk premium added to base rate per company tier. Loans lock the rate at creation.
        </p>
      </header>

      <form action={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {sorted.map((tier) => (
            <div key={tier.tier}>
              <label
                htmlFor={`tier_${tier.tier}`}
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                {tier.tier}
                <span className="text-xs text-slate-400 ml-1">(% /mo)</span>
              </label>
              <div className="relative">
                <input
                  id={`tier_${tier.tier}`}
                  name={`tier_${tier.tier}`}
                  type="number"
                  step="0.001"
                  min="0"
                  max="99.999"
                  defaultValue={(tier.premium_rate * 100).toFixed(3)}
                  required
                  className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-md text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  %
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{TIER_DESCRIPTIONS[tier.tier]}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Saving...' : 'Save Tiers'}
          </button>
          {message ? (
            <span
              className={`text-sm ${
                message.type === 'success' ? 'text-green-700' : 'text-red-700'
              }`}
              role="status"
            >
              {message.type === 'success' ? '✓' : '✗'} {message.text}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  )
}
