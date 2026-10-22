'use client'

import { daysInMonth, isoOf, monAbbr, shortDay, weekday } from '@/lib/attendance/engine'

/**
 * The range calendar of Apply for leave and Extra manpower (2026-10-17, the handoff's `rangeCal`): the first tap sets
 * From, the second To (a tap before From starts again); the ends filled with the accent, the band between them soft;
 * today ringed; weekends in ink-3; days before `min` at 40%. Two boxes under it say From and To, the one waiting for a
 * tap outlined in the accent.
 */
export function RangeCalendar({ month, setMonth, from, to, onChange, min, today, labels = ['From', 'To'] }: {
  /** 'YYYY-MM' shown. */
  month: string
  setMonth: (m: string) => void
  from: string
  to: string
  onChange: (r: { from: string; to: string }) => void
  min?: string
  today: string
  labels?: [string, string]
}) {
  const [y, m] = month.split('-').map(Number)
  const first = (weekday(isoOf(y, m, 1)) + 6) % 7
  const len = daysInMonth(isoOf(y, m, 1))
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const tap = (d: string) => (!from || to || d < from ? onChange({ from: d, to: '' }) : onChange({ from, to: d }))
  const head = { paddingBottom: 4, textAlign: 'center' as const, color: 'var(--ds-ink-2)', fontSize: 11, fontWeight: 650 }
  const box = (label: string, day: string, next: boolean) => (
    <span key={label} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderRadius: 12, border: `1px solid ${next ? 'var(--ds-accent)' : 'var(--ds-border)'}`, background: next ? 'var(--ds-accent-soft)' : 'var(--ds-surface-2)' }}>
      <span style={{ color: 'var(--ds-ink-2)', fontSize: 11, fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{day}</span>
    </span>
  )
  return (
    <div role="group" aria-label={labels.join(' and ')} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 10px 10px', borderRadius: 14, border: '1px solid var(--ds-border)', background: 'var(--ds-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24, padding: '0 2px 0 6px' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{monAbbr(isoOf(y, m, 1))} {y}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {from ? (
            <button type="button" onClick={() => onChange({ from: '', to: '' })} style={{ padding: '2px 8px', border: 0, background: 'none', color: 'var(--ds-accent-text)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>Clear</button>
          ) : null}
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" style={{ width: 32, height: 32, border: 0, background: 'none', display: 'grid', placeItems: 'center', color: 'var(--ds-ink)', cursor: 'pointer' }}><span style={{ fontSize: 18, lineHeight: 1 }}>‹</span></button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" style={{ width: 32, height: 32, border: 0, background: 'none', display: 'grid', placeItems: 'center', color: 'var(--ds-ink)', cursor: 'pointer' }}><span style={{ fontSize: 18, lineHeight: 1 }}>›</span></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', rowGap: 2 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <span key={i} style={head}>{l}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} style={{ height: 44 }} />)}
        {Array.from({ length: len }, (_, i) => {
          const d = i + 1
          const k = isoOf(y, m, d)
          const w = weekday(k)
          const wknd = w === 0 || w === 6
          const end = k === from || k === to
          const inside = !!from && !!to && k > from && k < to
          const band = from && to && from !== to ? (k === from ? 'in' : k === to ? 'out' : inside ? 'mid' : null) : null
          const off = !!min && k < min
          return (
            <button key={k} type="button" disabled={off} onClick={() => tap(k)} aria-pressed={end || inside}
              aria-label={`${shortDay(k)}${k === from ? `, ${labels[0].toLowerCase()}` : k === to ? `, ${labels[1].toLowerCase()}` : ''}`}
              style={{ position: 'relative', height: 44, padding: 0, border: 0, background: 'none', display: 'grid', placeItems: 'center', fontFamily: 'inherit', cursor: off ? 'default' : 'pointer', opacity: off ? 0.4 : 1, WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ position: 'absolute', top: 4, bottom: 4, left: band === 'in' ? '50%' : 0, right: band === 'out' ? '50%' : 0, background: band ? 'var(--ds-accent-soft)' : 'transparent' }} />
              <span style={{
                position: 'relative', width: 36, height: 36, borderRadius: '50%', boxSizing: 'border-box', display: 'grid', placeItems: 'center', fontSize: 14.5,
                fontWeight: end ? 800 : 600, fontVariantNumeric: 'tabular-nums', background: end ? 'var(--ds-accent)' : 'transparent',
                color: end ? 'var(--ds-on-accent)' : wknd ? 'var(--ds-ink-3)' : 'var(--ds-ink)', boxShadow: end ? '0 2px 6px rgb(189 74 25 / .18)' : 'none',
                border: k === today && !end ? '1.5px solid var(--ds-ink)' : 0,
              }}>{d}</span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
        {box(labels[0], from ? shortDay(from) : 'Tap a day', !from)}
        {box(labels[1], to ? shortDay(to) : from ? 'Tap a day' : '—', !!from && !to)}
      </div>
    </div>
  )
}
