'use client'

import { useState, type ReactNode } from 'react'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import Popover from './Popover'
import { MenuItem } from './ContextMenu'
import u from './ui.module.css'

export interface DropOption<T extends string> {
  value: T
  label: string
  count?: ReactNode
  icon?: LeadIconName
}

/**
 * A select drawn as the handoff's dropdown (README §6.3): a ghost trigger — icon, label, chevron-down 13px — and a
 * popover 40px below; the picked row on the page colour, 600, its count on the right. "All" is the caller's first
 * option (rule 8).
 */
export default function Dropdown<T extends string>({ value, options, onChange, icon, label, width, top = 40, align = 'left' }: {
  value: T
  options: DropOption<T>[]
  onChange: (v: T) => void
  icon?: LeadIconName
  /** What the trigger says; defaults to the picked option's label. */
  label?: ReactNode
  width?: number
  top?: number
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const picked = options.find(o => o.value === value)
  return (
    <span className={u.dropWrap}>
      <button type="button" className={u.trigger} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        {icon ? <LeadIcon name={icon} size={15} /> : null}
        <span>{label ?? picked?.label}</span>
        <LeadIcon name="chevron-down" size={13} className={u.triggerChevron} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} style={{ top, [align]: 0, minWidth: width ?? 200 }}>
        {options.map(o => (
          <MenuItem key={o.value} icon={o.icon} selected={o.value === value} count={o.count} onSelect={() => { setOpen(false); onChange(o.value) }}>
            {o.label}
          </MenuItem>
        ))}
      </Popover>
    </span>
  )
}
