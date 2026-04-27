import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchGlForPeriod, fetchSegmentPnl,
  startOfMonth, endOfMonth,
  SEGMENTS, SEGMENT_LABEL,
  type GlSegment, type AccountType,
} from '@/lib/gl-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}

export default async function SegmentPnlPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { from: rawFrom, to: rawTo, period } = await searchParams
  const from = rawFrom ?? startOfMonth(period)
  const to = rawTo ?? endOfMonth(period ?? from)

  const [seg, glAll] = await Promise.all([
    fetchSegmentPnl(supabase, { from, to }),
    // Pull account names for headers/rows
    fetchGlForPeriod(supabase, { from, to, types: ['revenue', 'expense'] }),
  ])

  // Pivot: account_code × segment
  const accountMeta = new Map<string, { name: string; type: AccountType }>()
  for (const a of glAll) accountMeta.set(a.code, { name: a.name, type: a.type })

  const pivot = new Map<string, Record<GlSegment, number>>()
  function row(code: string): Record<GlSegment, number> {
    const r = pivot.get(code) ?? Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<GlSegment, number>
    pivot.set(code, r)
    return r
  }
  for (const s of seg) {
    row(s.account_code)[s.segment] += s.amount
  }

  // Sort accounts: revenue first, then expense; by code within type.
  const codes = Array.from(pivot.keys())
    .filter((c) => accountMeta.has(c))
    .sort((a, b) => {
      const ta = accountMeta.get(a)!.type
      const tb = accountMeta.get(b)!.type
      if (ta !== tb) return ta === 'revenue' ? -1 : 1
      return a.localeCompare(b)
    })

  // Per-segment totals (revenue minus expense)
  const segmentTotal: Record<GlSegment, number> = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<GlSegment, number>
  for (const code of codes) {
    const r = pivot.get(code)!
    const meta = accountMeta.get(code)!
    for (const s of SEGMENTS) {
      segmentTotal[s] += meta.type === 'revenue' ? r[s] : -r[s]
    }
  }
  const grandTotal = Object.values(segmentTotal).reduce((a, b) => a + b, 0)

  // Company total from Income Statement (separate path) for reconciliation
  const totalRevenue = glAll.filter((a) => a.type === 'revenue').reduce((s, a) => s + a.balance, 0)
  const totalExpense = glAll.filter((a) => a.type === 'expense').reduce((s, a) => s + a.balance, 0)
  const companyNet = totalRevenue - totalExpense
  const reconcileDiff = grandTotal - companyNet
  const reconciles = Math.abs(reconcileDiff) < 0.01

  const periodLabel = formatPeriodLabel(from, to)
  const visibleSegments: GlSegment[] = SEGMENTS

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · SEGMENT P&amp;L · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Segment P&amp;L</h1>
        </div>
        <PeriodPicker from={from} to={to} />
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Same GL data as Income Statement, pivoted by business segment. Segments must
        sum to Company Net Profit — any non-zero diff is flagged below.
      </p>

      {codes.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">No P&amp;L journal lines in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Account</th>
                {visibleSegments.map((s) => (
                  <th key={s} className="right">{SEGMENT_LABEL[s]}</th>
                ))}
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {/* Revenue rows */}
              {codes.filter((c) => accountMeta.get(c)!.type === 'revenue').map((c) => {
                const r = pivot.get(c)!
                const total = SEGMENTS.reduce((s, k) => s + r[k], 0)
                return (
                  <tr key={c}>
                    <td>
                      <span className="font-mono text-xs text-graphite mr-2">{c}</span>
                      {accountMeta.get(c)!.name}
                    </td>
                    {visibleSegments.map((s) => (
                      <td key={s} className="num">{r[s] ? formatMoney(r[s]) : '—'}</td>
                    ))}
                    <td className="num text-num-ink font-medium">{formatMoney(total)}</td>
                  </tr>
                )
              })}
              {/* Expense rows (display as negative) */}
              {codes.filter((c) => accountMeta.get(c)!.type === 'expense').map((c) => {
                const r = pivot.get(c)!
                const total = SEGMENTS.reduce((s, k) => s + r[k], 0)
                return (
                  <tr key={c}>
                    <td>
                      <span className="font-mono text-xs text-graphite mr-2">{c}</span>
                      {accountMeta.get(c)!.name}
                    </td>
                    {visibleSegments.map((s) => (
                      <td key={s} className="num">
                        {r[s] ? <span className="neg">{formatMoney(-r[s])}</span> : '—'}
                      </td>
                    ))}
                    <td className="num text-num-ink font-medium">
                      {total ? <span className="neg">{formatMoney(-total)}</span> : '—'}
                    </td>
                  </tr>
                )
              })}
              {/* Segment Net row */}
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic font-medium">Segment Net</td>
                {visibleSegments.map((s) => (
                  <td key={s} className={`num font-semibold ${segmentTotal[s] >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {formatMoney(segmentTotal[s])}
                  </td>
                ))}
                <td className={`num font-semibold ${grandTotal >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  {formatMoney(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reconciliation row ── */}
      <div className="max-w-3xl mt-8 border border-hairline rounded-md bg-surface p-5">
        <h3 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-3">
          Reconciliation
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-graphite">Sum of Segments</span>
            <span className="num">{formatMoney(grandTotal)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-graphite">Company Net Profit (Income Statement)</span>
            <span className="num">{formatMoney(companyNet)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
            <span className="font-serif italic font-medium text-ink">Difference</span>
            <span className={`num font-semibold ${reconciles ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(reconcileDiff)} {reconciles ? '✓' : '⚠'}
            </span>
          </div>
        </div>
        {!reconciles ? (
          <p className="font-serif italic text-danger text-xs mt-3">
            Segments do not tally to Company P&amp;L — investigate segment-tagging gaps
            in journal_entries (likely &apos;unallocated&apos; rows that should be classified).
          </p>
        ) : (
          <p className="font-serif italic text-muted text-xs mt-3">
            Sum(segments) ≡ Company Net Profit. The two views are consistent.
          </p>
        )}
      </div>
    </div>
  )
}

function PeriodPicker({ from }: { from: string; to: string }) {
  return (
    <form className="shrink-0">
      <input
        type="month"
        name="period"
        defaultValue={dayjs(from).format('YYYY-MM')}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
    </form>
  )
}

function formatPeriodLabel(from: string, to: string): string {
  const dFrom = dayjs(from)
  const dTo = dayjs(to)
  const wholeMonth = dFrom.startOf('month').isSame(dFrom, 'day')
                     && dTo.endOf('month').isSame(dTo, 'day')
                     && dFrom.isSame(dTo, 'month')
  if (wholeMonth) return dFrom.format('MMMM YYYY')
  return `${dFrom.format('D MMM')} → ${dTo.format('D MMM YYYY')}`
}
