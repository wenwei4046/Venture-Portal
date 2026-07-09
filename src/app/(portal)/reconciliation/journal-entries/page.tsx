import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import JvList, { type JvRow } from './_components/JvList'

export default async function JournalEntriesPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  // Manual journal vouchers only (auto-posted entries live on the read-only GL
  // page). Reversed vouchers are hidden from the editable list.
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('reference_type', 'manual_jv')
    .eq('is_reversed', false)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  const entryList = entries ?? []

  // Line COUNTS only — the previous `chart_of_accounts!inner` embed errored
  // silently, so every row showed "0 lines". The list never displays line
  // detail, so a bare entry_id select is all that's needed.
  const entryIds = entryList.map((e) => e.id)
  const { data: allLines } =
    entryIds.length > 0
      ? await supabase
          .from('journal_lines')
          .select('entry_id')
          .in('entry_id', entryIds)
      : { data: null }

  const lineCounts = new Map<string, number>()
  for (const line of allLines ?? []) {
    lineCounts.set(line.entry_id, (lineCounts.get(line.entry_id) ?? 0) + 1)
  }

  const rows: JvRow[] = entryList.map((e) => ({
    id: e.id,
    entry_no: e.entry_no ?? '',
    transaction_date: e.transaction_date,
    description: e.description,
    segment: (e.segment as string | null) ?? null,
    total_amount: Number(e.total_amount),
    lineCount: lineCounts.get(e.id) ?? 0,
  }))

  return (
    <div>
      <Link
        href="/reconciliation"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Reconciliation
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · MANUAL VOUCHERS
          </div>
          <h1 className="page-title">Journal Entries</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Manual journal vouchers. <em>Debits must equal credits.</em>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/reconciliation/journal-entries/new"
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            + New Entry
          </Link>
        </div>
      </div>

      {entryList.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-graphite text-lg mb-1">
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
        <JvList rows={rows} />
      )}
    </div>
  )
}
