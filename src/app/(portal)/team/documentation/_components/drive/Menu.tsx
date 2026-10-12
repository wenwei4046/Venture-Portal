'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEscape } from '@/components/hrv/overlay'
import { DotsGlyph } from './icons'
import s from './drive.module.css'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  tone?: 'danger'
  /** Asked once more, as every Delete in Documentation: the first press arms it with these words, the second runs it. */
  confirm?: string
  disabled?: boolean
  onSelect: () => void
}

type ButtonProps = { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }

/**
 * A card's ⋮ menu, and + New's (2026-10-12, the Data center as a Drive): opens under its button, closes on a
 * pick, a press outside, Esc or a second press on the button; an item with `confirm` arms on the first press —
 * the armed pink of Delete — and runs on the second.
 */
export default function Menu({
  label,
  items,
  side = 'right',
  button,
}: {
  /** The menu's name: "More actions for Revenue". */
  label: string
  items: Array<MenuItem | 'rule'>
  side?: 'left' | 'right'
  /** A button of its own (+ New); the round ⋮ by default. */
  button?: (props: ButtonProps) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    setArmed(null)
  }
  useEscape(open, close)
  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])

  const toggle = () => (open ? close() : setOpen(true))
  const props: ButtonProps = { onClick: toggle, 'aria-expanded': open, 'aria-haspopup': 'menu' }

  return (
    <div ref={wrap} className={s.menuWrap}>
      {button ? (
        button(props)
      ) : (
        <button type="button" className={s.dots} aria-label={label} {...props}>
          <DotsGlyph />
        </button>
      )}
      {open ? (
        <div className={s.menu} role="menu" aria-label={label} data-side={side}>
          {items.map((item, i) =>
            item === 'rule' ? (
              <div key={`rule-${i}`} className={s.menuRule} role="separator" />
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
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
                {armed === item.key && item.confirm ? item.confirm : item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
