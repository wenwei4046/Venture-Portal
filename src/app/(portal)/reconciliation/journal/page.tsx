import Link from 'next/link'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { fetchAllRowsAsWritten } from '@/lib/paginate'

export default async function JournalPage() {
  await requirePermission('reconciliation')
  const supabase = await createClient()

  // Fetch recent journal entries with their lines
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('is_reversed', false)
    .order('transaction_date', { ascending: false })
    .limit(50)

  const entryList = entries ?? []

  // Fetch lines for displayed entries — every one (2026-10-08). The longest
  // entry has 19 lines (a manual JV); fifty like it would be 950, and an
  // unranged read stops at PostgREST's 1000 rows without a word. Asked as
  // before while it fits — an entry's lines share one moment, so their order
  // is the one they came in — and paged, `id` breaking those ties, once not.
  const entryIds = entryList.map((e) => e.id)
  const allLines = entryIds.length > 0
    ? await fetchAllRowsAsWritten((page) => {
        const q = supabase
          .from('journal_lines')
          .select('*, chart_of_accounts!inner(name)')
          .in('entry_id', entryIds)
          .order('created_at')
        return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
      }).catch(() => null)
    : []

  const linesByEntry = new Map<string, typeof allLines>()
  for (const line of allLines ?? []) {
    const existing = linesByEntry.get(line.entry_id) ?? []
    existing.push(line)
    linesByEntry.set(line.entry_id, existing)
  }

  // Trial balance summary
  const { data: trialBalance } = await supabase
    .from('trial_balance')
    .select('*')
    .order('account_code')

  const tbRows = trialBalance ?? []
  const tbTotalDebit = tbRows.reduce((sum, r) => sum + Number(r.total_debit), 0)
  const tbTotalCredit = tbRows.reduce((sum, r) => sum + Number(r.total_credit), 0)

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
            <em>I.</em> TREASURY · GENERAL LEDGER
          </div>
          <h1 className="page-title">General Ledger</h1>
        </div>
      </div>

      {/* ── Trial Balance ── */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Trial Balance</h2>

        {tbRows.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No journal entries yet. Entries are created automatically when payments are executed or fund source repayments are recorded.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Code</th>
                  <th className="text-left py-3 pr-4 font-medium">Account</th>
                  <th className="text-left py-3 pr-4 font-medium">Type</th>
                  <th className="text-right py-3 pr-4 font-medium">Debit</th>
                  <th className="text-right py-3 pr-4 font-medium">Credit</th>
                  <th className="text-right py-3 pr-4 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {tbRows.map((row) => (
                  <tr key={`${row.account_code}-${row.period_month}`} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs text-ink">{row.account_code}</td>
                    <td className="py-3 pr-4 font-serif text-sm text-ink">{row.account_name}</td>
                    <td className="py-3 pr-4 font-serif italic text-graphite text-xs">{row.account_type}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                      {Number(row.total_debit) > 0 ? formatMoney(Number(row.total_debit)) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                      {Number(row.total_credit) > 0 ? formatMoney(Number(row.total_credit)) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(Number(row.balance))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td colSpan={3} className="py-3 pr-4 font-serif italic text-ink text-sm">Total</td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {formatMoney(tbTotalDebit)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {formatMoney(tbTotalCredit)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium">
                    <span className={Math.abs(tbTotalDebit - tbTotalCredit) < 0.01 ? 'text-ledger' : 'text-danger'}>
                      {Math.abs(tbTotalDebit - tbTotalCredit) < 0.01 ? 'Balanced' : formatMoney(tbTotalDebit - tbTotalCredit)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── Journal Entries ── */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Recent Journal Entries</h2>

        {entryList.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No journal entries yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entryList.map((entry) => {
              const lines = linesByEntry.get(entry.id) ?? []
              return (
                <div key={entry.id} className="border border-hairline rounded-md bg-surface">
                  {/* Entry header */}
                  <div className="px-5 py-3 border-b border-hairline flex items-baseline justify-between">
                    <div>
                      <span className="font-mono text-xs text-accent">{entry.entry_no}</span>
                      <span className="font-serif text-sm text-ink ml-3">{entry.description}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono tabular font-medium text-ink text-sm">
                        {formatMoney(Number(entry.total_amount))}
                      </span>
                      <span className="font-mono text-xs text-muted ml-3">
                        {dayjs(entry.transaction_date).format('D MMM YYYY')}
                      </span>
                    </div>
                  </div>

                  {/* Lines */}
                  <div className="px-5 py-2">
                    {lines.map((line) => {
                      const acctName = (line as Record<string, unknown>).chart_of_accounts
                        ? ((line as Record<string, unknown>).chart_of_accounts as { name: string }).name
                        : line.account_code
                      return (
                        <div key={line.id} className="flex items-baseline py-1 text-sm">
                          <span className="font-mono text-xs text-muted w-14 shrink-0">{line.account_code}</span>
                          <span className={`font-serif text-graphite flex-1 ${line.debit ? '' : 'pl-8'}`}>
                            {acctName}
                          </span>
                          <span className="font-mono tabular font-medium text-ink w-28 text-right">
                            {line.debit ? formatMoney(Number(line.debit)) : ''}
                          </span>
                          <span className="font-mono tabular font-medium text-ink w-28 text-right">
                            {line.credit ? formatMoney(Number(line.credit)) : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Reference */}
                  {entry.reference_type ? (
                    <div className="px-5 py-2 border-t border-hairline">
                      <span className="font-mono text-xs text-muted">
                        Ref: {entry.reference_type} · {entry.reference_id?.substring(0, 8)}…
                      </span>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
