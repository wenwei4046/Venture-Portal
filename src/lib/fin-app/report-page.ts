import { REPORT_SEGMENTS } from '@/app/(portal)/reports/_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'

// What every Report hub page of the Finance phone app reads off its address
// (2026-10-15): the query as the server saw it (a refresh, a link), the month
// asked (`?m=YYYY-MM` — never past the office's; none = the office's own), the
// segment asked (`?s=`), and the GL statements' segment choices.

export type SearchParams = Record<string, string | string[] | undefined>

export function searchOf(sp: SearchParams): string {
  return new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
}

export function askedMonth(sp: SearchParams, thisMonth: string): string {
  const m = typeof sp.m === 'string' ? sp.m : ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= thisMonth ? m : thisMonth
}

export function askedSegment(sp: SearchParams): string {
  return typeof sp.s === 'string' ? sp.s : ''
}

/** The GL statements' segments (the desktop pages' picker): all, each department, and the registry's own. */
export function segmentOptions(): Array<{ value: string; label: string }> {
  return [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())].map((o) => ({ value: o.value, label: o.label }))
}

/** A report's files, as the desktop page links them. */
export function reportFiles(base: string, query: Record<string, string>, extra: Array<{ key: string; label: string; query: Record<string, string> }> = []) {
  const href = (format: 'pdf' | 'xlsx', more: Record<string, string> = {}) => {
    const all: Record<string, string> = { format, ...query, ...more }
    return `${base}?${new URLSearchParams(Object.entries(all).filter(([, v]) => v !== '')).toString()}`
  }
  return [
    { key: 'pdf', label: 'Export PDF', href: href('pdf'), format: 'pdf' as const },
    { key: 'xlsx', label: 'Export Excel', href: href('xlsx'), format: 'xlsx' as const },
    ...extra.flatMap((e) => [
      { key: `${e.key}-pdf`, label: `${e.label} PDF`, href: href('pdf', e.query), format: 'pdf' as const },
      { key: `${e.key}-xlsx`, label: `${e.label} Excel`, href: href('xlsx', e.query), format: 'xlsx' as const },
    ]),
  ]
}
