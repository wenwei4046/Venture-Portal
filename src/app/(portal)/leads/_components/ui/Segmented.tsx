'use client'

import type { ReactNode } from 'react'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import u from './ui.module.css'

/** The segmented control (README §6.6): a page-coloured track (the rail's darker one inside a rail), the picked option white. */
export default function Segmented<T extends string>({ value, options, onChange, rail, equal, label }: {
  value: T
  options: { value: T; label: ReactNode; icon?: LeadIconName; title?: string }[]
  onChange: (v: T) => void
  rail?: boolean
  /** Every option the same width (the rules preview's ☀ / ☾). */
  equal?: boolean
  label?: string
}) {
  return (
    <div className={u.seg} data-rail={rail || undefined} role="group" aria-label={label} style={equal ? { display: 'flex' } : undefined}>
      {options.map(o => (
        <button key={o.value} type="button" className={u.segOpt} aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)} style={equal ? { flex: 1 } : undefined}>
          {o.icon ? <LeadIcon name={o.icon} size={14} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  )
}
