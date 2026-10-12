import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canSeeAuditChanges } from '@/lib/roles'
import { officeTime } from '@/lib/office-time'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import {
  AUDIT_AREAS,
  filtersHref,
  groupSaves,
  officeDayRange,
  parseChangeFilters,
  rowLabel,
  type AuditChange,
  type AuditTableLine,
} from '@/lib/audit/changes'
import ChangesFilters from './_components/ChangesFilters'
import RecordedTables from './_components/RecordedTables'
import SavesTable from './_components/SavesTable'
import { loadRefLabels } from './_lib/ref-labels'

// Audit Log › Changes (2026-10-08) — who changed what, when, before and after,
// across the app (supabase/migrations/20261008190000_app_wide_audit.sql).
// Each reader sees the areas their own permissions open: the database decides,
// table by table and value by value (audit_changes()); this page only asks.
//
// audit_tables / audit_changes / audit_overview postdate database.types.ts —
// untyped-client convention.

const PAGE = 100

interface Overview {
  saves_today: number
  changes_week: number
  people_week: number
  last_at: string | null
  actors: Array<{ id: string; name: string }>
}

export default async function AuditChangesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePage('/audit-log')
  const user = await requireAuth()
  if (!canSeeAuditChanges(user)) redirect('/dashboard')
  const sp = await searchParams

  // The Access log lived at this address until 2026-10-08: an old link to it
  // (its filters were ?resource= and ?page=) still lands there.
  if (sp.resource !== undefined || sp.page !== undefined) {
    const params = new URLSearchParams()
    for (const key of ['resource', 'page'] as const) {
      const v = sp[key]
      if (typeof v === 'string' && v) params.set(key, v)
    }
    const qs = params.toString()
    redirect(`/audit-log/access${qs ? `?${qs}` : ''}`)
  }

  const filters = parseChangeFilters(sp)
  const supabase = (await createClient()) as unknown as SupabaseClient
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
        p_limit: PAGE + 1,
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
  const rows = all.slice(0, PAGE)
  const more = all.length > PAGE
  const refs = await loadRefLabels(supabase, rows)
  const saves = groupSaves(rows, byTable, refs)
  const overview = (overviewRes.data ?? { saves_today: 0, changes_week: 0, people_week: 0, last_at: null, actors: [] }) as Overview

  const areasRead = AUDIT_AREAS.filter(a => lines.some(l => l.area === a && l.mode !== 'none'))
  const rowTable = filters.table ? byTable.get(filters.table) : undefined
  const rowName = filters.row && rows[0] ? rowLabel(rows[0], byTable.get(rows[0].table_name), refs) : null
  const filtered = Boolean(filters.area || filters.table || filters.who || filters.from || filters.to || filters.row)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> ADMIN · AUDIT LOG · CHANGES
          </div>
          <h1 className="page-title">Changes</h1>
        </div>
      </div>

      <StatCards label="The history, in numbers">
        <StatCard
          label="Saves today"
          value={overview.saves_today}
          icon="check"
          tone="primary"
          note={overview.last_at ? `Last ${officeTime(overview.last_at).format('D MMM HH:mm')}` : 'Nothing yet'}
        />
        <StatCard label="Changes · 7 days" value={overview.changes_week} icon="layers" note="Records added, changed or removed" />
        <StatCard label="People · 7 days" value={overview.people_week} icon="people" note="Who changed something you can see" />
        <StatCard
          label="Areas you read"
          value={`${areasRead.length} of ${AUDIT_AREAS.length}`}
          icon="shield"
          note={areasRead.join(' · ') || 'None'}
          href="#recorded"
        />
      </StatCards>

      <ChangesFilters filters={filters} lines={lines} actors={overview.actors} />

      {filters.row ? (
        <div className="sheet-notice">
          Every change to one {rowTable?.label ?? 'record'}
          {rowName ? <> — <strong>{rowName}</strong></> : null}.{' '}
          <Link href={filtersHref(filters, { row: null, table: null, before: null })}>Show every record</Link>
        </div>
      ) : null}

      <div className="sect-head">
        <h2>{filtered ? 'Changes found' : 'Latest changes'}</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {saves.length} {saves.length === 1 ? 'SAVE' : 'SAVES'} · {rows.length} {rows.length === 1 ? 'RECORD' : 'RECORDS'}
        </span>
      </div>

      {saves.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center text-sm">
          {filtered ? 'No change matches these filters.' : 'Nothing has been changed in your areas yet.'}
        </div>
      ) : (
        <SavesTable saves={saves} />
      )}

      {filters.before || more ? (
        <div className="flex items-center justify-center gap-3 mt-6">
          {filters.before ? (
            <Link href={filtersHref(filters, { before: null })} className="bg-surface hover:bg-surface-2 border border-hairline text-sm px-3 py-1 rounded-control">
              ← Newest
            </Link>
          ) : null}
          {more ? (
            <Link
              href={filtersHref(filters, { before: rows[rows.length - 1].id })}
              className="bg-surface hover:bg-surface-2 border border-hairline text-sm px-3 py-1 rounded-control"
            >
              Older →
            </Link>
          ) : null}
        </div>
      ) : null}

      <RecordedTables lines={lines} />
    </div>
  )
}
