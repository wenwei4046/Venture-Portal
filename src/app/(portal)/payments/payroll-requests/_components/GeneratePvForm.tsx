'use client'

import { useState, useTransition } from 'react'
import { generatePvFromRequest } from '../actions'

interface Bank {
  id: string
  bank_name: string
  current_balance: number
}

interface Pool {
  key: string
  label: string
  balance: number
}

interface Props {
  requestId: string
  amount: number
  banks: Bank[]
  pools: Pool[]
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2 })
}

export default function GeneratePvForm({ requestId, amount, banks, pools }: Props) {
  const [bankId, setBankId] = useState<string>(banks[0]?.id ?? '')
  const [pool, setPool] = useState<string>(pools[0]?.key ?? 'hr_opex')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const selectedBank = banks.find(b => b.id === bankId)
  const bankShort = selectedBank ? selectedBank.current_balance < amount : false

  const selectedPool = pools.find(p => p.key === pool)
  const poolShort = selectedPool ? selectedPool.balance < amount : false

  function handleGenerate() {
    setError(null)
    if (!bankId) {
      setError('Pick a source bank')
      return
    }
    startTransition(async () => {
      try {
        await generatePvFromRequest(requestId, bankId, pool)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generate failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 font-sans text-xs text-graphite">
          <span className="text-muted">from</span>
          <select
            value={bankId}
            onChange={e => setBankId(e.target.value)}
            disabled={isPending}
            className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            {banks.length === 0 ? (
              <option value="">No active banks</option>
            ) : (
              banks.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bank_name} · RM {fmt(b.current_balance)}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-sans text-xs text-graphite">
          <span className="text-muted">pool</span>
          <select
            value={pool}
            onChange={e => setPool(e.target.value)}
            disabled={isPending}
            className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            {pools.map(p => (
              <option key={p.key} value={p.key}>
                {p.label} · RM {fmt(p.balance)}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={handleGenerate}
          disabled={isPending || !bankId || bankShort || poolShort}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {isPending ? 'Generating…' : 'Generate PV →'}
        </button>
      </div>
      {bankShort ? (
        <div className="font-serif italic text-danger text-xs">
          {selectedBank?.bank_name} balance (RM {selectedBank ? fmt(selectedBank.current_balance) : '0.00'}) is short of RM {fmt(amount)}.
        </div>
      ) : null}
      {poolShort ? (
        <div className="font-serif italic text-alert text-xs">
          {selectedPool?.label} pool balance (RM {selectedPool ? fmt(selectedPool.balance) : '0.00'}) is short of RM {fmt(amount)}.
          You can still generate, but add more source pools on the PV detail before Principal approval.
        </div>
      ) : null}
      {error ? (
        <div className="font-serif italic text-danger text-xs">{error}</div>
      ) : null}
    </div>
  )
}
