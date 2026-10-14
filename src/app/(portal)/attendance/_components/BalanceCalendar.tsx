'use client'

import { useState } from 'react'
import { addDays, daysInMonth, isoOf, monAbbr, shortDay, weekday } from '@/lib/attendance/engine'

/**
 * The From / To range calendar of Leave balances › Use leave (the handoff's
 * `uCal`, `HR Attendance.dc.html` lines 330–356): a month of 40px days, the
 * picked ends as orange 32px discs, the days between on a peach band, today
 * ringed; two boxes under it say From and To, the one waiting for a tap
 * outlined in orange. A tap sets From; the next (on or after it) sets To.
 */
export function RangeCalendar({
  from,
  to,
  today,
  onChange,
}: {
  from: string
  to: string
  today: string
  onChange: (range: { from: string; to: string }) => void
}) {
  const [month, setMonth] = useState((from || today).slice(0, 7) + '-01')
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7))
  const first = (weekday(month) + 6) % 7
  const len = daysInMonth(month)
  const step = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  }
  const box = (label: string, day: string, next: boolean) => (
    <span
      key={label}
      style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderRadius: 12, border: `1px solid ${next ? 'rgb(233 154 83)' : 'var(--ds-border)'}`, background: next ? 'rgb(255 245 233)' : 'var(--ds-surface-2)' }}
    >
      <span style={{ color: 'var(--ds-ink-2)', fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{day}</span>
    </span>
  )
  const navBtn = (label: string, glyph: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={label} style={{ width: 32, height: 32, border: 0, background: 'none', display: 'grid', placeItems: 'center', color: 'var(--ds-ink)', cursor: 'pointer', padding: 0 }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{glyph}</span>
    </button>
  )
  return (
    <div role="group" aria-label="From and To" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 10px 10px', borderRadius: 14, border: '1px solid var(--ds-border)', background: 'var(--ds-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24, padding: '0 2px 0 6px' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{`${monAbbr(month)} ${y}`}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {from ? (
            <button type="button" onClick={() => onChange({ from: '', to: '' })} style={{ padding: '2px 8px', border: 0, background: 'none', color: 'rgb(var(--tone-clay-deep))', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Clear
            </button>
          ) : null}
          {navBtn('Previous month', '‹', () => step(-1))}
          {navBtn('Next month', '›', () => step(1))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', rowGap: 2 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} style={{ paddingBottom: 4, textAlign: 'center', color: 'var(--ds-ink-2)', fontSize: 11, fontWeight: 600 }}>{d}</span>
        ))}
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} style={{ height: 40 }} />)}
        {Array.from({ length: len }, (_, i) => {
          const k = isoOf(y, m, i + 1)
          const wd = weekday(k), we = wd === 0 || wd === 6
          const end = k === from || k === to
          const inside = !!from && !!to && k > from && k < to
          const band = from && to && from !== to ? (k === from ? 'in' : k === to ? 'out' : inside ? 'mid' : null) : null
          return (
            <button
              key={k}
              type="button"
              aria-label={shortDay(k)}
              onClick={() => (!from || to || k < from ? onChange({ from: k, to: '' }) : onChange({ from, to: k }))}
              style={{ position: 'relative', height: 40, padding: 0, border: 0, background: 'none', display: 'grid', placeItems: 'center', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <span style={{ position: 'absolute', top: 4, bottom: 4, left: band === 'in' ? '50%' : 0, right: band === 'out' ? '50%' : 0, background: band ? 'rgb(255 236 220)' : 'transparent' }} />
              <span
                style={{
                  position: 'relative',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: end ? 'rgb(233 154 83)' : 'transparent',
                  color: end ? '#fff' : we ? 'var(--ds-ink-3)' : 'var(--ds-ink)',
                  border: k === today && !end ? '1.5px solid var(--ds-ink)' : '0',
                  boxSizing: 'border-box',
                  fontSize: 13,
                  fontWeight: end ? 700 : 500,
                }}
              >
                {i + 1}
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
        {box('From', from ? shortDay(from) : 'Tap a day', !from)}
        {box('To', to ? shortDay(to) : from ? 'Tap a day' : '—', !!from && !to)}
      </div>
    </div>
  )
}

/** Working days (Mon–Fri) in a picked range. */
export function workingDaysIn(from: string, to: string): number {
  if (!from) return 0
  let n = 0
  for (let d = from; d <= (to || from); d = addDays(d, 1)) {
    const w = weekday(d)
    if (w !== 0 && w !== 6) n++
  }
  return n
}
