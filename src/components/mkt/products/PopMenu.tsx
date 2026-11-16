'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import v2 from './v2.module.css'

// A menu at the pointer (v2 › Interactions): position fixed, clamped to the viewport once its size is known, a fade of
// .12s; a click or a right-click outside closes it, and so do Escape, a scroll and a resize.

export interface MenuAt { x: number; y: number }

/** Where a right-click or a ⋯ button opens a menu. */
export function menuAt(e: { clientX: number; clientY: number; currentTarget?: EventTarget | null }, fromButton = false): MenuAt {
  if (fromButton && e.currentTarget instanceof HTMLElement) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: r.right, y: r.bottom + 4 }
  }
  return { x: e.clientX, y: e.clientY }
}

export default function PopMenu({ at, width, label, onClose, children, alignRight = false }: {
  at: MenuAt
  width: number
  label: string
  onClose: () => void
  children: ReactNode
  /** Opened from a ⋯ button: its right edge under the button's. */
  alignRight?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: alignRight ? at.x - width : at.x, top: at.y })
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    const left = Math.max(8, Math.min(alignRight ? at.x - width : at.x, window.innerWidth - width - 8))
    const top = Math.max(8, Math.min(at.y, window.innerHeight - h - 8))
    setPos({ left, top })
  }, [at.x, at.y, width, alignRight])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const off = (e: Event) => {
      if (e.type === 'scroll' && ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      onClose()
    }
    window.addEventListener('keydown', esc)
    document.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('keydown', esc)
      document.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [onClose])
  return (
    <>
      <div className={v2.menuScrim} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div ref={ref} className={v2.menu} style={{ left: pos.left, top: pos.top, width }} role="menu" aria-label={label}>
        {children}
      </div>
    </>
  )
}
