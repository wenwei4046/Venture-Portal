'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  eyebrow: string
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/**
 * The window a card opens on the right (the Paycheck Window pattern from the
 * payroll grid, 2026-09-05): scrim behind, Escape closes, focus lands on the
 * close button so the keyboard is inside the window straight away.
 */
export default function PayWindow({ eyebrow, title, onClose, children, footer }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    // Capture phase, like the org chart's Escape — a focused input inside
    // the window must not swallow it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <>
      <div className="pay-scrim" onClick={onClose} aria-hidden />
      <div className="pay-win" role="dialog" aria-modal="true" aria-label={eyebrow}>
        <div className="wh">
          <div>
            <div className="page-eyebrow" style={{ marginBottom: 0 }}>
              {eyebrow}
            </div>
            <h3>{title}</h3>
          </div>
          <button ref={closeRef} type="button" className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="wb">{children}</div>
        {footer ? <div className="wf">{footer}</div> : null}
      </div>
    </>
  )
}
