import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import JvRowActions from './_components/JvRowActions'

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
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Voucher</th>
              <th>Date</th>
              <th>Description</th>
              <th>Segment</th>
              <th className="right">Amount</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entryList.map((entry) => {
              const lineCount = lineCounts.get(entry.id) ?? 0
              return (
                <tr key={entry.id}>
                  <td>
                    <Link
                      href={`/reconciliation/journal-entries/${entry.id}/edit`}
                      className="font-mono text-[12px] text-accent hover:underline"
                    >
                      {entry.entry_no}
                    </Link>
                    <div className="font-mono text-[11px] text-graphite mt-0.5">
                      {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                    </div>
                  </td>
                  <td className="font-mono text-[12px] text-graphite">
                    {dayjs(entry.transaction_date).format('D MMM YYYY')}
                  </td>
                  <td className="font-serif text-[15px] text-ink">
                    {entry.description}
                  </td>
                  <td className="font-mono text-[11px] uppercase tracking-wide text-graphite">
                    {((entry.segment as string) ?? 'unallocated').replace(/_/g, ' ')}
                  </td>
                  <td className="num">{formatMoney(Number(entry.total_amount))}</td>
                  <td>
                    <JvRowActions id={entry.id} entryNo={entry.entry_no} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
