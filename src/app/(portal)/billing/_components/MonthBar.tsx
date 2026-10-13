'use client'

import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'

// The handoff's month control (2026-10-10): "← October 2026 →", and with
// `picker` the label opens a grid of the year's months — the year stepped
// with ‹ ›, the month on show in orange, this month ringed, "This month"
// under the grid. Service Billing's head carries the picker; the Billing
// Allocator's title carries the plain stepper.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  /** The month on show, `YYYY-MM`. */
  month: string
  /** Go to another month, `YYYY-MM`. */
  onGo: (month: string) => void
  /** The label opens the month grid. */
  picker?: boolean
  /** A smaller control beside a page title. */
  compact?: boolean
  disabled?: boolean
  /** Months the grid marks with a dot — `YYYY-MM` → what its tooltip says
   *  (the Statements page's months that have statements, 2026-10-14). */
  marked?: Readonly<Record<string, string>>
}

export default function MonthBar({ month, onGo, picker = false, compact = false, disabled = false, marked }: Props) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(month.slice(0, 4)))
  const ref = useRef<HTMLDivElement>(null)
  const at = dayjs(`${month}-01`)
  const label = at.format('MMMM YYYY')

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const go = (next: string) => {
    setOpen(false)
    if (next !== month) onGo(next)
  }
  const now = officeMonth()

  return (
    <div ref={ref} className={`bil-month${compact ? ' compact' : ''}`}>
      <button
        type="button"
        className="bil-month-step"
        aria-label="Previous month"
        title="Previous month"
        disabled={disabled}
        onClick={() => go(at.subtract(1, 'month').format('YYYY-MM'))}
      >
        ←
      </button>
      {picker ? (
        <button
          type="button"
          className="bil-month-label"
          aria-label={`Pick a month (${label})`}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            setYear(Number(month.slice(0, 4)))
            setOpen((o) => !o)
          }}
        >
          {label}
          <span className="bil-month-chev" aria-hidden>
            ▾
          </span>
        </button>
      ) : (
        <span className="bil-month-label">{label}</span>
      )}
      <button
        type="button"
        className="bil-month-step"
        aria-label="Next month"
        title="Next month"
        disabled={disabled}
        onClick={() => go(at.add(1, 'month').format('YYYY-MM'))}
      >
        →
      </button>

      {picker && open ? (
        <div role="dialog" aria-label="Pick a month" className="bil-month-pop">
          <div className="bil-month-year">
            <button type="button" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
              ‹
            </button>
            <span>{year}</span>
            <button type="button" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>
              ›
            </button>
          </div>
          <div className="bil-month-grid">
            {MONTHS.map((m, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={key === month}
                  data-now={key === now || undefined}
                  data-marked={marked?.[key] ? true : undefined}
                  title={marked?.[key]}
                  onClick={() => go(key)}
                >
                  {m}
                </button>
              )
            })}
          </div>
          <div className="bil-month-foot">
            <button type="button" onClick={() => go(now)}>
              This month
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
