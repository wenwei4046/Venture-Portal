'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '@/components/hrv/overlay'
import { usePresence } from './presence'
import s from './drawer.module.css'

// The hub's right drawer (2026-10-14, the Finance revamp v2 — D05): over the
// sheet only inside the shell's frame (`[data-hrv-overlay]`), fixed to the
// window's edge where no shell is drawn (the Principal's own view). Esc and
// the scrim close it; it plays out before it goes (README › Motion).

const EXIT_MS = 340

export function FinDrawer({
  open,
  onClose,
  title,
  headActions,
  bar,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  /** The head's mono line — the voucher's number. */
  title: ReactNode
  /** Before the ×: View full page ↗, Print. */
  headActions?: ReactNode
  /** The action bar at its foot. */
  bar?: ReactNode
  /** The dialog's name for a screen reader. */
  label: string
  children: ReactNode
}) {
  const { mounted, shown } = usePresence(open, EXIT_MS)
  const [root, setRoot] = useState<{ el: Element; fixed: boolean } | null>(null)
  useEffect(() => {
    const frame = document.querySelector('[data-hrv-overlay]')
    setRoot(frame ? { el: frame, fixed: false } : { el: document.body, fixed: true })
  }, [])
  useEscape(open, onClose)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    return () => before?.focus?.({ preventScroll: true })
  }, [open])
  if (!mounted || !root) return null
  const fixed = root.fixed ? ` ${s.fixed}` : ''
  return createPortal(
    <div className={s.root} data-shown={shown ? 'true' : 'false'} data-fin-kit="" data-fin-drawer="">
      <div className={`${s.scrim}${fixed}`} onClick={onClose} aria-hidden="true" />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`${s.panel}${fixed}`}>
        <div className={s.head}>
          <span className={s.title}>{title}</span>
          {headActions}
          <button type="button" className={s.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={s.body}>{children}</div>
        {bar ? <div className={s.bar}>{bar}</div> : null}
      </div>
    </div>,
    root.el,
  )
}

export { s as drawerStyles }
