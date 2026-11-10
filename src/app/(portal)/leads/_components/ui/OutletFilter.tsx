'use client'

import { useState } from 'react'
import { LeadIcon } from '@/components/layout/lead-icons'
import { outletFilterLabel, outletMenu, type LeadOutlet, type OutletFilter as Filter } from '@/lib/leads/outlets'
import s from './outlet-filter.module.css'

/**
 * The All outlets filter (Lead View v3 § 3; the prototype's `outFilter`): a ghost button with a map-pin — olive while
 * an outlet is picked — opening a 240px menu of All outlets, each brand's outlets under the brand in capitals, and No
 * outlet last, each with its count. `size` 'sm' is Reply rules' (28px, 12px, over the outlet column), 'md' Leads' and
 * the Inbox's (34px, 14px).
 */
export default function OutletFilter({ outlets, brands, value, onChange, counts, size = 'md' }: {
  outlets: LeadOutlet[]
  brands: Array<{ id: string; name: string }>
  value: Filter
  onChange: (v: Filter) => void
  counts: Map<string, number>
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const rows = outletMenu(outlets, brands, counts)
  return (
    <div className={s.wrap} data-size={size}>
      <button type="button" className={s.btn} data-on={value !== 'all' || undefined} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        <LeadIcon name="map-pin" size={size === 'sm' ? 13 : 15} className={s.pin} />{outletFilterLabel(outlets, value)}<LeadIcon name="chevron-down" size={size === 'sm' ? 13 : 14} className={s.chev} />
      </button>
      {open ? (
        <>
          <div className={s.catch} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={s.menu} role="menu" aria-label="Outlet">
            {rows.map((o, i) => o.kind === 'head'
              ? <span key={'h' + i} className={s.head}>{o.label}</span>
              : (
                <button key={o.value} type="button" role="menuitemradio" aria-checked={value === o.value} className={s.item} onClick={() => { onChange(o.value); setOpen(false) }}>
                  <span className={s.label}>{o.label}</span><span className={s.n}>{o.count}</span>
                </button>
              ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
