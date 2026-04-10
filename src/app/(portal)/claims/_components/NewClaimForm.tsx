'use client'

import { useState, useTransition } from 'react'
import { submitClaim } from '../actions'

export default function NewClaimForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showForm, setShowForm] = useState(false)

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        + New Claim
      </button>
    )
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await submitClaim(formData)
        setSaved(true)
        setShowForm(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form action={handleSubmit} className="bg-surface border border-hairline rounded-md p-6 max-w-lg">
      <h3 className="font-serif text-lg text-ink mb-4">New Claim</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Type</label>
          <select
            name="claim_type"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="benefit">Benefit Claim</option>
            <option value="project">Project Claim</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Claimant Name</label>
          <input
            name="claimant_name"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Amount <span className="text-xs text-muted ml-1 font-normal">(RM)</span>
          </label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Description</label>
          <input
            name="description"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
            placeholder="Car park, medical, event expense..."
          />
        </div>
      </div>
      {error && (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mt-3 text-xs font-sans">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting...' : 'Submit'}
        </button>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-sm text-graphite hover:text-ink font-sans"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
