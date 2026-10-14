import type { AttConfig } from '@/lib/attendance/types'
import type { Tone } from '@/components/ds/Data'

/**
 * How a day's code is drawn (the handoff's `CS` and `STY` maps, "wash" cell
 * style): ink and line for every code, and for the ones that wash a cell its
 * background and its letters. A leave type the handoff does not name is drawn
 * as the company leave types are (slate).
 */

const slate = 'rgb(var(--tone-slate))'
const slateDeep = 'rgb(var(--tone-slate-deep))'

/** [ink, line, label] — the handoff's CS. */
const CS: Record<string, [string, string, string]> = {
  P: ['var(--ds-ink)', 'var(--ds-success)', 'Present'],
  L: ['var(--ds-warning)', 'var(--ds-warning)', 'Late'],
  A: ['var(--ds-danger)', 'var(--ds-danger)', 'Absent'],
  I: ['var(--ds-danger)', 'var(--ds-danger)', 'Incomplete · no OUT'],
  H: ['var(--ds-ink-2)', 'var(--ds-ink-3)', 'Public holiday'],
  CH: ['var(--ds-ink-2)', 'var(--ds-ink-3)', 'Company holiday'],
  SO: ['var(--ds-ink-2)', 'var(--ds-ink-3)', 'Special off'],
  W: ['var(--ds-ink-3)', 'transparent', 'Weekend'],
  '·': ['var(--ds-ink-3)', 'transparent', 'Not in yet'],
  '': ['var(--ds-ink-3)', 'transparent', ''],
}

/** [cell wash, letters] — the handoff's STY in wash mode. */
const WASH: Record<string, [string, string]> = {
  P: ['var(--ds-success-bg)', 'var(--ds-success)'],
  L: ['var(--ds-warning-bg)', 'var(--ds-warning)'],
  A: ['var(--ds-danger-bg)', 'var(--ds-danger)'],
  I: ['var(--ds-danger-bg)', 'var(--ds-danger)'],
  AL: [slate, slateDeep],
  SL: ['var(--ds-info-bg)', 'var(--ds-info)'],
  HL: ['var(--ds-info-bg)', 'var(--ds-info)'],
  UL: ['var(--ds-surface-3)', 'var(--ds-ink-2)'],
  H: ['rgb(var(--tone-gold))', 'rgb(var(--tone-gold-deep))'],
  CH: ['rgb(var(--tone-walnut))', 'rgb(var(--tone-walnut-deep))'],
  SO: ['rgb(var(--tone-olive))', 'rgb(var(--tone-olive-deep))'],
}

export const HATCH = 'repeating-linear-gradient(135deg, rgb(243 243 241) 0 4px, transparent 4px 8px)'

export interface CodeLook {
  /** The letters' colour when the cell is not washed. */
  ink: string
  label: string
  /** Washed: cell background and letters; null = not washed. */
  wash: [string, string] | null
}

export function lookOf(code: string, config: AttConfig): CodeLook {
  const waiting = code.endsWith('?')
  const base = waiting ? code.slice(0, -1) : code
  const lt = config.leaveTypes.find(t => t.code === base)
  if (lt) {
    if (waiting) return { ink: 'var(--ds-ink-3)', label: `${lt.name} · waiting`, wash: ['var(--ds-surface-2)', slateDeep] }
    return { ink: 'var(--ds-ink)', label: lt.name, wash: WASH[base] ?? (lt.unpaid ? WASH.UL : [slate, slateDeep]) }
  }
  const cs = CS[code] ?? CS['']
  return { ink: cs[0], label: cs[2], wash: WASH[code] ?? null }
}

/** The chip tone a day's status takes (the calendar's day panel). */
export function toneOf(code: string, config: AttConfig): Tone {
  if (code === 'P') return 'success'
  if (code === 'L' || code.endsWith('?')) return 'warning'
  if (code === 'A' || code === 'I') return 'danger'
  const lt = config.leaveTypes.find(t => t.code === code)
  if (lt) return lt.unpaid ? 'neutral' : 'info'
  return 'neutral'
}

/** The statuses HR may set on a day (the handoff's bkCodes / edCodes). */
export const SET_CODES: Array<{ value: string; label: string }> = [
  { value: 'P', label: 'P · Present' },
  { value: 'L', label: 'L · Late' },
  { value: 'A', label: 'A · Absent' },
  { value: 'I', label: 'I · Incomplete' },
  { value: 'LV', label: 'Leave…' },
  { value: 'H', label: 'H · Public holiday' },
  { value: 'SO', label: 'SO · Special off' },
  { value: 'W', label: 'W · Off / rest day' },
]

/** A CSV download of rows, built in the browser. */
export function downloadCsv(name: string, rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
