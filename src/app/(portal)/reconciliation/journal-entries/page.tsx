import Link from 'next/link'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { readJournalList } from './_lib/jv-read'
import JvList, { type JvRow } from './_components/JvList'
import ReturnLink from '@/components/layout/ReturnLink'

export default async function JournalEntriesPage() {
  await requirePage('/reconciliation/journal-entries')
  const user = await requirePermission('reconciliation')
  // A new voucher (or a copy) is raised; Edit and Delete change one (2026-10-08, PR2).
  const canCreate = canDo(user, 'reconciliation', 'create')
  const canEdit = canDo(user, 'reconciliation', 'edit')
  const supabase = await createClient()

  // The vouchers and their line counts (`_lib/jv-read` — the Finance phone app's read too).
  const listed = await readJournalList(supabase)
  const entryList = listed ?? []
  const rows: JvRow[] = entryList

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href="/reconciliation" className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to Reconciliation
        </ReturnLink>
      </div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · MANUAL VOUCHERS
          </div>
          <h1 className="page-title">Journal Entries</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canCreate ? (
            <Link href="/reconciliation/journal-entries/new" className="btn-pri-sheet">
              + New Entry
            </Link>
          ) : null}
        </div>
      </div>

      {entryList.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm font-medium mb-1">
            No manual vouchers yet.
          </p>
          <p className="font-sans text-sm text-muted">
            Record an adjusting entry with the{' '}
            <Link
              href="/reconciliation/journal-entries/new"
              className="text-accent hover:underline"
            >
              + New Entry
            </Link>{' '}
            button above.
          </p>
        </div>
      ) : (
        // Whoever raises vouchers here may also set the list's default arrangement.
        <JvList rows={rows} canCreate={canCreate} canEdit={canEdit} canSetDefault={canCreate} />
      )}
    </div>
  )
}
