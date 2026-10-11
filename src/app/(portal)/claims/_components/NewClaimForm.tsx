'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { submitClaim } from '../actions'
import { Select } from '@/components/hrv/select'

export default function NewClaimForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showForm, setShowForm] = useState(false)
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

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="bg-accent hover:bg-accent-hover text-sm font-medium px-4 py-2 rounded-control transition-colors"
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
    // The sheet's form panel: white fields on a tinted card. The effect above
    // toggles `shake-once` on the node itself, so className stays constant.
    <form ref={formRef} action={handleSubmit} className="bg-surface-2 border border-hairline rounded-card p-6 max-w-lg">
      <h3 className="text-md font-bold mb-4">New pool claim</h3>
      {/* Pool claims only (2026-10-08): a member's own claim is sent from the
          Revenue app and decided in People › Member services. */}
      <input type="hidden" name="claim_type" value="project" />
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Claimant Name</label>
          <input
            name="claimant_name"
            required
            className="w-full px-3 py-2 bg-surface border border-hairline rounded-control text-sm focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Amount <span className="text-xs ml-1 font-normal">(RM)</span>
          </label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="w-full px-3 py-2 bg-surface border border-hairline rounded-control text-sm font-mono tabular font-medium focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Description</label>
          <input
            name="description"
            className="w-full px-3 py-2 bg-surface border border-hairline rounded-control text-sm focus:outline-none focus:border-accent-border"
            placeholder="Car park, medical, event expense..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Source pool
            <span className="text-xs ml-1 font-normal">(which pool to deduct from)</span>
          </label>
          <Select bare
            name="source_pool"
            defaultValue="venture_pool"
            required
            className="w-full px-3 py-2 bg-surface border border-hairline rounded-control text-sm focus:outline-none focus:border-accent-border"
          >
            <option value="venture_pool">Venture Pool</option>
            <option value="dept_pool_director">Director Pool</option>
            <option value="dept_pool_director_office">Director Office Dept Pool</option>
            <option value="dept_pool_marketing">Marketing Dept Pool</option>
            <option value="dept_pool_finance">Finance Dept Pool</option>
            <option value="dept_pool_hr">HR Dept Pool</option>
          </Select>
        </div>
      </div>
      {error && (
        <div className="bg-danger-bg border border-danger/50 text-danger rounded-md p-2 mt-3 text-xs">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-sm font-medium px-4 py-2 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting...' : 'Submit'}
        </button>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
