'use client'

import { useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react'
import type { PopAnchor } from './MovePopover'
import styles from './membership-controls.module.css'

export interface MenuAnchor extends PopAnchor { right?: number; parentTop?: number }
export interface OpenMenu { anchor: MenuAnchor; focus: boolean }

export function beside(button: HTMLButtonElement): MenuAnchor {
  const row = button.getBoundingClientRect()
  const panel = button.closest('[role="menu"]')!.getBoundingClientRect()
  return { left: panel.left, right: panel.right, top: row.top, bottom: row.bottom, parentTop: panel.top }
}

export function hasSideSpace(anchor: MenuAnchor) {
  const width = (anchor.right ?? anchor.left) - anchor.left
  return (anchor.right ?? anchor.left) - 1 + width <= window.innerWidth - 8 || anchor.left - width + 1 >= 8
}

export function openWithArrow(event: KeyboardEvent, open: () => void) {
  if (event.key !== 'ArrowRight') return
  event.preventDefault()
  event.stopPropagation()
  open()
}

/**
 * A hover that lands anywhere but the row which opened a submenu should
 * collapse that submenu: leaving one row for another is how a pointer says it
 * changed its mind. Disabled rows take no pointer events (CSS), so the panel
 * itself receives the hover for them — which is the whole point, because the
 * rows a cascade most often strands are the greyed-out ones underneath.
 * `hoverMayCollapse` keeps that to branches the pointer opened: once focus has
 * moved into a submenu it was clicked or typed into, and Escape dismisses it.
 */
export function hoverMayCollapse(panel: HTMLElement): boolean {
  const active = document.activeElement
  return !active || active === document.body || panel.contains(active)
}

/** Position beside a parent row; replace it in place only when neither side fits. */
export default function MenuPanel({ id, label, anchor, submenu = false, hidden = false, dialog = false, focus, onStackedChange, onRowHover, onBack, onClose, children }: {
  id?: string
  label: string
  anchor: MenuAnchor
  submenu?: boolean
  hidden?: boolean
  dialog?: boolean
  focus: boolean
  onStackedChange?: (stacked: boolean) => void
  /** The row under the pointer, or null for a gap, a heading or a disabled row. */
  onRowHover?: (row: HTMLButtonElement | null, panel: HTMLDivElement) => void
  onBack: () => void
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom })
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const place = () => {
      const { width, height } = menu.getBoundingClientRect()
      const right = (anchor.right ?? anchor.left) - 1
      const left = anchor.left - width + 1
      const stacked = submenu && right + width > window.innerWidth - 8 && left < 8
      const x = !submenu ? anchor.left : right + width <= window.innerWidth - 8 ? right : left >= 8 ? left : anchor.left
      const y = submenu ? stacked ? anchor.parentTop ?? anchor.top : anchor.top : anchor.bottom
      setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) })
      onStackedChange?.(stacked)
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(menu)
    return () => observer?.disconnect()
  }, [anchor, submenu, onStackedChange])
  useLayoutEffect(() => {
    if (focus && !hidden) (ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? ref.current)?.focus({ preventScroll: true })
  }, [focus, hidden, anchor])

  return <div ref={ref} id={id} role={dialog ? 'dialog' : 'menu'} tabIndex={-1} aria-label={label} className={styles.menu}
    style={{ ...position, visibility: hidden ? 'hidden' : undefined }}
    onMouseOver={onRowHover ? event => {
      if (ref.current) onRowHover((event.target as HTMLElement).closest('button'), ref.current)
    } : undefined} onKeyDown={event => {
      event.stopPropagation()
      if (dialog) {
        if (event.key === 'Escape') { event.preventDefault(); onBack() }
        if (event.key === 'Tab') {
          event.preventDefault()
          const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])]
          if (controls.length) {
            const current = controls.indexOf(document.activeElement as HTMLElement)
            controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
          } else ref.current?.focus({ preventScroll: true })
        }
        return
      }
      if (event.key === 'Escape' || event.key === 'ArrowLeft') { event.preventDefault(); onBack(); return }
      if (event.key === 'Tab') { onClose(); return }
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (!buttons.length) return
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>{children}</div>
}
