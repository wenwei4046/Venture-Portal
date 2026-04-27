import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchGlForPeriod, type AccountType } from '@/lib/gl-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ as_of?: string }>
}

const TYPE_HEADER: Record<'asset' | 'liability' | 'equity', { label: string; className: string }> = {
  asset:     { label: 'Assets',      className: 'text-info' },
  liability: { label: 'Liabilities', className: 'text-danger' },
  equity:    { label: 'Equity',      className: 'text-ledger' },
}

export default async function BalanceSheetPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { as_of: rawAsOf } = await searchParams
  const asOf = rawAsOf ?? dayjs().endOf('month').format('YYYY-MM-DD')

  // Cumulative GL balances from inception → as-of date.
  const accounts = await fetchGlForPeriod(supabase, {
    asOf,
    types: ['asset', 'liability', 'equity'],
  })

  // Retained earnings = cumulative net profit (revenue − expense) from inception
  // through as-of, posted into a virtual "Retained Earnings" line so the BS
  // balances. Without this, P&L accounts never close out and Equity is short
  // by the YTD net profit.
  const pnlAccounts = await fetchGlForPeriod(supabase, {
    asOf,
    types: ['revenue', 'expense'],
  })
  const totalRevenue = pnlAccounts.filter((a) => a.type === 'revenue').reduce((s, a) => s + a.balance, 0)
  const totalExpense = pnlAccounts.filter((a) => a.type === 'expense').reduce((s, a) => s + a.balance, 0)
  const retainedEarnings = totalRevenue - totalExpense

  const assets = accounts.filter((a) => a.type === 'asset').filter((a) => a.balance !== 0)
  const liabilities = accounts.filter((a) => a.type === 'liability').filter((a) => a.balance !== 0)
  const equity = accounts.filter((a) => a.type === 'equity').filter((a) => a.balance !== 0)

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)
  const totalEquityBefore = equity.reduce((s, a) => s + a.balance, 0)
  const totalEquity = totalEquityBefore + retainedEarnings
  const totalLiabAndEquity = totalLiabilities + totalEquity
  const reconcileDiff = totalAssets - totalLiabAndEquity
  const reconciles = Math.abs(reconcileDiff) < 0.01

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · BALANCE SHEET · AS OF {dayjs(asOf).format('D MMM YYYY').toUpperCase()}
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

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Cumulative GL balances from inception through {dayjs(asOf).format('D MMM YYYY')}.
        Retained Earnings = YTD revenue − YTD expense.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        {/* ── Assets ── */}
        <div>
          <BalanceSheetSection
            type="asset"
            accounts={assets}
            total={totalAssets}
          />
        </div>

        {/* ── Liabilities + Equity ── */}
        <div className="space-y-8">
          <BalanceSheetSection
            type="liability"
            accounts={liabilities}
            total={totalLiabilities}
          />
          <div>
            <h2 className={`font-sans text-xs uppercase tracking-wide ${TYPE_HEADER.equity.className} font-semibold mb-3`}>
              Equity
            </h2>
            {equity.length === 0 && retainedEarnings === 0 ? (
              <p className="font-serif italic text-muted text-sm">No equity balances.</p>
            ) : (
              <table className="ledger-table">
                <tbody>
                  {equity.map((a) => (
                    <tr key={a.code}>
                      <td className="font-mono text-xs text-graphite w-20">{a.code}</td>
                      <td>{a.name}</td>
                      <td className="num">{formatMoney(a.balance)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="font-mono text-xs text-graphite w-20">—</td>
                    <td className="italic text-graphite">Retained Earnings (YTD)</td>
                    <td className={`num ${retainedEarnings >= 0 ? 'text-ledger' : 'text-danger'}`}>
                      {formatMoney(retainedEarnings)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
              <span className="font-serif italic text-base text-ink font-medium">Total Equity</span>
              <span className="num text-num-ink text-lg font-semibold">{formatMoney(totalEquity)}</span>
            </div>
          </div>

          <div className="border-t-2 border-hairline pt-4">
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-base text-ink font-medium">Total Liabilities + Equity</span>
              <span className="num text-num-ink text-lg font-semibold">{formatMoney(totalLiabAndEquity)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Reconciliation ── */}
      <div className="max-w-3xl mt-10 border border-hairline rounded-md bg-surface p-5">
        <h3 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-3">
          Reconciliation
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-graphite">Total Assets</span>
            <span className="num">{formatMoney(totalAssets)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-graphite">Total Liabilities + Equity</span>
            <span className="num">{formatMoney(totalLiabAndEquity)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
            <span className="font-serif italic font-medium text-ink">Balance Check</span>
            <span className={`num font-semibold ${reconciles ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(reconcileDiff)} {reconciles ? '✓' : '⚠'}
            </span>
          </div>
        </div>
        {!reconciles ? (
          <p className="font-serif italic text-danger text-xs mt-3">
            Balance Sheet does not balance — investigate journal_entries with unbalanced
            lines, or unmatched debit/credit pairs in non-double-entry posts.
          </p>
        ) : (
          <p className="font-serif italic text-muted text-xs mt-3">
            Assets ≡ Liabilities + Equity. GL is balanced.
          </p>
        )}
      </div>
    </div>
  )
}

function BalanceSheetSection({
  type, accounts, total,
}: {
  type: 'asset' | 'liability'
  accounts: { code: string; name: string; balance: number; type: AccountType }[]
  total: number
}) {
  const header = TYPE_HEADER[type]
  return (
    <div>
      <h2 className={`font-sans text-xs uppercase tracking-wide ${header.className} font-semibold mb-3`}>
        {header.label}
      </h2>
      {accounts.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">No balances.</p>
      ) : (
        <table className="ledger-table">
          <tbody>
            {accounts.map((a) => (
              <tr key={a.code}>
                <td className="font-mono text-xs text-graphite w-20">{a.code}</td>
                <td>{a.name}</td>
                <td className="num">{formatMoney(a.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
        <span className="font-serif italic text-base text-ink font-medium">Total {header.label}</span>
        <span className="num text-num-ink text-lg font-semibold">{formatMoney(total)}</span>
      </div>
    </div>
  )
}
