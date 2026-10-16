/**
 * The app-wide history read back as sentences (2026-10-08, Audit Log › Changes).
 *
 * `audit_events` keeps every row people change through the portal — who, when,
 * the row before and after — written by the trigger `audit_row_change()` as
 * `audit_tables` says (supabase/migrations/20261008190000_app_wide_audit.sql).
 * The page reads it through `audit_changes()`, which already left out what the
 * reader's permissions do not open and blanked the salary / NRIC / bank values
 * their title may not see (`masked` names those columns). This turns those rows
 * into what the page lists: one entry per save (one database transaction),
 * each record it touched, and each field it changed, before → after.
 * Pure, so the wording is tested without a database.
 */

import { officeTime } from '@/lib/office-time'
import { formatMoneyBare } from '@/lib/utils'
import { refKey, refKindOf } from './refs'

export const AUDIT_AREAS = [
  'Treasury', 'Payments', 'Billing', 'Pools', 'Accounting', 'Payroll',
  'Directors', 'People', 'Revenue', 'Catalogue', 'Member services', 'Settings',
] as const
export type AuditArea = (typeof AUDIT_AREAS)[number]

export type AuditMode = 'all' | 'people' | 'none'

/** A line of `audit_tables`, as the page reads it. */
export interface AuditTableLine {
  table_name: string
  label: string
  area: AuditArea
  mode: AuditMode
  label_columns: string[]
  reason: string | null
}

/** A row of `audit_changes()`. */
export interface AuditChange {
  id: number
  occurred_at: string
  actor_id: string | null
  actor_name: string | null
  actor_source: 'portal' | 'server' | 'database' | null
  table_name: string
  row_key: string | null
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
  changed: string[] | null
  masked: string[] | null
  txid: number
}

/** Names for the ids rows carry, keyed `${kind}:${id}` (refs.ts). */
export type RefLabels = ReadonlyMap<string, string>

export type ChangeAction = 'Added' | 'Changed' | 'Removed'

export interface FieldLine {
  key: string
  label: string
  /** What it was (Changed, Removed). */
  before?: string
  /** What it became (Changed, Added). */
  after?: string
  /** The reader's title may not see this value. */
  hidden?: boolean
}

export interface DescribedChange {
  id: number
  tableName: string
  /** What the page calls the table ("Payroll"). */
  table: string
  action: ChangeAction
  /** Which row, in words ("HV010 · TAN AH KOW · Sep 2026"). */
  rowLabel: string
  rowKey: string | null
  /** Changed: what changed. Added / Removed: what the row held. */
  fields: FieldLine[]
  /** Added / Removed: how many of the row's values the reader may not see. */
  hiddenValues: number
}

/** One save — one database transaction: who, when, every record it touched. */
export interface Save {
  txid: number
  at: string
  who: string
  /** How it was made when nobody signed in made it. */
  via: string | null
  changes: DescribedChange[]
}

const ACTION: Record<AuditChange['op'], ChangeAction> = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Removed' }

/** Columns that say nothing about a row a person added or removed. */
const QUIET = new Set(['id', 'created_at', 'updated_at', 'updated_by', 'created_by', 'version'])

const WORDS: Record<string, string> = {
  id: 'ID', epf: 'EPF', socso: 'SOCSO', eis: 'EIS', pcb: 'PCB', er: 'ER', ee: 'EE', nric: 'NRIC', kpi: 'KPI',
  ctc: 'CTC', gl: 'GL', erp: 'ERP', sst: 'SST', ar: 'AR', hv: 'HV', ot: 'OT', url: 'URL', pv: 'PV', ba: 'BA',
  hc: 'HC', skbbk: 'SKBBK', coa: 'COA', vp: 'VP', pct: '%',
}

/** `basic_salary` → "Basic salary", `epf_er` → "EPF ER", `company_id` → "Company". */
export function fieldLabel(key: string): string {
  const parts = key.replace(/^is_/, '').replace(/_id$/, '').split('_').filter(Boolean)
  if (parts.length === 0) return key
  const words = parts.map((p, i) => (p === 'no' && i === parts.length - 1 ? 'no.' : WORDS[p] ?? p))
  const first = words[0]
  words[0] = first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first
  return words.join(' ')
}

