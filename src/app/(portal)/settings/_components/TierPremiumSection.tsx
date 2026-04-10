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
  T4: 'Highest risk',
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

  const sorted = [...tiers].sort((a, b) => a.tier.localeCompare(b.tier))

  return (
    <section className="bg-surface border border-hairline rounded-md p-6">
      <header className="mb-5">
        <h2 className="font-serif text-xl text-ink">Tier Premiums</h2>
        <p className="font-serif italic text-graphite text-sm mt-0.5">
          Risk premium added to base rate per company tier. Loans lock the rate at creation.
        </p>
      </header>

      <form action={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          {sorted.map((tier) => (
            <div key={tier.tier}>
              <label
                htmlFor={`tier_${tier.tier}`}
                className="block text-sm font-sans font-medium text-graphite mb-1.5"
              >
                {tier.tier}
                <span className="text-xs text-muted ml-1 font-normal">(% /mo)</span>
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
                  className="w-full px-3 py-2 pr-8 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  %
                </span>
              </div>
              <p className="text-xs text-muted mt-1.5 font-sans">{TIER_DESCRIPTIONS[tier.tier]}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving…' : 'Save Tiers'}
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
