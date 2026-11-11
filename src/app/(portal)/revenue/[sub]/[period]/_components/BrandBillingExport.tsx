'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The month's Export (2026-11-11): Sales by Brand & Billing as an Excel
 * workbook or a PDF — `[period]/export?format=`. A plain download link each,
 * so nothing runs on the page and the browser saves the file.
 */
export default function BrandBillingExport({ href, align = 'right' }: { href: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const item = 'block w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-2 rounded-control'
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
      >
        Export ▾
      </button>
      {open ? (
        <div role="menu" className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-30 mt-1 w-56 rounded-card border border-hairline bg-surface p-1 shadow-lg`}>
          <a role="menuitem" className={item} href={`${href}?format=xlsx`} download onClick={() => setOpen(false)}>
            Excel (.xlsx)
          </a>
          <a role="menuitem" className={item} href={`${href}?format=pdf`} download onClick={() => setOpen(false)}>
            PDF
          </a>
        </div>
      ) : null}
    </div>
  )
}
