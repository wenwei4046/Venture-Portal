'use client'

import { useState, useTransition } from 'react'
import { addStaff } from '../actions'

interface Props {
  departments: { id: string; name: string }[]
}

export default function AddStaffForm({ departments }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSubmit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await addStaff(formData)
        setSaved(true)
        // Reset form
        const form = document.getElementById('add-staff-form') as HTMLFormElement
        form?.reset()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form id="add-staff-form" action={handleSubmit} className="bg-surface border border-hairline rounded-md p-6 max-w-2xl">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Name</label>
          <input
            name="name"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Department</label>
          <select
            name="department_id"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select...</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Basic Salary <span className="text-xs text-muted ml-1 font-normal">(RM)</span>
          </label>
          <input
            name="basic_salary"
            type="number"
            step="0.01"
            min="0"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Allowances <span className="text-xs text-muted ml-1 font-normal">(RM)</span>
          </label>
          <input
            name="allowances"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Type</label>
          <select
            name="is_mgmt_fee"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="false">Attribution</option>
            <option value="true">Management Fee</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Adding...' : 'Add Staff'}
        </button>
        {saved && <span className="text-sm font-serif italic text-ledger">Added.</span>}
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    </form>
  )
}
