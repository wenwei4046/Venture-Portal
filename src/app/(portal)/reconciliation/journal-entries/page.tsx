import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsAsWritten } from '@/lib/paginate'
import JvList, { type JvRow } from './_components/JvList'

export default async function JournalEntriesPage() {
  await requirePermission('reconciliation')
  const supabase = await createClient()

  // Manual journal vouchers + the auto payroll accrual JVs (user 2026-08-07:
  // "为什么我看没有的" — the auto ones must show HERE where Finance reviews
  // salary JVs; they render read-only with an AUTO badge). Reversed vouchers
  // stay hidden.
  //
  // Every one of them, and every line (2026-10-08): both reads are whole
  // history, and PostgREST stops an unranged read at 1000 rows without a word.
  // The lines had passed it (1,887 on 2026-10-08), so every voucher whose
  // lines fell past the first 1000 showed too few — or "0 lines". The list
  // keeps its own order while it fits (fetchAllRowsAsWritten: two vouchers of
  // one date and moment tie); the counts only need every line. A failed read
  // still shows none, as before.
  const entries = await fetchAllRowsAsWritten((page) => {
    const q = supabase
      .from('journal_entries')
      .select('*')
      .in('reference_type', ['manual_jv', 'payroll_accrual'])
      .eq('is_reversed', false)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
    return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
  }).catch(() => null)

  const entryList = entries ?? []

  // Line COUNTS only — the previous `chart_of_accounts!inner` embed errored
  // silently, so every row showed "0 lines". Filtered through the JE join
  // instead of .in('entry_id', ids) — a long id list in the URL 400s once
  // the JV history grows (the 2026-08-13 Ledger failure class).
  const allLines = await fetchAllRows((lo, hi) =>
    supabase
      .from('journal_lines')
      .select('entry_id, journal_entries!inner(reference_type, is_reversed)')
      .in('journal_entries.reference_type', ['manual_jv', 'payroll_accrual'])
      .eq('journal_entries.is_reversed', false)
      .order('id', { ascending: true })
      .range(lo, hi),
  ).catch(() => null)

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
    auto: e.reference_type === 'payroll_accrual',
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
