import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canSeeAuditChanges } from '@/lib/roles'
import { officeToday } from '@/lib/office-time'
import { parseChangeFilters, rowLabel } from '@/lib/audit/changes'
import { readAuditChanges } from '@/app/(portal)/audit-log/_lib/changes-read'
import { auditFilterWords, auditKeep, auditModel } from '@/lib/fin-app/audit-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import AuditApp from '@/components/fin-app/AuditApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/audit` — Profile › Admin › Audit Log in the Finance phone app
 * (2026-10-15, part E3): Audit Log › Changes' own gates (its tabs, a reader of
 * the history), the very page of changes the desktop reads (`readAuditChanges`
 * — each reader only the areas their own permissions open) under the desktop's
 * filters (`?area=&table=&who=&from=&to=&row=&before=`).
 */
export default async function FinAppAudit({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/audit-log')
  const user = await requireAuth()
  if (!canSeeAuditChanges(user)) redirect('/fin-app/profile')
  const sp = await searchParams
  const filters = parseChangeFilters(sp)
  const supabase = (await createClient()) as unknown as SupabaseClient
  const read = await readAuditChanges(supabase, filters)
  const first = read.rows[0]
  const rowName = filters.row && first ? rowLabel(first, read.byTable.get(first.table_name), read.refs) : null
  const model = auditModel({
    overview: read.overview,
    saves: read.saves,
    records: read.rows.length,
    lines: read.lines,
    filters,
    rowName,
    filterWords: auditFilterWords(filters, read.lines, read.overview.actors),
  })
  // Another filter (a record's history, Older, the Filter sheet) is another list: drawn afresh at its own step.
  return (
    <AuditApp
      key={auditKeep(filters)}
      model={model}
      search={searchOf(sp)}
      filters={filters}
      lines={read.lines}
      actors={read.overview.actors}
      today={officeToday()}
      olderBefore={read.more && read.rows.length > 0 ? read.rows[read.rows.length - 1].id : null}
    />
  )
}
