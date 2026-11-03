'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CardIcon } from '@/components/hrv/icons'
import { useEscape } from '@/components/hrv/overlay'
import s from './date.module.css'

// The Finance kit's date field (2026-10-14, the Finance revamp v2 — D08, the
// prototype's `dateField`): the day written out ("Wed, 14 Oct 2026") on a 40px
// button; pressed, a calendar of the month under it — or over it, when it does
// not fit below and there is more room above. A day picks and closes; ‹ › walk
// the months; *Today* picks the office's today. Esc, a press outside, or the
// button again close it.
//
// The calendar is fixed to the window (2026-11-03, the user's *Settle 1
// invoice* — 显示bug): it sat in the form's scroll, so a short window opened it
// over its field and cut off its month and first weeks under the head. Now
// nothing cuts it; it is placed as the kit's soft dropdown is (hrv/select),
// never past the window's edges, keeps its side while the months are walked,
// follows its field as the form scrolls, and closes once the field has left
// the form (`[data-cal-scope]`).

const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** The calendar's distance from its field, and from the window's edges. */
const GAP = 6
const EDGE = 8

const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number]

/** "Wed, 14 Oct 2026" — the prototype's display. */
export function dayLabel(iso: string): string {
  const [y, m, d] = parts(iso)
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MON[m - 1]} ${y}`
}

/** The month `n` away from `ym` (`YYYY-MM`). */
function shift(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

export function DateField({
  value,
  onChange,
  today,
  id,
  name,
  disabled = false,
  label,
  emptyText,
  onClear,
}: {
  /** `YYYY-MM-DD`. */
  value: string
  onChange: (iso: string) => void
  /** The office's today — the ring and *Today*. */
  today: string
  id?: string
  /** Sent with a form under this name. */
  name?: string
  disabled?: boolean
  /** The field's name for a screen reader, when no <label> points at it. */
  label?: string
  /**
   * A day that may be left out (an invoice's due date, 2026-10-14): with no
   * value the field says this, muted, and the calendar offers *Clear*.
   */
  emptyText?: string
  onClear?: () => void
}) {
  const v = value || today
  const shownText = !value && emptyText ? emptyText : dayLabel(v)
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<string | null>(null)
  const [up, setUp] = useState(false)
  const [shown, setShown] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const origin = useRef<HTMLSpanElement>(null)
  /** The side it opened on — kept while it stays open. */
  const side = useRef<'up' | 'down'>('down')

  const close = () => {
    setOpen(false)
    setMonth(null)
    setShown(false)
  }
  useEscape(open, close)

  /** Puts the calendar by its field; `choose`: pick its side first (on opening). */
  const place = (choose: boolean) => {
    const el = pop.current
    const b = button.current?.getBoundingClientRect()
    // Where the window's corner is drawn from here: a dialog's transform moves it.
    const o = origin.current?.getBoundingClientRect()
    if (!el || !b || !o) return
    // The phone's sheets draw the card as wide as its field.
    el.style.setProperty('--date-field-w', `${b.width}px`)
    const h = el.offsetHeight
    if (choose) {
      const below = window.innerHeight - b.bottom - GAP - EDGE
      const above = b.top - GAP - EDGE
      side.current = below >= h || below >= above ? 'down' : 'up'
    }
    const top = side.current === 'down' ? b.bottom + GAP : b.top - GAP - h
    const left = Math.max(EDGE, Math.min(b.left, window.innerWidth - el.offsetWidth - EDGE))
    el.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE)) - o.top}px`
    el.style.left = `${left - o.left}px`
    setUp(side.current === 'up')
  }

  // Placed before it is drawn: its side on opening, then again as a month of
  // more or fewer weeks changes its height.
  const ym = month ?? v.slice(0, 7)
  useLayoutEffect(() => {
    if (open) place(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useLayoutEffect(() => {
    if (open) place(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym])

  // It follows its field as the form or the page scrolls and as the window
  // resizes, and closes once the field has left the form. Again when a
  // transition ends: opened while the phone's sheet still rises, the sheet's
  // transform held it, and risen, the window does.
  useEffect(() => {
    if (!open) return
    const moved = () => {
      const b = button.current?.getBoundingClientRect()
      const form = button.current?.closest('[data-cal-scope]')?.getBoundingClientRect()
      if (b && (b.bottom <= (form ? form.top : 0) || b.top >= (form ? form.bottom : window.innerHeight))) return close()
      place(false)
    }
    document.addEventListener('scroll', moved, true)
    document.addEventListener('transitionend', moved, true)
    window.addEventListener('resize', moved)
    return () => {
      document.removeEventListener('scroll', moved, true)
      document.removeEventListener('transitionend', moved, true)
      window.removeEventListener('resize', moved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && e.target instanceof Node && wrap.current.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  // In a frame after it is drawn, so the fade plays.
  useEffect(() => {
    if (!open) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true))
    })
    const fallback = setTimeout(() => setShown(true), 80)
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      clearTimeout(fallback)
    }
  }, [open])

  const toggle = () => {
    if (open) return close()
    setMonth(null)
    setShown(false)
    setOpen(true)
  }
  const pick = (iso: string) => {
    onChange(iso)
    close()
    button.current?.focus({ preventScroll: true })
  }

  const [y, m] = ym.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()

  return (
    <div ref={wrap} className={s.wrap}>
      {name ? <input type="hidden" name={name} value={v} /> : null}
      <button
        ref={button}
        id={id}
        type="button"
        className={s.field}
        data-open={open ? 'true' : undefined}
        onClick={toggle}
        disabled={disabled}
        aria-label={label ? `${label}: ${shownText}` : undefined}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span data-empty={!value && emptyText ? 'true' : undefined}>{shownText}</span>
        <span className={s.glyph}>
          <CardIcon name="calendar" size={16} />
        </span>
      </button>
      {open ? <span ref={origin} className={s.origin} data-cal-origin="" aria-hidden="true" /> : null}
      {open ? (
        <div ref={pop} className={s.pop} data-side={up ? 'up' : 'down'} data-in={shown ? 'true' : undefined} role="group" aria-label="Calendar">
          <div className={s.head}>
            <button type="button" className={s.nav} onClick={() => setMonth(shift(ym, -1))} aria-label="Previous month">
              ‹
            </button>
            <span className={s.title}>
              {MONTH[m - 1]} {y}
            </span>
            <button type="button" className={s.nav} onClick={() => setMonth(shift(ym, 1))} aria-label="Next month">
              ›
            </button>
          </div>
          <div className={s.grid}>
            {DOWS.map((d, i) => (
              <span key={`dow-${i}`} className={s.dow} aria-hidden="true">
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <button key={`blank-${i}`} type="button" className={s.cell} disabled tabIndex={-1} aria-hidden="true" />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = i + 1
              const iso = `${ym}-${String(d).padStart(2, '0')}`
              const on = iso === (value || (emptyText ? '' : today))
              return (
                <button
                  key={iso}
                  type="button"
                  className={s.cell}
                  onClick={() => pick(iso)}
                  aria-label={`${d} ${MONTH[m - 1]} ${y}`}
                  aria-pressed={on}
                >
                  <span className={s.day} data-on={on ? 'true' : undefined} data-today={!on && iso === today ? 'true' : undefined}>
                    {d}
                  </span>
                </button>
              )
            })}
          </div>
          <div className={s.foot}>
            <span className={s.footDate}>{shownText}</span>
            {onClear && value ? (
              <button
                type="button"
                className={s.today}
                onClick={() => {
                  onClear()
                  close()
                }}
              >
                Clear
              </button>
            ) : null}
            <button type="button" className={s.today} onClick={() => pick(today)}>
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
