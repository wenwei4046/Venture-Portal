'use client'

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import k from './hrv.module.css'
import s from './select.module.css'

// The soft dropdown (2026-10-11, HR revamp round 2 — README 18.1, the
// handoff's `design/dropdown.js`). The real <select> stays — its value, its
// onChange, its keyboard — and only the popup is replaced: a pointer press
// opens a rounded menu fixed to the window (below the field, above it when
// there is no room, 6px away), the picked row peach with a ✓, a search box
// once there are more than eight options. It closes on a pick, a press
// outside, Esc, a resize or a scroll. A pick sets the select's value the way
// the browser would and fires `change`, so a React onChange hears it.

type Option = { value: string; text: string; disabled: boolean }

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** The field's radius: 10, or 12 on the guest page. */
  round?: 10 | 12
  /** Leave out the kit's field box (padding, border, size) — the caller draws it. */
  bare?: boolean
  /**
   * `soft` (the portal): radius 10 and the handoff's chevron. `native`: the
   * browser's own field, as the HR phone app draws it — only the popup is ours.
   */
  look?: 'soft' | 'native'
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, round = 10, bare = false, look = 'soft', children, ...props }, outer) {
  const ref = useRef<HTMLSelectElement | null>(null)
  const [open, setOpen] = useState(false)
  const setRef = useCallback(
    (el: HTMLSelectElement | null) => {
      ref.current = el
      if (typeof outer === 'function') outer(el)
      else if (outer) outer.current = el
    },
    [outer],
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || el.disabled || el.multiple) return
      e.preventDefault()
      setOpen(o => !o)
    }
    el.addEventListener('mousedown', onDown)
    return () => el.removeEventListener('mousedown', onDown)
  }, [])

  const cls = [bare ? '' : k.select, look === 'soft' ? s.field : '', look === 'soft' && round === 12 ? s.round12 : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <>
      <select ref={setRef} {...props} className={cls} data-dd-open={open ? '1' : undefined}>
        {children}
      </select>
      {open && ref.current ? <SoftMenu select={ref.current} onClose={() => setOpen(false)} /> : null}
    </>
  )
})

/** Set the select's value as the browser would, and say so. */
function choose(select: HTMLSelectElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (set) set.call(select, value)
  else select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  select.dispatchEvent(new Event('input', { bubbles: true }))
}

function SoftMenu({ select, onClose }: { select: HTMLSelectElement; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [options] = useState<Option[]>(() => Array.from(select.options).map(o => ({ value: o.value, text: o.text, disabled: o.disabled })))
  const [query, setQuery] = useState('')
  const [keyAt, setKeyAt] = useState(-1)
  const current = select.value
  const searchable = options.length > 8
  const shown = query ? options.filter(o => o.text.toLowerCase().includes(query.trim().toLowerCase())) : options

  const close = useCallback(() => onClose(), [onClose])
  const pick = useCallback(
    (o: Option) => {
      if (o.disabled) return
      choose(select, o.value)
      onClose()
      select.focus({ preventScroll: true })
    },
    [select, onClose],
  )

  // Placed as dropdown.js places it: measured once open, below the field
  // unless there is no room, never off the window's edges.
  useLayoutEffect(() => {
    const el = menu.current
    const box = list.current
    if (!el || !box) return
    const r = select.getBoundingClientRect()
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.minWidth = `${Math.max(r.width, 120)}px`
    el.style.maxWidth = `${window.innerWidth - 16}px`
    const o = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const maxH = Math.min(320, Math.max(below, above))
    box.style.maxHeight = `${maxH - (searchable ? 48 : 12)}px`
    const er = el.getBoundingClientRect()
    const wantL = Math.max(8, Math.min(r.left, window.innerWidth - er.width - 8))
    const wantT = below >= Math.min(er.height, 200) || below >= above ? r.bottom + 6 : r.top - er.height - 6
    el.style.left = `${wantL - o.left}px`
    el.style.top = `${wantT - o.top}px`
    const on = box.querySelector<HTMLElement>('[aria-selected="true"]')
    if (on) box.scrollTop = on.offsetTop - 40
    // The keyboard follows the menu while it is open: into its search box, else onto its list.
    setTimeout(() => (searchable ? search.current : box)?.focus({ preventScroll: true }), 0)
    // Only on opening: the menu stays where it opened while the list filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const inside = (t: EventTarget | null) => !!t && t instanceof Node && (menu.current?.contains(t) ?? false)
    const onDown = (e: MouseEvent) => {
      if (inside(e.target) || e.target === select) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The menu only — a drawer under it stays open.
        e.preventDefault()
        e.stopPropagation()
        close()
        select.focus({ preventScroll: true })
      }
    }
    const onScroll = (e: Event) => {
      if (!inside(e.target)) close()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [close, select])

  // Arrow keys walk the rows, Enter picks (the menu's own keyboard; the
  // field keeps the browser's when the menu is shut).
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setKeyAt(i => {
        const n = shown.length
        if (n === 0) return -1
        return ((i < 0 ? (step > 0 ? -1 : 0) : i) + step + n) % n
      })
    } else if (e.key === 'Enter' && keyAt >= 0 && shown[keyAt]) {
      e.preventDefault()
      pick(shown[keyAt])
    }
  }

  return createPortal(
    <div ref={menu} className={s.menu} onKeyDown={onListKey}>
      {searchable ? (
        <input
          ref={search}
          className={s.search}
          placeholder="Search…"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setKeyAt(-1)
          }}
          aria-label="Search the options"
        />
      ) : null}
      <div ref={list} className={s.list} role="listbox" tabIndex={searchable ? undefined : -1}>
        {shown.map((o, i) => (
          <div
            key={`${o.value}-${i}`}
            role="option"
            aria-selected={o.value === current && o.value !== ''}
            aria-disabled={o.disabled || undefined}
            data-placeholder={o.value === '' ? 'true' : undefined}
            data-key={i === keyAt ? 'true' : undefined}
            className={s.item}
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
              pick(o)
            }}
          >
            <span>{o.text}</span>
            <b className={s.tick} aria-hidden="true">✓</b>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
