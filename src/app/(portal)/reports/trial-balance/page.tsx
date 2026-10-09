import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchTrialBalance, isCalendarDay } from '@/lib/cfo-reports'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

interface Props {
  searchParams: Promise<{ as_of?: string; show_zero?: string }>
}

export default async function TrialBalancePage({ searchParams }: Props) {
  await requirePermission('reports')
  const supabase = await createClient()

  const { as_of: rawAsOf, show_zero: rawShowZero } = await searchParams
  // A hand-typed day that is not one (2026-02-31) opens today, not an error —
  // the office's today: on the server's clock (UTC) it was yesterday until 08:00.
  const asOf = isCalendarDay(rawAsOf) ? rawAsOf : officeToday()
  const showZeroBalance = rawShowZero === '1'

  const tb = await fetchTrialBalance(supabase, { asOf, showZeroBalance })
  const dateLabel = dayjs(asOf).format('D MMMM YYYY')

  // On the sheet (2026-10-09, the user's Claude Design handoff): the date in
  // the eyebrow, Excel / PDF, three cards, the as-at control on a row, the
  // accounts closing on their totals.
  const difference = Math.round((tb.totals.debit - tb.totals.credit) * 100) / 100
  const exportQs = `as_of=${asOf}${showZeroBalance ? '&show_zero=1' : ''}`

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · TRIAL BALANCE · AS AT {dateLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Trial Balance</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href={`/reports/trial-balance/export?format=xlsx&${exportQs}`} className="btn-quiet-sheet">
            Excel
          </a>
          <a href={`/reports/trial-balance/export?format=pdf&${exportQs}`} className="btn-quiet-sheet">
            PDF
          </a>
        </div>
      </div>

      <StatCards label="Trial balance">
        <StatCard label="Total debit" value={formatMoney(tb.totals.debit)} icon="inbox" note={`${tb.rows.length} ${tb.rows.length === 1 ? 'account' : 'accounts'}`} />
        <StatCard label="Total credit" value={formatMoney(tb.totals.credit)} icon="send" note={`As at ${dateLabel}`} />
        <StatCard
          label="Difference"
          value={formatMoney(difference)}
          icon="check"
          tone={tb.reconciles ? 'primary' : 'danger'}
          note={tb.reconciles ? 'Debits = credits' : 'Does not reconcile'}
        />
      </StatCards>

      <section className="mb-6">
      <div className="sect-head">
        <h2>Trial balance</h2>
        <span className="rule" aria-hidden />
        <span className="count">AS AT {dateLabel.toUpperCase()}</span>
      </div>
      <form className="rpt-toolbar" aria-label="Trial balance date">
        <label className="rpt-field">
          <span>As at</span>
          <input type="date" name="as_of" defaultValue={asOf} />
        </label>
        <label className="rpt-field">
          <span>Show</span>
          <span className="flex items-center gap-2 h-8 normal-case tracking-normal text-[13px] font-normal text-ink">
            <input type="checkbox" name="show_zero" value="1" defaultChecked={showZeroBalance} />
            Zero-balance accounts
          </span>
        </label>
        <button type="submit" className="btn-pri-sheet">
          Apply
        </button>
      </form>
      <p className="text-xs text-graphite mb-3 max-w-3xl">
        Every postable GL account as at {dateLabel}. Header accounts (1000, 9050) roll up through their children. Σ Dr must equal Σ Cr.
      </p>

      {!tb.reconciles ? (
        <div className="sheet-danger mb-4">
          ⚠ Trial Balance does not reconcile — Σ Dr ({formatMoney(tb.totals.debit)}) ≠ Σ Cr ({formatMoney(tb.totals.credit)}). Investigate journal_lines integrity before relying on this report.
        </div>
      ) : null}

      <div className="table-frame max-w-4xl">
        <div className="table-frame-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="right">Debit</th>
                <th className="right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.code}>
                  <td>
                    <Link href={`/reports/ledger?code=${encodeURIComponent(r.code)}`} className="text-ink hover:text-accent">
                      {r.code} · {r.name}
                    </Link>
                  </td>
                  <td className="num">{r.debit > 0 ? formatMoneyBare(r.debit) : '—'}</td>
                  <td className="num">{r.credit > 0 ? formatMoneyBare(r.credit) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="rpt-all">
                <td>Total</td>
                <td className="num">{formatMoneyBare(tb.totals.debit)}</td>
                <td className="num">{formatMoneyBare(tb.totals.credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      </section>

      {tb.rows.length === 0 ? (
        <p className="text-sm text-graphite mt-6">
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
