'use client'

import { useEffect, useRef, useState } from 'react'

interface Action {
  label: string
  href: string
  title?: string
}

interface Props {
  actions: Action[]
}

export default function MoreActionsDropdown({ actions }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onClick)
      document.addEventListener('keydown', onKey)
    }
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2"
      >
        More actions
        <span className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-64 bg-surface border border-hairline rounded-md shadow-sm z-10 py-1"
        >
          {actions.map((a, i) => (
            <a
              key={i}
              href={a.href}
              title={a.title}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 font-serif italic text-sm text-ink hover:bg-surface-2 transition-colors"
            >
              {a.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
