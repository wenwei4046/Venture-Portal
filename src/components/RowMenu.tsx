'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFinView } from '@/components/layout/fin-view'

// A row's actions, on a right-click or its ⋯ button (2026-10-02).
//
// An issued invoice carried six links in its Action cell — PDF, Copy, Settle,
// + Credit note, 改 account, 作废 — which wrapped onto two lines and made every
// row twice as tall (user: "action 太多了,可以不可以 right click,然后我才选").
// A row now keeps the one action it is usually opened for, and the rest live
// here.
//
// Portaled to <body> and positioned in viewport coordinates, like the column
// filter in SortableTable: a transformed ancestor would otherwise re-base
// `fixed` and the menu would open somewhere else on the page.
//
// ONE LINE AN ITEM (2026-10-12, the user on the portal's descriptions: "I want
// delete it, cause this cause the view too messy" — as the bill menu went in
// #323): an item's `hint` is its tooltip, no longer words drawn beside its label.

export type RowMenuItem =
  | {
      key: string
      label: string
      /** A few words on what it does, or why it is shut — the item's tooltip. */
      hint?: string
      danger?: boolean
      disabled?: boolean
      onSelect: () => void
    }
  | 'sep'

export interface RowMenuAnchor {
  x: number
  y: number
}

interface Props {
  /** What the menu is for — the row's own number or name. */
  title: string
  anchor: RowMenuAnchor
  items: RowMenuItem[]
  onClose: () => void
}

export default function RowMenu({ title, anchor, items, onClose }: Props) {
  const fin = useFinView()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.x, top: anchor.y })

  // Keep it on screen: a right-click near the bottom or the right edge opens
  // the menu upwards / leftwards instead of under the fold.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(anchor.y, window.innerHeight - height - 8)),
    })
    el.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
  }, [anchor.x, anchor.y])

  useEffect(() => {
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
      if (list.length === 0) return
      e.preventDefault()
      const at = list.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length
      list[next].focus()
    }
    // pointerdown, not click: the click that OPENED the menu must not close it.
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${title}`}
      data-fin={fin ? 'true' : undefined}
      className="fixed z-[60] min-w-[220px] rounded-panel border border-hairline bg-paper p-1 shadow-xl font-sans normal-case text-left"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-2.5 pt-1.5 pb-2 mb-1 border-b border-hairline font-mono text-[11px] text-muted truncate">{title}</div>
      {items.map((item, i) =>
        item === 'sep' ? (
          <div key={`sep-${i}`} role="separator" className="my-1 border-t border-hairline" />
        ) : (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.hint}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
            className={`flex w-full items-baseline justify-between gap-4 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent-bg focus:bg-accent-bg focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent ${
              item.danger ? 'text-danger' : 'text-ink'
            }`}
          >
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
