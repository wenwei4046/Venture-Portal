'use client'

import { useState, useTransition } from 'react'
import { requestRelease } from '../actions'
import { formatMoney } from '@/lib/utils'

interface Props {
  userRole: string
  balance: number
}

export default function RequestReleaseButton({ userRole, balance }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (userRole !== 'finance') return null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be greater than 0')
      return
    }
    if (parsedAmount > balance) {
      setError(`Amount exceeds pool balance (${formatMoney(balance)})`)
      return
    }

    const formData = new FormData()
    formData.append('amount', amount)
    formData.append('description', description)

    startTransition(async () => {
      try {
        await requestRelease(formData)
        setSuccess(true)
        setAmount('')
        setDescription('')
        setShowForm(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  function handleCancel() {
    setShowForm(false)
    setAmount('')
    setDescription('')
    setError(null)
    setSuccess(false)
  }

  if (!showForm) {
    return (
      <div>
        {success ? (
          <div className="bg-ledger/10 border border-ledger text-ledger rounded-md p-2 text-xs font-sans mb-3">
            Release request submitted for approval.
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => { setShowForm(true); setSuccess(false) }}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          Request Release
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div>
        <label
          htmlFor="release-amount"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Amount
        </label>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-muted">RM</span>
          <input
            id="release-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
            disabled={isPending}
            required
          />
        </div>
        <p className="font-serif italic text-muted text-xs mt-1">
          Pool balance: {formatMoney(balance)}
        </p>
      </div>

      <div>
        <label
          htmlFor="release-description"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Description
        </label>
        <textarea
          id="release-description"
          name="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Reason for release"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          disabled={isPending}
          required
        />
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 text-xs font-sans">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !amount || !description.trim()}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting...' : 'Submit for approval'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="border border-hairline text-graphite font-sans text-sm px-4 py-2 rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
