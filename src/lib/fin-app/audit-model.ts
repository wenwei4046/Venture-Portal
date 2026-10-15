// Profile › Admin › Audit Log in the Finance phone app (2026-10-15, part E3 —
// a page the design does not draw, in its style): Audit Log › Changes as the
// desktop page reads it (`readAuditChanges`) — today's saves as the headline,
// this week's changes in a word, then *Latest changes* (each save a line by
// the office's day, its records and fields its own screen, a record's whole
// history a press away) and *Areas you read* (what the history keeps, by
// area). The desktop's filters are a query the page keeps. Pure.

import { officeTime } from '@/lib/office-time'
import { AUDIT_AREAS, type AuditMode, type AuditTableLine, type ChangeFilters, type DescribedChange, type Save } from '@/lib/audit/changes'
import { dayWords, plural, type PageGroup, type PageLine, type PageModel } from './page-model'

export const AUDIT_HREF = '/fin-app/page/audit'

const KEYS = ['area', 'table', 'who', 'from', 'to', 'row', 'before'] as const

/** The filters as the address keeps them (the desktop's query, its names). */
export function auditKeep(filters: ChangeFilters, change: Partial<Record<keyof ChangeFilters, string | number | null>> = {}): string {
  const merged: Record<string, string | number | null> = { ...filters, ...change }
  const q = new URLSearchParams()
  for (const key of KEYS) {
    const v = merged[key]
    if (v !== null && v !== undefined && v !== '') q.set(key, String(v))
  }
  return q.toString()
}

/** Where a list of the changes these filters find opens. */
export const auditListHref = (keep: string) => `${AUDIT_HREF}?${keep ? `${keep}&` : ''}f=saves`

const NO_FILTERS: ChangeFilters = { area: null, table: null, who: null, from: null, to: null, row: null, before: null }

const KEPT: Record<AuditMode, string> = { all: 'Every change', people: 'People’s changes only', none: 'Not recorded' }

/** What a field became, or held, or was. */
function fieldLines(c: DescribedChange): PageLine[] {
  const out: PageLine[] = c.fields.map((f) => {
    if (c.action === 'Changed') {
      return f.hidden
        ? { key: f.key, label: f.label, sub: 'Changed — hidden from your title', tone: 'muted' as const }
        : { key: f.key, label: f.label, sub: `${f.before ?? '—'} → ${f.after ?? '—'}` }
    }
    return c.action === 'Added' ? { key: f.key, label: f.label, sub: f.after ?? '—' } : { key: f.key, label: f.label, sub: f.before ?? '—', tone: 'muted' as const }
  })
  if (c.hiddenValues > 0) {
    out.push({ key: 'hidden', label: `${plural(c.hiddenValues, 'value', 'values')} hidden from your title`, sub: 'Salary, NRIC or bank', tone: 'muted' })
  }
  return out
}

const time = (at: string) => officeTime(at).format('HH:mm')

function saveLine(save: Save): PageLine {
  const first = save.changes[0]
  const others = save.changes.length - 1
  const what = first ? `${first.action}${others > 0 ? ` · ${plural(others + 1, 'record', 'records')}` : ''}` : 'Saved'
  return {
    key: `${save.txid}-${first?.id ?? 0}`,
    label: first ? `${first.table} · ${first.rowLabel}` : 'A save',
    sub: `${what} · ${save.who}${save.via ? ` · ${save.via}` : ''}`,
    value: time(save.at),
    detail: {
      title: `${save.who} · ${officeTime(save.at).format('D MMM HH:mm')}`,
      groups: save.changes.map((c) => ({
        key: String(c.id),
        title: `${c.action} · ${c.table}`,
        count: plural(c.fields.length, 'field', 'fields'),
        lines: [
          {
            key: 'row',
            label: c.rowLabel,
            open: c.rowKey ? { href: auditListHref(auditKeep(NO_FILTERS, { table: c.tableName, row: c.rowKey })), label: 'History' } : null,
          },
          ...fieldLines(c),
        ],
      })),
    },
  }
}

export interface AuditModelInput {
  overview: { saves_today: number; changes_week: number; people_week: number; last_at: string | null }
  saves: Save[]
  /** Records on this page. */
  records: number
  lines: AuditTableLine[]
  filters: ChangeFilters
  /** One record's history: what it is called. */
  rowName: string | null
  /** The filters in words (`auditFilterWords`). */
  filterWords: string
}

