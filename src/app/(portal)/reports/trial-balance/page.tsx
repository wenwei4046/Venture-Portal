import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchTrialBalance } from '@/lib/cfo-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ as_of?: string; show_zero?: string }>
}

export default async function TrialBalancePage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { as_of: rawAsOf, show_zero: rawShowZero } = await searchParams
  const asOf = rawAsOf ?? dayjs().format('YYYY-MM-DD')
  const showZeroBalance = rawShowZero === '1'

  const tb = await fetchTrialBalance(supabase, { asOf, showZeroBalance })
  const dateLabel = dayjs(asOf).format('D MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · TRIAL BALANCE · {dateLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Trial Balance</h1>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <form className="flex items-center gap-3">
            <input
              type="date"
              name="as_of"
              defaultValue={asOf}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            />
            <label className="flex items-center gap-2 text-sm font-serif italic text-graphite">
              <input
                type="checkbox"
                name="show_zero"
                value="1"
                defaultChecked={showZeroBalance}
              />
              Show zero-balance
            </label>
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-serif italic text-sm rounded-md transition-colors"
            >
              Apply
            </button>
          </form>
          <Link
            href={`/reports/trial-balance/export?format=xlsx&as_of=${asOf}${showZeroBalance ? '&show_zero=1' : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href={`/reports/trial-balance/export?format=pdf&as_of=${asOf}${showZeroBalance ? '&show_zero=1' : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export PDF
          </Link>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        Snapshot of every postable GL account as at <strong>{dateLabel}</strong>.
        Header accounts (1000, 9050) are excluded — they roll up via their
        children. Σ Dr must equal Σ Cr.
      </p>

      {!tb.reconciles ? (
        <div className="mb-6 px-4 py-3 border border-danger rounded-md bg-surface text-danger text-sm font-serif italic">
          ⚠ Trial Balance does not reconcile — Σ Dr ({formatMoney(tb.totals.debit)}) ≠ Σ Cr ({formatMoney(tb.totals.credit)}). Investigate journal_lines integrity before relying on this report.
        </div>
      ) : null}

      <table className="ledger-table max-w-3xl">
        <thead>
          <tr>
            <th>Account</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
          </tr>
        </thead>
        <tbody>
          {tb.rows.map((r) => (
            <tr key={r.code}>
              <td>
                <Link
                  href={`/reports/ledger?code=${encodeURIComponent(r.code)}`}
                  className="text-ink hover:text-accent"
                >
                  {r.code} {r.name}
                </Link>
              </td>
              <td className="num">{r.debit > 0 ? formatMoney(r.debit) : '—'}</td>
              <td className="num">{r.credit > 0 ? formatMoney(r.credit) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-hairline">
          <tr>
            <td className="font-serif italic text-ink font-semibold">TOTAL</td>
            <td className="num font-semibold text-num-ink">{formatMoney(tb.totals.debit)}</td>
            <td className="num font-semibold text-num-ink">{formatMoney(tb.totals.credit)}</td>
          </tr>
        </tfoot>
      </table>

      {tb.rows.length === 0 ? (
        <p className="font-serif italic text-muted text-sm mt-8">
          No accounts have any activity through {dateLabel}.{' '}
          {!showZeroBalance ? (
            <Link href={`/reports/trial-balance?as_of=${asOf}&show_zero=1`} className="text-accent hover:text-accent-hover">
              Show zero-balance accounts
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
