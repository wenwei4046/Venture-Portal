'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitRequestPayment } from '../actions'

interface Props {
  companies: { id: string; name: string; short_code: string }[]
  categories: { code: string; label: string }[]
  // P0-3: available balance (pool balance minus in-flight Stage 1 requests).
  availableBalance: number
}

function formatRM(n: number) {
  const abs = Math.abs(n).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `RM (${abs})` : `RM ${abs}`
}

export default function RequestPaymentForm({
  companies,
  categories,
  availableBalance,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [payeeCompanyId, setPayeeCompanyId] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')

  const amountNum = parseFloat(amount)
  const hasAmount = Number.isFinite(amountNum) && amountNum > 0
  const wouldOvercommit = hasAmount && amountNum > availableBalance
  const poolEmpty = availableBalance <= 0

  function handleCompanyChange(id: string) {
    setPayeeCompanyId(id)
    if (id) {
      const c = companies.find((c) => c.id === id)
      if (c && !payeeName) setPayeeName(c.name)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await submitRequestPayment({
          payeeCompanyId: payeeCompanyId || null,
          payeeName,
          amount: parseFloat(amount),
          description,
          categoryCode: category || null,
        })
        router.refresh()
        setPayeeCompanyId('')
        setPayeeName('')
        setAmount('')
        setDescription('')
        setCategory('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {/* P0-3: available balance banner so Dept Manager sees what they can spend BEFORE filling the form. */}
      <div
        className={
          poolEmpty
            ? 'bg-danger-bg border border-danger rounded-md p-3 text-sm'
            : 'bg-surface border border-hairline rounded-md p-3 text-sm'
        }
      >
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-graphite">Available to request</span>
          <span
            className={
              poolEmpty
                ? 'font-mono tabular font-medium text-danger'
                : 'font-mono tabular font-medium text-ink'
            }
          >
            {formatRM(availableBalance)}
          </span>
        </div>
        {poolEmpty ? (
          <p className="font-serif italic text-danger text-xs mt-1">
            Pool is empty or negative — you cannot submit a payment request until the pool is topped up (Marketing NP or refund credit).
          </p>
        ) : (
          <p className="font-serif italic text-muted text-xs mt-1">
            Pool balance minus requests already awaiting Principal. Submitting more than this will be rejected.
          </p>
        )}
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Vendor company <em className="text-muted text-xs">(optional)</em>
          </label>
          <select
            value={payeeCompanyId}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">— External (no company on file) —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Pay to <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            placeholder="Recipient name"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Amount (RM) <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className={
              wouldOvercommit
                ? 'w-full px-3 py-2 bg-paper border border-danger rounded-md text-sm font-mono text-danger focus:outline-none'
                : 'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border'
            }
            placeholder="0.00"
          />
          {wouldOvercommit ? (
            <p className="font-serif italic text-danger text-xs mt-1">
              Exceeds available balance ({formatRM(availableBalance)}). Reduce the amount or wait for pool top-up.
            </p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Category <em className="text-muted text-xs">(P&L)</em>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">— Select category —</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1">
          Description <span className="text-danger">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          required
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          placeholder="What is this payment for?"
        />
      </div>

      <div className="bg-accent-bg border border-accent-border rounded-md p-3 text-xs font-serif italic text-ink">
        Pool: <strong className="text-accent">Marketing Dept Pool</strong> — debited on Principal approval.
        Finance will pick the source bank when generating the PV.
      </div>

      <button
        type="submit"
        disabled={isPending || poolEmpty || wouldOvercommit}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending
          ? 'Submitting…'
          : poolEmpty
            ? 'Pool empty — cannot submit'
            : wouldOvercommit
              ? 'Amount exceeds available balance'
              : 'Submit for Principal approval'}
      </button>
    </form>
  )
}
