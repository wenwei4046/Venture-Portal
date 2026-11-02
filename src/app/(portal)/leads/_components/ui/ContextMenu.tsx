'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import u from './ui.module.css'

/**
 * The right-click menu (README §6.2): fixed at the pointer, clamped to the window, min-width 200, radius 11. The
 * transparent layer behind it closes it on a click and on a right-click. A sub-mode ("Move to ›", a delete's confirm)
 * replaces the menu's content in place — the caller swaps `children`.
 */
export default function ContextMenu({ at, onClose, children, width }: {
  at: { x: number; y: number } | null
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!at || !ref.current) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    setPos(clampToWindow(at, r.width, r.height, window.innerWidth, window.innerHeight))
  }, [at, children])
  if (!at) return null
  return (
    <>
      <div className={u.catcher} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} aria-hidden="true" />
      <div ref={ref} className={u.menu} role="menu" style={{ left: pos?.left ?? at.x, top: pos?.top ?? at.y, minWidth: width, visibility: pos ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </>
  )
}

/** Where a menu of w × h opened at the pointer sits so it stays 8px inside the window. */
export function clampToWindow(at: { x: number; y: number }, w: number, h: number, vw: number, vh: number): { left: number; top: number } {
  return { left: Math.max(8, Math.min(at.x, vw - w - 8)), top: Math.max(8, Math.min(at.y, vh - h - 8)) }
}

export function MenuItem({ icon, children, onSelect, danger, selected, disabled, count }: {
  icon?: LeadIconName
  children: ReactNode
  onSelect: () => void
  danger?: boolean
  selected?: boolean
  disabled?: boolean
  count?: ReactNode
}) {
  return (
    <button type="button" role={selected === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={selected} className={u.menuItem} data-danger={danger || undefined} disabled={disabled} onClick={onSelect}>
      {icon ? <LeadIcon name={icon} size={14} /> : null}
      <span>{children}</span>
      {count !== undefined ? <span className={u.menuCount}>{count}</span> : null}
    </button>
  )
}

export function MenuSep() {
  return <div className={u.menuSep} role="separator" />
}

export function MenuHead({ children }: { children: ReactNode }) {
  return <div className={u.menuHead}>{children}</div>
}
