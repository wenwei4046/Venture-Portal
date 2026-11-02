'use client'

import type { ReactNode } from 'react'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import u from './ui.module.css'

/**
 * The collapsible right rail (README §6.9 — Reply rules, Reply templates, the Inbox's history): collapsed by default
 * to a 44px strip of icon buttons; open, a header row (the caller's segmented control) and `panel-right-close`.
 */
export default function SideRail({ open, onOpen, onClose, icons, head, width = 380, children }: {
  open: boolean
  onOpen: (which: string) => void
  onClose: () => void
  /** The strip's buttons while collapsed: each opens the rail on its part. */
  icons: { key: string; icon: LeadIconName; title: string }[]
  head?: ReactNode
  width?: number
  children: ReactNode
}) {
  if (!open) {
    return (
      <aside className={u.railShut} aria-label="Side panel">
        {icons.map(i => (
          <button key={i.key} type="button" className={u.railBtn} title={i.title} aria-label={i.title} onClick={() => onOpen(i.key)}>
            <LeadIcon name={i.icon} size={16} />
          </button>
        ))}
      </aside>
    )
  }
  return (
    <aside className={u.rail} style={{ width }} aria-label="Side panel">
      <div className={u.railHead}>
        <div style={{ flex: 1, minWidth: 0 }}>{head}</div>
        <button type="button" className={u.railBtn} title="Close panel" aria-label="Close panel" onClick={onClose}>
          <LeadIcon name="panel-right-close" size={16} />
        </button>
      </div>
      {children}
    </aside>
  )
}
