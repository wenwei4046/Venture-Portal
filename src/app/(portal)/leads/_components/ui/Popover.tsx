'use client'

import type { CSSProperties, ReactNode } from 'react'
import u from './ui.module.css'

/**
 * A popover under its trigger (README §6.3): radius 11, the popover shadow, and a transparent full-screen layer behind
 * it that closes it on a click AND on a right-click (rule 6 — click outside closes every popover). The parent is
 * `position: relative` (`u.dropWrap`); `style` places it (the prototype puts most 34–40px below).
 */
export default function Popover({ open, onClose, style, className, children, label }: {
  open: boolean
  onClose: () => void
  style?: CSSProperties
  className?: string
  children: ReactNode
  label?: string
}) {
  if (!open) return null
  return (
    <>
      <div className={u.catcher} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} aria-hidden="true" />
      <div className={className ? `${u.pop} ${className}` : u.pop} style={style} role="menu" aria-label={label}>
        {children}
      </div>
    </>
  )
}
