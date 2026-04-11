'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/utils'

interface Props {
  currentPaidCapital: number
  currentWeightedCost: number
  opMargin: number
  currentBaseRate: number
}

export default function BaseRateSimulator({
  currentPaidCapital,
  currentWeightedCost,
  opMargin,
  currentBaseRate,
}: Props) {
  const [simAmount, setSimAmount] = useState(100000)
  const [simRate, setSimRate] = useState(0.008)
  const [showSim, setShowSim] = useState(false)

  if (!showSim) {
    return (
      <section className="bg-surface border border-hairline rounded-md p-6">
        <header className="mb-5">
          <h2 className="font-serif text-xl text-ink">Base Rate Simulator</h2>
          <p className="font-serif italic text-graphite text-sm mt-0.5">
            What-if: simulate adding new paid capital.
          </p>
        </header>
        <button
          onClick={() => setShowSim(true)}
          className="btn-secondary"
        >
          Open Simulator
        </button>
      </section>
    )
  }

  // Simulation: new weighted cost with added capital
  const newTotal = currentPaidCapital + simAmount
  const currentWeightedAmount = currentPaidCapital * currentWeightedCost
  const newWeightedAmount = currentWeightedAmount + (simAmount * simRate)
  const newWeightedCost = newTotal > 0 ? newWeightedAmount / newTotal : 0
  const newBaseRate = newWeightedCost + opMargin
  const rateChange = newBaseRate - currentBaseRate

  return (
    <section id="base-rate-simulator" className="bg-surface border border-hairline rounded-md p-6 scroll-mt-8">
      <header className="mb-5">
        <h2 className="font-serif text-xl text-ink">Base Rate Simulator</h2>
        <p className="font-serif italic text-graphite text-sm mt-0.5">
          What-if: simulate adding new paid capital and see the impact on base rate.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            New Capital Amount <span className="text-xs text-muted ml-1 font-normal">(RM)</span>
          </label>
          <input
            type="number"
            step="1000"
            min="0"
            value={simAmount}
            onChange={e => setSimAmount(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Cost Rate <span className="text-xs text-muted ml-1 font-normal">(%/mo)</span>
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={(simRate * 100).toFixed(3)}
            onChange={e => setSimRate((parseFloat(e.target.value) || 0) / 100)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      {/* Results */}
      <div className="border border-hairline rounded-md bg-paper p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-sm text-graphite">Current paid capital</span>
          <span className="font-mono tabular text-sm font-medium text-graphite">{formatMoney(currentPaidCapital)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-sm text-accent">+ New capital</span>
          <span className="font-mono tabular text-sm font-medium text-accent">+{formatMoney(simAmount)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
          <span className="font-serif italic text-sm text-ink">New total</span>
          <span className="font-mono tabular text-sm font-medium text-ink font-semibold">{formatMoney(newTotal)}</span>
        </div>

        <div className="pt-3 border-t border-hairline space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-graphite">Current weighted cost</span>
            <span className="font-mono tabular text-sm font-medium text-graphite">{(currentWeightedCost * 100).toFixed(3)}%/mo</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-accent">New weighted cost</span>
            <span className="font-mono tabular text-sm font-medium text-accent">{(newWeightedCost * 100).toFixed(3)}%/mo</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-graphite">Op margin</span>
            <span className="font-mono tabular text-sm font-medium text-graphite">+{(opMargin * 100).toFixed(3)}%</span>
          </div>
        </div>

        <div className="pt-3 border-t border-hairline">
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-ink">Current base rate</span>
            <span className="font-mono tabular text-sm font-medium text-graphite">{(currentBaseRate * 100).toFixed(3)}%/mo</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-accent">Simulated base rate</span>
            <span className="font-mono tabular text-md font-medium text-ink font-semibold">{(newBaseRate * 100).toFixed(3)}%/mo</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-serif italic text-sm text-graphite">Change</span>
            <span className={`font-mono tabular text-sm font-semibold ${rateChange > 0 ? 'text-danger' : rateChange < 0 ? 'text-ledger' : 'text-graphite'}`}>
              {rateChange > 0 ? '+' : ''}{(rateChange * 100).toFixed(3)}%
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowSim(false)}
        className="text-sm text-graphite hover:text-ink font-sans mt-4"
      >
        Close simulator
      </button>
    </section>
  )
}
