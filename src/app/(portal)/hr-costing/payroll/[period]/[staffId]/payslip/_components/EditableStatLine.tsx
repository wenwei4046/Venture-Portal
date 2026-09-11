'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateStaffStatutory } from '../../../../actions'

type StatField = 'epf_er' | 'epf_ee' | 'socso_er' | 'socso_ee' | 'eis_er' | 'eis_ee' | 'pcb'

interface Props {
  payrollId: string
  field: StatField
  value: number
  /** Disable while payroll is non-draft. */
  readOnly?: boolean
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Click-to-edit one EPF/SOCSO/EIS amount on the staff payslip. Mirrors the
// director version. Net pay re-renders on the next router.refresh().
export default function EditableStatLine({ payrollId, field, value, readOnly }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value.toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

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
        await updateStaffStatutory(payrollId, { [field]: num })
        setEditing(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  if (readOnly) {
    return <span className="num">{fmt(value)}</span>
  }

  if (editing) {
    return (
      <span className="flex items-baseline gap-2">
        <input
          ref={inputRef}
          type="text"
          aria-label={`Override ${field.toUpperCase()}`}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
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
      aria-label={`Edit ${field.toUpperCase()}`}
      onClick={() => setEditing(true)}
      title="Click to override"
      className="num hover:text-accent hover:bg-accent/5 rounded px-1 -mx-1 transition-colors cursor-text"
    >
      {fmt(value)}
    </button>
  )
}
