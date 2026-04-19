'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateDeptRequestPv } from '../actions'

interface Props {
  requestId: string
  banks: { id: string; bank_name: string; current_balance: number }[]
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
]

export default function GenerateDeptPvForm({ requestId, banks }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [bankId, setBankId] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await generateDeptRequestPv({ requestId, payFromAccountId: bankId, paymentMethod: method })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      <div>
        <label className="block text-xs font-sans text-muted mb-1">Pay from</label>
        <select
          value={bankId}
          onChange={(e) => setBankId(e.target.value)}
          required
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">— Select bank —</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name} (RM {b.current_balance.toLocaleString('en-MY', { minimumFractionDigits: 2 })})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-sans text-muted mb-1">Method</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <button
          type="submit"
          disabled={isPending || !bankId}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors disabled:opacity-50"
        >
          {isPending ? 'Generating…' : 'Generate PV'}
        </button>
      </div>
      {error ? (
        <div className="sm:col-span-3 text-sm font-serif italic text-danger">{error}</div>
      ) : null}
    </form>
  )
}
