'use client'

import { useState, useTransition } from 'react'
import { addCompany, updateCompany, toggleCompanyActive } from '../actions'

interface CompanyRow {
  id: string
  name: string
  short_code: string
  is_active: boolean
}

interface Props {
  companies: CompanyRow[]
}

export default function CompaniesSection({ companies }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleAdd(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await addCompany(formData)
        setShowAdd(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  function handleUpdate(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await updateCompany(formData)
        setEditId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  function handleToggle(formData: FormData) {
    startTransition(async () => {
      try {
        await toggleCompanyActive(formData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-serif text-2xl text-ink">Subsidiaries</h2>
        <button
          type="button"
          onClick={() => { setShowAdd(!showAdd); setEditId(null) }}
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          {showAdd ? 'Cancel' : '+ Add subsidiary'}
        </button>
      </div>
      <p className="font-serif italic text-graphite text-sm mb-6">
        Manage subsidiary companies. Changes apply to all modules.
      </p>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {/* ── Add form ── */}
      {showAdd ? (
        <form action={handleAdd} className="bg-surface border border-hairline rounded-md p-6 mb-6 max-w-2xl">
          <h3 className="font-serif text-lg text-ink mb-4">New subsidiary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="new_name" className="block text-sm font-sans font-medium text-graphite mb-1">
                Company name
              </label>
              <input
                id="new_name"
                name="name"
                type="text"
                required
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                placeholder="e.g. HOUZS Century"
              />
            </div>
            <div>
              <label htmlFor="new_short_code" className="block text-sm font-sans font-medium text-graphite mb-1">
                Short code
              </label>
              <input
                id="new_short_code"
                name="short_code"
                type="text"
                required
                maxLength={10}
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border uppercase"
                placeholder="e.g. HC"
              />
              <p className="font-serif italic text-muted text-xs mt-1">
                Unique identifier, max 10 characters.
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add subsidiary'}
          </button>
        </form>
      ) : null}

      {/* ── Company list ── */}
      <div className="border border-hairline rounded-md bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-surface-2/30">
              <th className="text-left py-3 px-4 font-medium">Name</th>
              <th className="text-left py-3 px-4 font-medium">Code</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-right py-3 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-hairline last:border-0">
                {editId === c.id ? (
                  <td colSpan={4} className="p-4">
                    <form action={handleUpdate} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={c.id} />
                      <div>
                        <label className="block text-xs font-sans text-muted mb-1">Name</label>
                        <input
                          name="name"
                          type="text"
                          required
                          defaultValue={c.name}
                          className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-sans text-muted mb-1">Code</label>
                        <input
                          name="short_code"
                          type="text"
                          required
                          maxLength={10}
                          defaultValue={c.short_code}
                          className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border uppercase w-24"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isPending}
                        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-md disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="text-sm text-graphite hover:text-ink font-sans"
                      >
                        Cancel
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="py-3 px-4 font-serif text-ink">{c.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-graphite">{c.short_code}</td>
                    <td className="py-3 px-4">
                      <span className={`font-serif italic text-sm ${c.is_active ? 'text-ledger' : 'text-muted'}`}>
                        {c.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-3">
                      <button
                        type="button"
                        onClick={() => { setEditId(c.id); setShowAdd(false) }}
                        className="text-xs text-accent hover:text-accent-hover font-serif italic"
                      >
                        Edit
                      </button>
                      <form action={handleToggle} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="is_active" value={c.is_active ? 'false' : 'true'} />
                        <button
                          type="submit"
                          disabled={isPending}
                          className={`text-xs font-serif italic ${c.is_active ? 'text-muted hover:text-danger' : 'text-ledger hover:text-accent'}`}
                        >
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </form>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
