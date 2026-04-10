'use client'

import { useState, useTransition } from 'react'
import { updatePCB } from '../../actions'
import { formatMoney } from '@/lib/utils'

interface Props {
  payoutId: string
  currentPcb: number
  suggestedPcb: number
  payrollGross: number
  totalDeductions: number
}

export default function PCBInput({ payoutId, currentPcb, suggestedPcb, payrollGross, totalDeductions }: Props) {
  const [isPending, startTransition] = useTransition()
  const [pcb, setPcb] = useState(currentPcb || suggestedPcb)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const net = payrollGross - totalDeductions - pcb

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updatePCB(payoutId, pcb)
        setSaved(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-serif italic text-sm text-graphite">PCB</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">RM</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={pcb || ''}
            onChange={e => { setPcb(parseFloat(e.target.value) || 0); setSaved(false) }}
            className="w-28 px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink text-right focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>
      {suggestedPcb > 0 && currentPcb !== suggestedPcb && (
        <p className="font-mono text-xs text-muted text-right">
          Suggested: {formatMoney(suggestedPcb)} (from Jadual PCB)
        </p>
      )}
      <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
        <span className="font-serif italic text-sm text-accent">Net to Director</span>
        <span className={`font-mono tabular text-md font-semibold ${net >= 0 ? 'text-ink' : 'text-danger'}`}>
          {formatMoney(net)}
        </span>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Save PCB'}
        </button>
        {saved && <span className="text-sm font-serif italic text-ledger">Saved.</span>}
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    </div>
  )
}
