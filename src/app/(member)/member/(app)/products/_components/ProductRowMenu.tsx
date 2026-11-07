'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProductDraftState } from './ProductWorkspace'
import c from './products.module.css'

export interface ProductRowMenuItem {
  key: string
  label: string
  /** Why it is shut, or what it does — the item's tooltip, never a second line. */
  hint?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

/** Where it opens: a right-click's point, or under the row's ⋯ — viewport coordinates. */
export interface ProductRowMenuAnchor {
  x: number
  y: number
}

/**
 * A row's menu on the Product List (Costing Setting, 2026-11-07): a right-click
 * on the row, or its ⋯ (DESIGN.md › the row menu — one line an item, Shift +
 * right-click keeps the browser's own). Drawn in the workspace's overlay host —
 * inside the Revenue app's palette, over the list — and placed in the host's
 * own coordinates, kept inside it; a scroll, a resize, Esc or a press anywhere
 * else closes it. ↑ / ↓ move between its items.
 */
export default function ProductRowMenu({ title, anchor, items, onClose }: {
  title: string
  anchor: ProductRowMenuAnchor
  items: ProductRowMenuItem[]
  onClose: () => void
}) {
  const { overlayHost } = useProductDraftState()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const frame = (overlayHost?.parentElement ?? document.documentElement).getBoundingClientRect()
    const { width, height } = el.getBoundingClientRect()
    const room = { w: overlayHost ? frame.width : window.innerWidth, h: overlayHost ? frame.height : window.innerHeight }
    const x = anchor.x - (overlayHost ? frame.left : 0)
    const y = anchor.y - (overlayHost ? frame.top : 0)
    setPos({
      left: Math.max(8, Math.min(x, room.w - width - 8)),
      top: Math.max(8, Math.min(y, room.h - height - 8)),
    })
    el.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
  }, [anchor.x, anchor.y, overlayHost])

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

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${title}`}
      className={c.rowMenu}
      data-fixed={overlayHost ? undefined : ''}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className={c.rowMenuTitle}>{title}</div>
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={c.rowMenuItem}
          data-tone={item.danger ? 'danger' : undefined}
          disabled={item.disabled}
          title={item.hint}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
  if (typeof document === 'undefined') return null
  return overlayHost ? createPortal(menu, overlayHost) : menu
}
