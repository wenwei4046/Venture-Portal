'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { submitDeptExpense } from '../actions'

export default function ExpenseForm() {
  const [isPending, startTransition] = useTransition()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (error && formRef.current) {
      formRef.current.classList.remove('shake-once')
      void formRef.current.offsetWidth
      formRef.current.classList.add('shake-once')
      const el = formRef.current
      const handler = () => el.classList.remove('shake-once')
      el.addEventListener('animationend', handler, { once: true })
      return () => el.removeEventListener('animationend', handler)
    }
  }, [error])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData()
    formData.append('description', description)
    formData.append('amount', amount)

    startTransition(async () => {
      try {
        await submitDeptExpense(formData)
        // On success the Server Action redirects; this line is unreachable
        // unless there was an error during redirect.
      } catch (err) {
        // Next.js wraps redirect() in a special error; surface only real ones
        const msg = err instanceof Error ? err.message : 'Unknown error'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  const canSubmit =
    description.trim().length > 0 && parseFloat(amount) > 0 && !isPending

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Description
        </label>
        <input
          id="description"
          name="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Team lunch, Software subscription"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          disabled={isPending}
          required
        />
      </div>

      <div>
        <label
          htmlFor="amount"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Amount
        </label>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-muted">RM</span>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            disabled={isPending}
            required
          />
        </div>
        <p className="font-serif italic text-muted text-xs mt-1">
          Requires Principal approval before the expense posts to the dept pool.
        </p>
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 text-xs font-sans">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting…' : 'Submit for approval'}
        </button>
      </div>
    </form>
  )
}
