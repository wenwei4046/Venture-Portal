'use client'

import { useState, useTransition } from 'react'
import { createContract, updateContract } from '../actions'

interface Company {
  id: string
  name: string
  short_code: string
}

interface ContractData {
  id: string
  company_id: string
  description: string
  amount?: number
  start_date: string
  end_date: string
}

interface Props {
  companies: Company[]
  contract?: ContractData
}

export default function ContractForm({ companies, contract }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        if (contract) {
          await updateContract(formData)
        } else {
          await createContract(formData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form action={handleSubmit} className="max-w-2xl space-y-6">
      {contract && <input type="hidden" name="id" value={contract.id} />}

      {error && (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">
          {error}
        </div>
      )}

      {/* Company */}
      <div>
        <label className="block font-serif italic text-sm text-graphite mb-1">
          Subsidiary
        </label>
        <select
          name="company_id"
          defaultValue={contract?.company_id ?? ''}
          required
          className="w-full border border-hairline rounded-md px-3 py-2 font-sans text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        >
          <option value="">Select company...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.short_code} — {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block font-serif italic text-sm text-graphite mb-1">
          Project description
        </label>
        <input
          type="text"
          name="description"
          defaultValue={contract?.description ?? ''}
          required
          placeholder="e.g. Q2 2026 Social Media Campaign"
          className="w-full border border-hairline rounded-md px-3 py-2 font-sans text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      {/* Amount */}
      <div>
        <label className="block font-serif italic text-sm text-graphite mb-1">
          Contract amount (RM)
        </label>
        <input
          type="number"
          name="amount"
          defaultValue={contract?.amount ?? ''}
          required
          min="0.01"
          step="0.01"
          placeholder="e.g. 5000.00"
          className="w-full border border-hairline rounded-md px-3 py-2 font-mono text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block font-serif italic text-sm text-graphite mb-1">
            Start date
          </label>
          <input
            type="date"
            name="start_date"
            defaultValue={contract?.start_date ?? ''}
            className="w-full border border-hairline rounded-md px-3 py-2 font-mono text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
        <div>
          <label className="block font-serif italic text-sm text-graphite mb-1">
            End date
          </label>
          <input
            type="date"
            name="end_date"
            defaultValue={contract?.end_date ?? ''}
            className="w-full border border-hairline rounded-md px-3 py-2 font-mono text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-6 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending
          ? contract
            ? 'Saving...'
            : 'Creating...'
          : contract
            ? 'Save changes'
            : 'Create contract'}
      </button>
    </form>
  )
}