const RATE = /(^|_)(rate|pct|percent|ratio|multiplier|divisor|weight|weightage)($|_)/
const COUNT = /(^|_)(qty|days|hours|count|heads|headcount|limit|rank|order|sort|depth|months|pax|spots|weeks|version|no)($|_)/
const MONEY = /(salary|gross|net|total|balance|price|cost|principal|allowance|commission|incentive|bonus|payout|saving|deduction|skbbk|withholding_tax|threshold|ctc|basic|kpi|pcb|revenue|opening|closing|_cap|_bk$|^epf|^socso|^eis|epf_|socso_|eis_|_er$|_ee$)/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MOMENT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const clip = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function dateText(key: string, iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const month = MONTHS[m - 1] ?? String(m)
  // A month column holds the 1st; say the month.
  return /(^|_)(period|month)($|_)/.test(key) && d === 1 ? `${month} ${y}` : `${d} ${month} ${y}`
}

/** A saved value as a reader should see it. */
export function formatValue(table: string, key: string, value: unknown, refs: RefLabels): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    // A rate keeps every decimal it has; an amount is money; a count is a count.
    if (RATE.test(key)) return String(value)
    if (/amount/.test(key) || (MONEY.test(key) && !COUNT.test(key))) return formatMoneyBare(value)
    return String(value)
  }
  if (typeof value === 'string') {
    if (UUID.test(value)) {
      const kind = refKindOf(table, key)
      const name = kind ? refs.get(refKey(kind, value)) : undefined
      return name ?? `#${value.slice(0, 8)}`
    }
    if (DATE.test(value)) return dateText(key, value)
    if (MOMENT.test(value)) return officeTime(value).format('D MMM YYYY HH:mm')
    return clip(value)
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '—' : clip(value.map(v => formatValue(table, key, v, refs)).join(', '))
  }
  return clip(JSON.stringify(value))
}

/** Which row a change is about, in words — from the register's label columns. */
export function rowLabel(change: AuditChange, line: AuditTableLine | undefined, refs: RefLabels): string {
  const row = change.new_row ?? change.old_row ?? {}
  const parts = (line?.label_columns ?? [])
    .map(column => formatValue(change.table_name, column, row[column], refs))
    .filter(v => v !== '—')
  if (parts.length > 0) return parts.join(' · ')
  const key = change.row_key ?? ''
  return UUID.test(key) ? `#${key.slice(0, 8)}` : key || 'A row'
}

/** One record a save touched, told field by field. */
export function describeChange(change: AuditChange, line: AuditTableLine | undefined, refs: RefLabels): DescribedChange {
  const action = ACTION[change.op]
  const masked = new Set(change.masked ?? [])
  const fmt = (key: string, v: unknown) => formatValue(change.table_name, key, v, refs)
  let fields: FieldLine[]
  let hiddenValues = 0
  if (change.op === 'UPDATE') {
    fields = (change.changed ?? []).map(key =>
      masked.has(key)
        ? { key, label: fieldLabel(key), hidden: true }
        : { key, label: fieldLabel(key), before: fmt(key, change.old_row?.[key]), after: fmt(key, change.new_row?.[key]) })
  } else {
    const row = (change.op === 'INSERT' ? change.new_row : change.old_row) ?? {}
    const first = line?.label_columns ?? []
    const keys = Object.keys(row)
      .filter(k => !QUIET.has(k) && row[k] !== null && row[k] !== '' && !(Array.isArray(row[k]) && (row[k] as unknown[]).length === 0))
      .sort((a, b) => {
        const ia = first.indexOf(a)
        const ib = first.indexOf(b)
        if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
        return a.localeCompare(b)
      })
    fields = keys.map(key =>
      change.op === 'INSERT'
        ? { key, label: fieldLabel(key), after: fmt(key, row[key]) }
        : { key, label: fieldLabel(key), before: fmt(key, row[key]) })
    hiddenValues = masked.size
  }
  return {
    id: change.id,
    tableName: change.table_name,
    table: line?.label ?? change.table_name,
    action,
    rowLabel: rowLabel(change, line, refs),
    rowKey: change.row_key,
    fields,
    hiddenValues,
  }
}

