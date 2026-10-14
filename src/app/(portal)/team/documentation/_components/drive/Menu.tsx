'use client'

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '@/components/hrv/overlay'
import { CheckGlyph, DotsGlyph } from './icons'
import s from './drive.module.css'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  tone?: 'danger'
  /** Asked once more, as every Delete in Documentation: the first press arms it with these words, the second runs it. */
  confirm?: string
  disabled?: boolean
  /** A setting the item turns on or off (2026-10-14: "<person> can view", View only me): its tick at the end. */
  checked?: boolean
  onSelect: () => void
}

/** Opens the menu where the pointer is — a card's right-click (2026-10-14). */
export interface MenuHandle {
  openAt: (x: number, y: number) => void
}

type ButtonProps = { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }

/** Keeps a menu opened at a point inside the window: to the left of the pointer near the right edge, above it near the foot. */
export function placeMenu(at: { x: number; y: number }, size: { width: number; height: number }, view: { width: number; height: number }) {
  const gap = 8
  const left = Math.max(gap, Math.min(at.x, view.width - size.width - gap))
  const top = at.y + size.height > view.height - gap ? Math.max(gap, at.y - size.height) : at.y
  return { left, top }
}

/**
 * A card's ⋮ menu, and + New's (2026-10-12, the Data center as a Drive): opens under its button, closes on a
 * pick, a press outside, Esc or a second press on the button; an item with `confirm` arms on the first press —
 * the armed pink of Delete — and runs on the second. Since 2026-10-14 the same menu opens where a card is
 * right-clicked (`handle.openAt`, fixed to the window, in the overlay's theme), and an item may carry a tick.
 */
export default function Menu({
  label,
  items,
  side = 'right',
  button,
  handle,
}: {
  /** The menu's name: "More actions for Revenue". */
  label: string
  items: Array<MenuItem | 'rule'>
  side?: 'left' | 'right'
  /** A button of its own (+ New); the round ⋮ by default. */
  button?: (props: ButtonProps) => ReactNode
  handle?: Ref<MenuHandle>
}) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    setArmed(null)
    setPoint(null)
    setPlaced(null)
  }
  useImperativeHandle(handle, () => ({
    openAt: (x: number, y: number) => {
      setArmed(null)
      setPlaced(null)
      setPoint({ x, y })
      setOpen(true)
    },
  }), [])
  useEscape(open, close)
  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      const target = e.target as Node
      if (!wrap.current?.contains(target) && !list.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    // A menu fixed to the window at a point would float away from its card: a scroll or a resize closes it.
    const away = () => close()
    if (point) {
      window.addEventListener('resize', away)
      document.addEventListener('scroll', away, true)
    }
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', away)
      document.removeEventListener('scroll', away, true)
    }
  }, [open, point])
  useLayoutEffect(() => {
    if (!open || !point || placed || !list.current) return
    const r = list.current.getBoundingClientRect()
    setPlaced(placeMenu(point, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }))
  }, [open, point, placed])

  const toggle = () => (open ? close() : setOpen(true))
  const props: ButtonProps = { onClick: toggle, 'aria-expanded': open && !point, 'aria-haspopup': 'menu' }

  const menu = (
    <div
      ref={list}
      className={s.menu}
      role="menu"
      aria-label={label}
      data-side={side}
      data-at={point ? 'point' : undefined}
      style={point ? { left: placed?.left ?? point.x, top: placed?.top ?? point.y, visibility: placed ? undefined : 'hidden' } : undefined}
    >
      {items.map((item, i) =>
        item === 'rule' ? (
          <div key={`rule-${i}`} className={s.menuRule} role="separator" />
        ) : (
          <button
            key={item.key}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked === undefined ? undefined : item.checked}
            className={s.menuItem}
            data-tone={item.tone}
            data-armed={armed === item.key ? 'true' : undefined}
            disabled={item.disabled}
            onClick={() => {
              if (item.confirm && armed !== item.key) return setArmed(item.key)
              close()
              item.onSelect()
            }}
          >
            {item.icon ? <span className={s.menuIcon}>{item.icon}</span> : null}
            <span className={s.menuLabel}>{armed === item.key && item.confirm ? item.confirm : item.label}</span>
            {item.checked ? <span className={s.menuCheck}><CheckGlyph /></span> : null}
          </button>
        ),
      )}
    </div>
  )

  return (
    <div ref={wrap} className={s.menuWrap}>
      {button ? (
        button(props)
      ) : (
        <button type="button" className={s.dots} aria-label={label} {...props}>
          <DotsGlyph />
        </button>
      )}
      {open
        ? point
          ? createPortal(<div className="sheet-theme hrv-overlay" style={{ display: 'contents' }}>{menu}</div>, document.body)
          : menu
        : null}
    </div>
  )
}
