'use client'

import { useEffect, useId, useRef, useState } from 'react'

// A page-head menu of the handoff (2026-10-10): "From payroll ▼", "Export ▼",
// "+ Create Invoice ▼". Its items are plain actions and links — a pick closes
// the menu and the page does the rest (a dialog is mounted by the page, not
// inside the menu, so closing the menu cannot take the dialog with it).

export type BillMenuItem =
  | { key: string; label: string; title?: string; onSelect: () => void }
  | { key: string; label: string; title?: string; href: string; newTab?: boolean }

export default function BillMenu({ label, items, primary = false }: { label: string; items: BillMenuItem[]; primary?: boolean }) {
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
    <div ref={ref} className={`act-menu bil-menu${primary ? ' primary' : ''}`}>
      <button
        type="button"
        id={id}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`act-menu-btn${primary ? ' primary' : ''}`}
      >
        {label}
        <span aria-hidden className="bil-menu-chev">
          ▼
        </span>
      </button>
      {open ? (
        <div role="menu" aria-labelledby={id} className="act-menu-pop bil-menu-pop">
          {items.map((it) =>
            'href' in it ? (
              <a
                key={it.key}
                role="menuitem"
                href={it.href}
                title={it.title}
                {...(it.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={() => setOpen(false)}
              >
                {it.label}
              </a>
            ) : (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                title={it.title}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
