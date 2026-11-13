'use client'

import { useState } from 'react'
import pb from './products.module.css'

// An item's est. days in a product's Items — the Product List's own (1–365), set here as on the list: whole days, "d"
// after the figure, emptied = none. Kept as typed while the list's answer comes back.

export default function DaysCell({ value, onChange, disabled = false }: {
  value: number | null
  onChange: (d: number | null) => void
  disabled?: boolean
}) {
  const [typed, setTyped] = useState(value === null ? '' : String(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if ((typed === '' ? null : Number(typed)) !== value) setTyped(value === null ? '' : String(value))
  }
  return (
    <span className={`${pb.iDays} ${pb.iDaysBox}${disabled ? ` ${pb.iDaysOff}` : ''}`}>
      <input
        className={pb.iDaysIn}
        inputMode="numeric"
        value={typed}
        placeholder="—"
        maxLength={3}
        disabled={disabled}
        aria-label="Est. days"
        title={disabled ? undefined : 'Est. days — the Product List’s, for every product and quotation with this item'}
        onChange={e => {
          const t = e.target.value.replace(/\D/g, '').slice(0, 3)
          const n = t === '' ? null : Math.min(365, Math.max(1, Number(t)))
          setTyped(n === null ? '' : String(n))
          if (n !== value) onChange(n)
        }}
      />
      {typed ? <span className={pb.iDaysD}>d</span> : null}
    </span>
  )
}
