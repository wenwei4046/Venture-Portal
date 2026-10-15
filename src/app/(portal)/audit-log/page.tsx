import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canSeeAuditChanges } from '@/lib/roles'
import { officeTime } from '@/lib/office-time'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { AUDIT_AREAS, filtersHref, parseChangeFilters, rowLabel } from '@/lib/audit/changes'
import ChangesFilters from './_components/ChangesFilters'
import RecordedTables from './_components/RecordedTables'
import SavesTable from './_components/SavesTable'
import { readAuditChanges } from './_lib/changes-read'

// Audit Log › Changes (2026-10-08) — who changed what, when, before and after,
// across the app (supabase/migrations/20261008190000_app_wide_audit.sql).
// Each reader sees the areas their own permissions open: the database decides,
// table by table and value by value (audit_changes()); this page only asks —
// through `_lib/changes-read`, as the Finance phone app reads it.

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
  const { lines, byTable, overview, rows, more, refs, saves } = await readAuditChanges(supabase, filters)

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