/** Who made a change, and how when it was not a person signed in. */
export function whoOf(change: Pick<AuditChange, 'actor_id' | 'actor_name' | 'actor_source'>): { who: string; via: string | null } {
  if (change.actor_id) {
    return { who: change.actor_name ?? 'Removed account', via: change.actor_source === 'server' ? 'through the server' : null }
  }
  if (change.actor_source === 'server') return { who: 'System', via: 'ERP feed or server job' }
  if (change.actor_source === 'database') return { who: 'System', via: 'database (a migration)' }
  return { who: 'System', via: null }
}

/**
 * Rows newest first → one save per database transaction, in the same order,
 * each save's records in the order they were written.
 */
export function groupSaves(rows: readonly AuditChange[], lines: ReadonlyMap<string, AuditTableLine>, refs: RefLabels): Save[] {
  const saves: Save[] = []
  const byTx = new Map<number, { save: Save; rows: AuditChange[] }>()
  for (const row of rows) {
    let group = byTx.get(row.txid)
    if (!group) {
      const { who, via } = whoOf(row)
      group = { save: { txid: row.txid, at: row.occurred_at, who, via, changes: [] }, rows: [] }
      byTx.set(row.txid, group)
      saves.push(group.save)
    }
    group.rows.push(row)
  }
  for (const { save, rows: group } of byTx.values()) {
    save.changes = [...group].sort((a, b) => a.id - b.id).map(r => describeChange(r, lines.get(r.table_name), refs))
  }
  return saves
}

export interface ChangeFilters {
  area: AuditArea | null
  table: string | null
  /** A person's id, or 'system' for what nobody signed in did. */
  who: string | null
  from: string | null
  to: string | null
  row: string | null
  before: number | null
}

const one = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : null
}

/** The Changes page's query string, checked: anything malformed is dropped. */
export function parseChangeFilters(sp: Record<string, string | string[] | undefined>): ChangeFilters {
  const area = one(sp.area)
  const table = one(sp.table)
  const who = one(sp.who)
  const from = one(sp.from)
  const to = one(sp.to)
  const before = one(sp.before)
  return {
    area: area && (AUDIT_AREAS as readonly string[]).includes(area) ? (area as AuditArea) : null,
    table: table && /^[a-z_][a-z0-9_]*$/.test(table) ? table : null,
    who: who && (who === 'system' || UUID.test(who)) ? who : null,
    from: from && DATE.test(from) ? from : null,
    to: to && DATE.test(to) ? to : null,
    row: one(sp.row),
    before: before && /^\d+$/.test(before) ? Number(before) : null,
  }
}

/** The office's day as a range of moments: from its first instant, to the next day's. */
export function officeDayRange(from: string | null, to: string | null): { from: string | null; to: string | null } {
  return {
    from: from ? `${from}T00:00:00+08:00` : null,
    to: to ? officeTime(`${to}T00:00:00+08:00`).add(1, 'day').format('YYYY-MM-DDTHH:mm:ssZ') : null,
  }
}

/** The query string for the same filters with some changed (null removes one). */
export function filtersHref(filters: ChangeFilters, change: Partial<Record<keyof ChangeFilters, string | number | null>>): string {
  const merged: Record<string, string | number | null> = { ...filters, ...change }
  const params = new URLSearchParams()
  for (const key of ['area', 'table', 'who', 'from', 'to', 'row', 'before'] as const) {
    const v = merged[key]
    if (v !== null && v !== undefined && v !== '') params.set(key, String(v))
  }
  const qs = params.toString()
  return qs ? `/audit-log?${qs}` : '/audit-log'
}
