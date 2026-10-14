'use client'

import { useEffect, useRef, useState } from 'react'
import { CardIcon } from '@/components/hrv/icons'
import { useEscape } from '@/components/hrv/overlay'
import s from './date.module.css'

// The Finance kit's date field (2026-10-14, the Finance revamp v2 — D08, the
// prototype's `dateField`): the day written out ("Wed, 14 Oct 2026") on a 40px
// button; pressed, a calendar of the month under it — or over it, when the
// form's scroll (`[data-cal-scope]`) has under 390px below it and more above.
// A day picks and closes; ‹ › walk the months; *Today* picks the office's
// today. Esc, a press outside, or the button again close it.

const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Room the calendar needs below the field before it opens over it. */
const NEED = 390

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
}) {
  const v = value || today
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<string | null>(null)
  const [up, setUp] = useState(false)
  const [shown, setShown] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    setMonth(null)
    setShown(false)
  }
  useEscape(open, close)

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
    const b = button.current?.getBoundingClientRect()
    const scope = button.current?.closest('[data-cal-scope]')?.getBoundingClientRect()
    if (b) {
      const below = (scope ? scope.bottom : window.innerHeight) - b.bottom
      const above = b.top - (scope ? scope.top : 0)
      setUp(below < NEED && above > below)
    }
    setMonth(null)
    setShown(false)
    setOpen(true)
  }
  const pick = (iso: string) => {
    onChange(iso)
    close()
    button.current?.focus({ preventScroll: true })
  }

  const ym = month ?? v.slice(0, 7)
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
        aria-label={label ? `${label}: ${dayLabel(v)}` : undefined}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span>{dayLabel(v)}</span>
        <span className={s.glyph}>
          <CardIcon name="calendar" size={16} />
        </span>
      </button>
      {open ? (
        <div className={s.pop} data-side={up ? 'up' : 'down'} data-in={shown ? 'true' : undefined} role="group" aria-label="Calendar">
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
              const on = iso === v
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
            <span className={s.footDate}>{dayLabel(v)}</span>
            <button type="button" className={s.today} onClick={() => pick(today)}>
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