export function auditModel({ overview, saves, records, lines, filters, rowName, filterWords }: AuditModelInput): PageModel {
  const filtered = Boolean(filters.area || filters.table || filters.who || filters.from || filters.to || filters.row)
  const byTable = new Map(lines.map((l) => [l.table_name, l]))
  const areasRead = AUDIT_AREAS.filter((a) => lines.some((l) => l.area === a && l.mode !== 'none'))

  // The saves by the office's day, newest first (the read's order).
  const days: PageGroup[] = []
  for (const save of saves) {
    const day = officeTime(save.at).format('YYYY-MM-DD')
    let g = days.find((x) => x.key === day)
    if (!g) {
      g = { key: day, title: dayWords(day), count: '', lines: [] }
      days.push(g)
    }
    g.lines.push(saveLine(save))
  }
  for (const g of days) g.count = plural(g.lines.length, 'save', 'saves')

  const rowTable = filters.table ? byTable.get(filters.table) : undefined
  const savesLabel = filters.row ? `History · ${rowName ?? rowTable?.label ?? 'one record'}` : filtered ? 'Changes found' : 'Latest changes'
  const ordered = [...lines].sort((a, b) => AUDIT_AREAS.indexOf(a.area) - AUDIT_AREAS.indexOf(b.area) || a.label.localeCompare(b.label))
  const areaGroups: PageGroup[] = AUDIT_AREAS.filter((a) => ordered.some((l) => l.area === a)).map((a) => {
    const of = ordered.filter((l) => l.area === a)
    return {
      key: a,
      title: a,
      count: plural(of.filter((l) => l.mode !== 'none').length, 'record', 'records'),
      lines: of.map((l) => ({
        key: l.table_name,
        label: l.label,
        sub: l.mode === 'none' && l.reason ? `${KEPT.none} — ${l.reason}` : KEPT[l.mode],
        tone: l.mode === 'none' ? ('muted' as const) : null,
        open: l.mode === 'none' ? null : { href: auditListHref(auditKeep(NO_FILTERS, { table: l.table_name })), label: 'Changes' },
      })),
    }
  })

  return {
    hero: {
      value: String(overview.saves_today),
      label: `Saves today · ${overview.last_at ? `last ${officeTime(overview.last_at).format('D MMM HH:mm')}` : 'nothing yet'}`,
    },
    chip: `${plural(overview.changes_week, 'change', 'changes')} · ${plural(overview.people_week, 'person', 'people')} · 7 days`,
    eyebrow: 'Admin · Audit Log',
    cards: [
      {
        key: 'saves',
        tone: 'all',
        icon: 'report',
        label: savesLabel,
        sub: filters.row ? `Every change to one ${rowTable?.label ?? 'record'}` : [filterWords, plural(records, 'record', 'records')].filter(Boolean).join(' · '),
        value: plural(saves.length, 'save', 'saves'),
        groups: days.length > 0 ? days : [{ key: 'none', title: savesLabel, count: '0', lines: [], empty: filtered ? 'No change matches these filters.' : 'Nothing has been changed in your areas yet.' }],
      },
      {
        key: 'areas',
        tone: 'company',
        icon: 'tree',
        label: 'Areas you read',
        sub: areasRead.length > 4 ? `${areasRead.slice(0, 3).join(' · ')} · +${areasRead.length - 3} more` : areasRead.join(' · ') || 'None',
        value: `${areasRead.length} of ${AUDIT_AREAS.length}`,
        groups: areaGroups.length > 0 ? areaGroups : [{ key: 'none', title: 'Areas you read', count: '0', lines: [], empty: 'No area of the history is open to you.' }],
      },
    ],
  }
}

/** The filters in words, for the Filter sheet's button and the list's eyebrow ("Payroll · Carrie · from 1 Oct"). */
export function auditFilterWords(filters: ChangeFilters, lines: AuditTableLine[], actors: Array<{ id: string; name: string }>): string {
  const parts: string[] = []
  if (filters.area) parts.push(filters.area)
  if (filters.table) parts.push(lines.find((l) => l.table_name === filters.table)?.label ?? filters.table)
  if (filters.who) parts.push(filters.who === 'system' ? 'System' : actors.find((a) => a.id === filters.who)?.name ?? 'One person')
  if (filters.from) parts.push(`from ${dayWords(filters.from)}`)
  if (filters.to) parts.push(`to ${dayWords(filters.to)}`)
  return parts.join(' · ')
}
