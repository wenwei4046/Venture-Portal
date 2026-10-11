'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { dayLabel, monthLabel, monthOf, monthWeeks, shiftDay, shiftMonth } from '@/lib/rooms/model'
import s from './rooms.module.css'

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/**
 * The day pager's calendar (2026-10-11, the user: the label opens the month
 * and a day is picked straight from it; ‹ › still step a day at a time). Six
 * weeks, Monday first; the day asked for dark, today ringed in the accent, the
 * months either side faded. ‹ › on the card turn only its month; a day pressed
 * goes there and closes the card. The arrow keys move a day or a week, Escape
 * or a press outside closes it.
 */
export function DayPicker({
  day,
  today,
  onPick,
  onClose,
}: {
  /** The day asked for: its month opens, and it is drawn picked. */
  day: string
  today: string
  onPick: (day: string) => void
  onClose: () => void
}) {
  const [month, setMonth] = useState(() => monthOf(day))
  // The day the keyboard is on (the picked one to begin with); moving it into another month turns the card.
  const [focus, setFocus] = useState(day)
  const daysRef = useRef<HTMLDivElement>(null)
  const days = monthWeeks(month)
  // One day of the six weeks takes Tab: the keyboard's, else the 1st of the month shown.
  const tabDay = days.includes(focus) ? focus : `${month}-01`

  useEffect(() => {
    daysRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus()
  }, [focus])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = STEP[e.key]
    if (!n) return
    e.preventDefault()
    const next = shiftDay((e.target as HTMLElement).dataset.day ?? tabDay, n)
    setMonth(monthOf(next))
    setFocus(next)
  }

  return (
    <>
      <div className={s.pickCatch} onClick={onClose} aria-hidden="true" />
      <div
        className={s.pick}
        role="dialog"
        aria-label="Pick a day"
        onKeyDown={e => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onClose()
        }}
      >
        <div className={s.pickHead}>
          <button type="button" className={s.pickNav} onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="The month before">
            ‹
          </button>
          <span className={s.pickMonth} aria-live="polite">
            {monthLabel(month)}
          </span>
          <button type="button" className={s.pickNav} onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="The month after">
            ›
          </button>
        </div>
        <div className={s.pickWeek} aria-hidden="true">
          {WEEK.map(w => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className={s.pickDays} role="group" aria-label={monthLabel(month)} ref={daysRef} onKeyDown={onKey}>
          {days.map(d => (
            <button
              key={d}
              type="button"
              className={s.pickDay}
              data-day={d}
              data-outside={monthOf(d) !== month ? 'true' : undefined}
              aria-pressed={d === day}
              aria-current={d === today ? 'date' : undefined}
              aria-label={`${dayLabel(d)}${d === today ? ' · today' : ''}`}
              tabIndex={d === tabDay ? 0 : -1}
              onClick={() => onPick(d)}
            >
              {Number(d.slice(8))}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
