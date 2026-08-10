'use client'

import { useRef, useState, useTransition } from 'react'
import { uploadStatement } from '../actions'

export default function UploadStatementForm({
  banks,
  defaultMonth,
}: {
  banks: Array<{ id: string; label: string }>
  defaultMonth: string
}) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [month, setMonth] = useState(defaultMonth)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    setError(null)
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Pick a statement file (.xlsx / .csv)')
      return
    }
    const fd = new FormData()
    fd.set('bank_account_id', bankId)
    fd.set('period_month', month)
    fd.set('file', file)
    startTransition(async () => {
      try {
        const r = await uploadStatement(fd)
        if (r?.error) setError(r.error)
      } catch (err) {
        // Success ends in redirect() → NEXT_REDIRECT must be re-thrown.
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    })
  }

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 max-w-2xl">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block">
          <span className="block text-xs font-sans text-graphite mb-1">Bank</span>
          <select
            value={bankId}
            onChange={e => setBankId(e.target.value)}
            disabled={isPending}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {banks.map(b => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-sans text-graphite mb-1">Statement month</span>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            disabled={isPending}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </label>
        <label className="block flex-1 min-w-[220px]">
          <span className="block text-xs font-sans text-graphite mb-1">File (.xlsx / .csv / .pdf)</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt,.pdf"
            disabled={isPending}
            className="block w-full text-sm text-graphite file:mr-3 file:px-3 file:py-2 file:rounded-md file:border file:border-hairline file:bg-paper file:text-sm file:text-ink file:font-sans hover:file:bg-surface-2"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          {isPending ? 'Reconciling…' : 'Upload & reconcile →'}
        </button>
      </div>
      {error ? <p className="text-sm font-sans text-danger mt-3">{error}</p> : null}
    </div>
  )
}
