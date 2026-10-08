/**
 * The history of who may do what (2026-10-08), read back as sentences.
 *
 * `audit_events` keeps every row change to the permission tables, the titles
 * and the accounts — who, when, before, after — written by the trigger
 * `audit_row_change()`, one database transaction per save (user: 所有步骤其实都
 * 要有 audit history … 谁按错、谁加了什么、谁改了什么). This turns those rows
 * into what the Permissions tab lists: one entry per save, a line per change.
 * Pure, so the wording is tested without a database.
 */

import { ACTIONS, CELL_LABEL, SENSITIVE_FIELDS, type Cell } from '@/lib/permission-matrix'

/** One row of `permission_history()`. */
export interface AuditRow {
  id: number
  occurred_at: string
  actor_name: string | null
  table_name: string
  row_key: string | null
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
  changed: string[] | null
  txid: number
}

export interface HistoryLookups {
  /** template id → name, for templates that still exist. */
  templates: ReadonlyMap<string, string>
  /** function key → label. */
  functions: ReadonlyMap<string, string>
  /** title id → name. */
  titles: ReadonlyMap<string, string>
  /** user id → the person's name. */
  people: ReadonlyMap<string, string>
}

/** One save: who, when, and every line it changed. */
export interface HistoryEntry {
  txid: number
  at: string
  actor: string
  lines: string[]
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

function cellText(scope: unknown): string {
  return typeof scope === 'string' && scope in CELL_LABEL ? CELL_LABEL[scope as Cell] : '✕'
}

function actionLabel(action: unknown): string {
  return ACTIONS.find(a => a.key === action)?.label ?? String(action)
}

function fieldLabel(field: unknown): string {
  return SENSITIVE_FIELDS.find(f => f.key === field)?.label ?? String(field)
}

function describe(row: AuditRow, look: HistoryLookups): string[] {
  const now = row.new_row ?? {}
  const was = row.old_row ?? {}
  const any = { ...was, ...now }
  const templateName = (id: unknown): string =>
    (typeof id === 'string' ? look.templates.get(id) : undefined) ?? 'A removed template'
  const titleName = (id: unknown): string => (typeof id === 'string' ? look.titles.get(id) : undefined) ?? 'A removed title'
  const personName = (id: unknown): string => (typeof id === 'string' ? look.people.get(id) : undefined) ?? 'Somebody'
  const fnLabel = (key: unknown): string => (typeof key === 'string' ? look.functions.get(key) : undefined) ?? String(key)
  const changed = (col: string) => row.changed?.includes(col) ?? false

  switch (row.table_name) {
    case 'permission_templates': {
      const name = str(any.name) ?? 'A template'
      if (row.op === 'INSERT') return [`New template “${name}”`]
      if (row.op === 'DELETE') return [`Template “${name}” removed`]
      const lines: string[] = []
      if (changed('name')) lines.push(`Template “${str(was.name)}” renamed “${str(now.name)}”`)
      if (changed('description')) lines.push(`${name}: description changed`)
      if (changed('base_role')) lines.push(`${name}: account kind ${str(was.base_role)} → ${str(now.base_role)}`)
      return lines.length > 0 ? lines : [`${name}: changed`]
    }
    case 'permission_template_grants': {
      const where = `${templateName(any.template_id)}: ${fnLabel(any.function_key)} · ${actionLabel(any.action)}`
      if (row.op === 'INSERT') return [`${where} → ${cellText(now.scope)}`]
      if (row.op === 'DELETE') return [`${where} ${cellText(was.scope)} → ·`]
      return [`${where} ${cellText(was.scope)} → ${cellText(now.scope)}`]
    }
    case 'permission_template_sensitive': {
      const tpl = templateName(any.template_id)
      return row.op === 'DELETE'
        ? [`${tpl}: ${fieldLabel(was.field)} hidden again`]
        : [`${tpl}: sees ${fieldLabel(now.field)}`]
    }
    case 'user_permission_cells': {
      const where = `${personName(any.user_id)}: ${fnLabel(any.function_key)} · ${actionLabel(any.action)}`
      if (row.op === 'DELETE') return [`${where} back to their template`]
      return [`${where} → ${cellText(now.scope)} for them alone`]
    }
    case 'titles': {
      const name = str(any.name) ?? 'A title'
      if (row.op === 'INSERT') return [`New title “${name}”`]
      if (row.op === 'DELETE') return [`Title “${name}” removed`]
      const lines: string[] = []
      if (changed('template_id')) {
        const from = was.template_id ? templateName(was.template_id) : 'no template'
        const to = now.template_id ? templateName(now.template_id) : 'no template'
        lines.push(`${name}: template ${from} → ${to}`)
      }
      if (changed('name')) lines.push(`Title “${str(was.name)}” renamed “${str(now.name)}”`)
      if (changed('is_active')) lines.push(`${name} ${now.is_active ? 'reactivated' : 'deactivated'}`)
      if (changed('department_id')) lines.push(`${name}: department changed`)
      if (changed('is_department_head')) lines.push(`${name} ${now.is_department_head ? 'now heads' : 'no longer heads'} its department`)
      if (changed('level_id')) lines.push(`${name}: level changed`)
      return lines.length > 0 ? lines : [`${name}: changed`]
    }
    case 'users': {
      const name = str(any.name) ?? str(any.email) ?? 'An account'
      if (row.op === 'INSERT') return [`New login for ${name} (${str(now.email) ?? 'no email'})`]
      if (row.op === 'DELETE') return [`Login of ${name} removed`]
      const lines: string[] = []
      if (changed('role')) lines.push(`${name}: account kind ${str(was.role)} → ${str(now.role)}`)
      if (changed('is_active')) lines.push(`${name}: login ${now.is_active ? 'enabled' : 'disabled'}`)
      if (changed('department_id')) lines.push(`${name}: department changed`)
      if (changed('email')) lines.push(`${name}: email ${str(was.email)} → ${str(now.email)}`)
      if (changed('name')) lines.push(`Account “${str(was.name)}” renamed “${str(now.name)}”`)
      return lines.length > 0 ? lines : [`${name}: changed`]
    }
    case 'user_permissions': {
      const who = personName(any.user_id)
      const key = str(any.permission_key) ?? 'a permission'
      if (row.op === 'DELETE') return [`${who}: old exception on ${key} cleared`]
      return [`${who}: old exception — ${key} ${now.granted ? 'granted' : 'denied'}`]
    }
    case 'title_permissions': {
      const title = titleName(any.title_id)
      const key = str(any.permission_key) ?? 'a permission'
      return [`${title}: old permission ${key} ${row.op === 'DELETE' ? 'removed' : 'added'}`]
    }
    default:
      return [`${row.table_name}: ${row.op.toLowerCase()}`]
  }
}

/**
 * Rows newest first → one entry per save (per database transaction), in the
 * same order, its lines in the order the save made them.
 */
export function describeHistory(rows: readonly AuditRow[], look: HistoryLookups): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  const byTx = new Map<number, { entry: HistoryEntry; rows: AuditRow[] }>()
  for (const row of rows) {
    let group = byTx.get(row.txid)
    if (!group) {
      group = { entry: { txid: row.txid, at: row.occurred_at, actor: row.actor_name ?? 'System', lines: [] }, rows: [] }
      byTx.set(row.txid, group)
      entries.push(group.entry)
    }
    group.rows.push(row)
  }
  for (const { entry, rows: group } of byTx.values()) {
    entry.lines = [...group].sort((a, b) => a.id - b.id).flatMap(r => describe(r, look))
  }
  return entries
}
