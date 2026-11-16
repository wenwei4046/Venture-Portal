'use client'

import { useEffect, type ReactNode } from 'react'
import v2 from './v2.module.css'

// A centred modal (v2 › Interactions): translate(-50%, -50%), the scrim, opacity only; above the toasts. Escape and a
// click on the scrim close it unless it is busy.

export default function Modal({ label, width = 400, onClose, busy = false, children }: {
  label: string
  width?: number
  onClose: () => void
  busy?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])
  return (
    <>
      <div className={v2.scrim} onClick={() => { if (!busy) onClose() }} />
      <div className={v2.modal} style={{ width: `min(${width}px, calc(100vw - 48px))` }} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </>
  )
}
