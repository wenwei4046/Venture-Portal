import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchBalanceSheet } from '@/lib/cfo-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ as_of?: string }>
}

export default async function BalanceSheetPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { as_of: rawAsOf } = await searchParams
  const asOf = rawAsOf ?? dayjs().format('YYYY-MM-DD')

  const bs = await fetchBalanceSheet(supabase, { asOf })
  const dateLabel = dayjs(asOf).format('D MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · BALANCE SHEET · {dateLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Balance Sheet</h1>
        </div>
        <form className="shrink-0">
          <input
            type="date"
            name="as_of"
            defaultValue={asOf}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </form>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        Snapshot at end of <strong>{dateLabel}</strong>. Group-level. Retained
        earnings is YTD net profit (Jan 1 → as-of date).
      </p>

      <div className="max-w-3xl space-y-10">
        {/* Assets */}
        <section>
          <h2 className="font-serif text-xl text-ink mb-4">Assets</h2>
          <table className="ledger-table">
            <tbody>
              <tr>
                <td>Bank cash</td>
                <td className="num">{formatMoney(bs.bank)}</td>
              </tr>
              <tr>
                <td>Invoice receivable</td>
                <td className="num">{formatMoney(bs.invoiceReceivable)}</td>
              </tr>
              <tr>
                <td>Loan receivable</td>
                <td className="num">{formatMoney(bs.loanReceivable)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Total assets</td>
                <td className="num font-semibold text-num-ink">{formatMoney(bs.totalAssets)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Liabilities */}
        <section>
          <h2 className="font-serif text-xl text-ink mb-4">Liabilities</h2>
          <table className="ledger-table">
            <tbody>
              <tr>
                <td>Fund sources payable</td>
                <td className="num">{formatMoney(bs.fundSourcesPayable)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Total liabilities</td>
                <td className="num font-semibold text-num-ink">{formatMoney(bs.fundSourcesPayable)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Equity */}
        <section>
          <h2 className="font-serif text-xl text-ink mb-4">Equity</h2>
          <table className="ledger-table">
            <tbody>
              <tr>
                <td>Retained earnings (YTD)</td>
                <td className={`num ${bs.retainedEarnings >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  {formatMoney(bs.retainedEarnings)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Total equity</td>
                <td className={`num font-semibold ${bs.retainedEarnings >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  {formatMoney(bs.retainedEarnings)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Reconciliation */}
        <div className="border border-hairline rounded-md bg-surface p-5">
          <h3 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-3">
            Balance check
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-graphite">Total assets</span>
              <span className="num">{formatMoney(bs.totalAssets)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-graphite">Total liabilities + equity</span>
              <span className="num">{formatMoney(bs.totalLiabilitiesEquity)}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic font-medium text-ink">Difference</span>
              <span className={`num font-semibold ${bs.reconciles ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(bs.totalAssets - bs.totalLiabilitiesEquity)} {bs.reconciles ? '✓' : '⚠'}
              </span>
            </div>
          </div>
          {!bs.reconciles ? (
            <p className="font-serif italic text-danger text-xs mt-3">
              Balance sheet does not tie. Check fund-source / receivable balances and
              YTD net profit on the Income Statement.
            </p>
          ) : (
            <p className="font-serif italic text-muted text-xs mt-3">
              Assets ≡ Liabilities + Equity ✓
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
