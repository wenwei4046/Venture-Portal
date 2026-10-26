'use client'

import { useState } from 'react'
import { ringgitOf } from '@/lib/marketing/products'

// A ringgit amount typed in: what is typed stays as typed ("12." on the way to "12.50"); the amount goes out only when
// it is one — digits and two decimals at most; empty is none.

export default function MoneyInput({ value, onChange, className, placeholder, label, disabled }: {
  value: number | null
  onChange: (next: number | null) => void
  className?: string
  placeholder?: string
  label: string
  disabled?: boolean
}) {
  const [typed, setTyped] = useState(value == null ? '' : String(value))
  // A value set from outside (Use sum of actions) shows as it is, unless it is what is being typed.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (ringgitOf(typed) !== value) setTyped(value == null ? '' : String(value))
  }
  return (
    <input
      className={className}
      inputMode="decimal"
      value={typed}
      placeholder={placeholder}
      aria-label={label}
      disabled={disabled}
      onChange={e => {
        const next = ringgitOf(e.target.value)
        if (next === undefined) return
        setTyped(e.target.value.replace(/[^\d.]/g, ''))
        if (next !== value) onChange(next)
      }}
    />
  )
}
