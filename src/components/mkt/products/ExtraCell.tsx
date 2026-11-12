'use client'

import { useState } from 'react'
import type { ExtraValue, ItemColumn } from '@/lib/marketing/catalog'
import MoneyInput from './MoneyInput'
import qs from './quotes.module.css'

// An item's value in one of the manager's own Product List columns, as its column holds it: text, a number, an amount,
// one of its options, yes / no — in the Product List's own flat look. null clears it.

export default function ExtraCell({ column: c, value, onChange, disabled = false }: {
  column: ItemColumn
  value: ExtraValue | undefined
  onChange: (v: ExtraValue | null) => void
  disabled?: boolean
}) {
  // A number as it is typed ("1." on the way to "1.5").
  const [typed, setTyped] = useState(typeof value === 'number' ? String(value) : '')
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (c.kind === 'number' && Number(typed) !== value) setTyped(typeof value === 'number' ? String(value) : '')
  }
  if (c.kind === 'money') {
    return (
      <span className={qs.rmBox}>
        <span className={qs.rm}>RM</span>
        <MoneyInput className={qs.rmIn} value={typeof value === 'number' ? value : null} placeholder="—" label={c.name} disabled={disabled} onChange={v => onChange(v)} />
      </span>
    )
  }
  if (c.kind === 'number') {
    return (
      <input className={`${qs.flat} ${qs.flatNum}`} inputMode="decimal" value={typed} placeholder="—" aria-label={c.name} disabled={disabled}
        onChange={e => {
          const t = e.target.value.replace(/[^\d.-]/g, '')
          setTyped(t)
          if (t === '' || t === '-') return onChange(null)
          const n = Number(t)
          if (Number.isFinite(n)) onChange(n)
        }} />
    )
  }
  if (c.kind === 'choice') {
    return (
      <span style={{ display: 'flex', minWidth: 0 }}>
        <select className={`${qs.cellSel} ${qs.cellSelPlain}`} value={typeof value === 'string' ? value : ''} aria-label={c.name} disabled={disabled}
          onChange={e => onChange(e.target.value || null)}>
          <option value="">—</option>
          {c.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </span>
    )
  }
  if (c.kind === 'check') {
    return (
      <label className={qs.checkCell}>
        <input type="checkbox" checked={value === true} aria-label={c.name} disabled={disabled} onChange={e => onChange(e.target.checked ? true : null)} />
      </label>
    )
  }
  return (
    <input className={qs.flat} value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''} maxLength={200} placeholder="—"
      aria-label={c.name} disabled={disabled} onChange={e => onChange(e.target.value === '' ? null : e.target.value)} />
  )
}
