'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateDirectorStatutory } from '../../actions'

type StatField =
  | 'payroll_epf_er'
  | 'payroll_epf_ee'
  | 'payroll_socso_er'
  | 'payroll_socso_ee'
  | 'payroll_eis_er'
  | 'payroll_eis_ee'
  | 'invoice_epf_er'
  | 'invoice_socso_er'
  | 'invoice_eis_er'

interface Props {
  payoutId: string
  field: StatField
  value: number
  /** "payroll" deductions render in (parens); "invoice" additions render plain. */
  kind: 'payroll' | 'invoice'
  /** Disabled while payout is non-draft. */
  readOnly?: boolean
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// One statutory amount; click to edit, Enter or blur to save, Esc to cancel.
// Renders as the same `(123.45)` for payroll deductions and plain `123.45` for
// invoice ER additions so it visually matches the existing payslip layout.
export default function EditableDeduction({ payoutId, field, value, kind, readOnly }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value.toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Refresh draft when server-side value changes (e.g. after reset).
  useEffect(() => {
    if (!editing) setDraft(value.toFixed(2))
  }, [value, editing])

  function commit() {
    const num = Number(draft)
    if (!Number.isFinite(num) || num < 0) {
      setError('Must be ≥ 0')
      return
    }
    if (Math.abs(num - value) < 0.005) {
      setEditing(false)
      setError(null)
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await updateDirectorStatutory(payoutId, { [field]: num })
        setEditing(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  if (readOnly) {
    return (
      <span className={kind === 'payroll' ? 'num text-graphite' : 'num text-graphite'}>
        {kind === 'payroll' ? `(${fmt(value)})` : fmt(value)}
      </span>
    )
  }

  if (editing) {
    return (
      <span className="flex items-baseline gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setDraft(value.toFixed(2))
              setEditing(false)
              setError(null)
            }
          }}
          disabled={isPending}
          className="w-24 px-2 py-0.5 bg-paper border border-accent-border rounded font-mono tabular text-right text-sm text-ink focus:outline-none disabled:opacity-50"
        />
        {error ? (
          <span className="text-danger text-xs font-sans">{error}</span>
        ) : null}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to override"
      className={
        'num text-graphite hover:text-accent hover:bg-accent/5 rounded px-1 -mx-1 transition-colors cursor-text'
      }
    >
      {kind === 'payroll' ? `(${fmt(value)})` : fmt(value)}
    </button>
  )
}
