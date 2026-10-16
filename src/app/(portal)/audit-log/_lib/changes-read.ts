import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { groupSaves, officeDayRange, type AuditChange, type AuditTableLine, type ChangeFilters, type Save } from '@/lib/audit/changes'
import { loadRefLabels } from './ref-labels'

// What Audit Log › Changes reads (2026-10-15, lifted out of its page word for
// word so the Finance phone app reads the very same): the register, the
// summary, and a page of changes as the filters ask — each reader only the
// areas their own permissions open, the database deciding (audit_changes()).
//
// audit_tables / audit_changes / audit_overview postdate database.types.ts —
// untyped-client convention.

export const AUDIT_PAGE = 100

export interface AuditOverview {
  saves_today: number
  changes_week: number
  people_week: number
  last_at: string | null
  actors: Array<{ id: string; name: string }>
}

export interface AuditRead {
  lines: AuditTableLine[]
  byTable: Map<string, AuditTableLine>
  overview: AuditOverview
  /** This page of changes, newest first. */
  rows: AuditChange[]
  /** Older changes stand beyond this page. */
  more: boolean
  refs: Map<string, string>
  saves: Save[]
}

export async function readAuditChanges(supabase: SupabaseClient, filters: ChangeFilters): Promise<AuditRead> {
  const range = officeDayRange(filters.from, filters.to)

  const linesRead = supabase
    .from('audit_tables')
    .select('table_name, label, area, mode, label_columns, reason')
    .then(r => r)
  const overviewRead = supabase.rpc('audit_overview').then(r => r)
  const changesFor = (tables: string[] | null) =>
    supabase
      .rpc('audit_changes', {
        p_tables: tables,
        p_actor: filters.who && filters.who !== 'system' ? filters.who : null,
        p_system: filters.who === 'system',
        p_from: range.from,
        p_to: range.to,
        p_row: filters.row,
        p_before: filters.before,
        p_limit: AUDIT_PAGE + 1,
      })
      .then(r => r)

  // An area filter needs the register to know its tables; anything else
  // reads the changes beside the register.
  const changesNow = filters.area && !filters.table ? null : changesFor(filters.table ? [filters.table] : null)
  const [linesRes, overviewRes] = await Promise.all([linesRead, overviewRead])
  if (linesRes.error) throw new Error(`Could not read the audit register: ${linesRes.error.message}`)
  if (overviewRes.error) throw new Error(`Could not read the audit summary: ${overviewRes.error.message}`)
  const lines = (linesRes.data ?? []) as AuditTableLine[]
  const byTable = new Map(lines.map(l => [l.table_name, l]))
  const changesRes = await (changesNow ??
    changesFor(lines.filter(l => l.area === filters.area).map(l => l.table_name)))
  if (changesRes.error) throw new Error(`Could not read the changes: ${changesRes.error.message}`)

  const all = (changesRes.data ?? []) as AuditChange[]
  const rows = all.slice(0, AUDIT_PAGE)
  const more = all.length > AUDIT_PAGE
  const refs = await loadRefLabels(supabase, rows)
  const saves = groupSaves(rows, byTable, refs)
  const overview = (overviewRes.data ?? { saves_today: 0, changes_week: 0, people_week: 0, last_at: null, actors: [] }) as AuditOverview
  return { lines, byTable, overview, rows, more, refs, saves }
}
