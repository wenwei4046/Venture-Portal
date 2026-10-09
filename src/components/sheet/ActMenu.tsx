'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

// A page-head menu (2026-10-09, the Finance revamp): "From payroll ▾",
// "Export ▾", "+ Create Invoice ▾" — one button that opens a short list of the
// controls the captioned action band used to lay out side by side. The
// children are the very same buttons and links; the menu only holds them.

export default function ActMenu({ label, primary = false, children }: { label: string; primary?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div ref={ref} className="act-menu">
      <button
        type="button"
        id={id}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`act-menu-btn${primary ? ' primary' : ''}`}
      >
        {label}
        <span aria-hidden className="act-menu-chev">
          ▾
        </span>
      </button>
      {open ? (
        <div role="menu" aria-labelledby={id} className="act-menu-pop" onClick={(e) => {
          // A pick closes the menu; a click on the menu's own surface does not.
          if ((e.target as HTMLElement).closest('a, button')) setOpen(false)
        }}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
