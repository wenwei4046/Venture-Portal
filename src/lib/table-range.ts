// A column filter's second mode (2026-10-09, the Finance revamp): an amount
// or a date column can be narrowed to a range — Min / Max, From / To — with a
// few presets, instead of ticking values one by one. The pure arithmetic is
// here; SortableTable draws the switch and keeps the bounds.

export type RangeKind = 'number' | 'date'

export interface RangeBounds {
  /** As typed: a number, or an ISO day for a date column. Empty = no bound. */
  min: string
  max: string
}

export interface RangePreset extends RangeBounds {
  label: string
}

const DAY = 24 * 60 * 60 * 1000

/** What a column sorts by, as one number: an amount as itself, a date as its time. */
export function rangeNumber(value: unknown, kind: RangeKind): number | null {
  if (value == null || value === '') return null
  if (kind === 'date') {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
    if (typeof value === 'number') return value
    const t = Date.parse(String(value))
    return Number.isNaN(t) ? null : t
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const n = parseFloat(String(value).replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

function bound(text: string, kind: RangeKind, end: boolean): number | null {
  if (!text.trim()) return null
  if (kind === 'date') {
    const t = Date.parse(text)
    if (Number.isNaN(t)) return null
    // A day typed as the To bound covers the whole of that day.
    return end ? t + DAY - 1 : t
  }
  const n = parseFloat(text.replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

/** Does a value sit between the bounds? A blank value never does. */
export function inRange(value: number | null, min: string, max: string, kind: RangeKind = 'number'): boolean {
  if (value == null) return false
  const lo = bound(min, kind, false)
  const hi = bound(max, kind, true)
  if (lo != null && value < lo) return false
  if (hi != null && value > hi) return false
  return true
}

export function hasRange(bounds: RangeBounds | undefined): boolean {
  return !!bounds && (bounds.min.trim() !== '' || bounds.max.trim() !== '')
}

export function amountPresets(): RangePreset[] {
  return [
    { label: '< 1,000', min: '', max: '1000' },
    { label: '1k – 10k', min: '1000', max: '10000' },
    { label: '10k – 100k', min: '10000', max: '100000' },
    { label: '> 100k', min: '100000', max: '' },
  ]
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function datePresets(today: Date = new Date()): RangePreset[] {
  const y = today.getFullYear()
  const m = today.getMonth()
  const weekAgo = new Date(y, m, today.getDate() - 7)
  return [
    { label: 'Last 7 days', min: iso(weekAgo), max: iso(today) },
    { label: 'This month', min: iso(new Date(y, m, 1)), max: iso(new Date(y, m + 1, 0)) },
    { label: 'Last month', min: iso(new Date(y, m - 1, 1)), max: iso(new Date(y, m, 0)) },
    { label: 'This year', min: `${y}-01-01`, max: `${y}-12-31` },
  ]
}
