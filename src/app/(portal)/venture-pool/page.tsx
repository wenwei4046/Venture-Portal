import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { fetchAllRows } from '@/lib/paginate'
import PnlCharts from '../dept-pool/_components/PnlCharts'
import LedgerRow from '@/components/LedgerRow'

// Post 2026-05-26 re-import: Venture Pool data is derived from journal_lines
// where segment IN ('corporate', 'treasury') on HV bank accounts, NOT the
// legacy venture_pool table. Matches /dept-pool's Venture row + dashboard
// hv_fund_balance (mig 273). Treasury inclusion captures fund_source /
// loan / repayment activity (HV central treasury operations); corporate
// captures generic HV expenses + historical OFFICE-tagged manual_jv.

export default async function VenturePoolPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const period = getPeriodMonth()
  const monthStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
  const nextMonth = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  // Resolve bank account codes once.
  const { data: bankCodesData } = await supabase
    .from('bank_accounts')
    .select('gl_account_code')
    .eq('status', 'active')
  const cashCodes = (bankCodesData ?? [])
    .map((b) => b.gl_account_code as string)
    .filter(Boolean)

  // Helper: fetch journal_lines on corporate-segment bank touches in a window.
  type RawLine = {
    id: string
    debit: number | null
    credit: number | null
    description: string | null
    journal_entries: { transaction_date: string; description: string | null; reference_type: string | null }
  }
  async function fetchCorpBankLines(opts: { since?: string; until?: string; limit?: number }) {
    if (cashCodes.length === 0) return [] as RawLine[]
    const base = () => {
      let q = supabase
        .from('journal_lines')
        .select('id, debit, credit, description, journal_entries!inner(transaction_date, description, reference_type, segment)')
        .in('account_code', cashCodes)
        .in('journal_entries.segment', ['corporate', 'treasury'])
      if (opts.since) q = q.gte('journal_entries.transaction_date', opts.since)
      if (opts.until) q = q.lt('journal_entries.transaction_date', opts.until)
      return q
    }
    // Display reads pass a limit (most-recent first); the aggregation reads
    // (no limit) MUST paginate or they truncate at PostgREST's 1000-row cap.
    if (opts.limit) {
      const { data } = await base()
        .order('transaction_date', { foreignTable: 'journal_entries', ascending: false })
        .limit(opts.limit)
      return (data ?? []) as unknown as RawLine[]
    }
    const rows = await fetchAllRows((lo, hi) => base().order('id', { ascending: true }).range(lo, hi))
    return rows as unknown as RawLine[]
  }

  const [allTimeLines, monthLines, trendLines, ledgerLines] = await Promise.all([
    fetchCorpBankLines({}),
    fetchCorpBankLines({ since: monthStart, until: nextMonth }),
    fetchCorpBankLines({ since: trendStart }),
    fetchCorpBankLines({ limit: 50 }),
  ])

  // All-time balance.
  let balance = 0
  for (const l of allTimeLines) balance += Number(l.debit ?? 0) - Number(l.credit ?? 0)

  // This-month In/Out.
  let monthIn = 0
  let monthOut = 0
  for (const l of monthLines) {
    monthIn += Number(l.debit ?? 0)
    monthOut += Number(l.credit ?? 0)
  }
  const netChange = monthIn - monthOut

  // 12-month trend bucketed by transaction_date month.
  const trendMap = new Map<string, { in: number; out: number }>()
  for (let i = 0; i < 12; i++) {
    const m = dayjs(period).subtract(11 - i, 'month').format('YYYY-MM-01')
    trendMap.set(m, { in: 0, out: 0 })
  }
  for (const l of trendLines) {
    const k = dayjs(l.journal_entries.transaction_date).format('YYYY-MM-01')
    const row = trendMap.get(k)
    if (!row) continue
    row.in += Number(l.debit ?? 0)
    row.out += Number(l.credit ?? 0)
  }
  const trend = Array.from(trendMap.entries()).map(([m, v]) => ({
    month: dayjs(m).format('MMM'),
    revenue: Math.round(v.in),
    cost: Math.round(v.out),
  }))

  const composition = [
    { name: 'In', value: Math.max(monthIn, 0) },
    { name: 'Out', value: Math.max(monthOut, 0) },
  ].filter((d) => d.value > 0)

  // Friendly type label from journal_entries.reference_type.
  function refLabel(refType: string | null): string {
    if (!refType) return 'Journal'
    switch (refType) {
      case 'manual_jv': return 'Manual JV'
      case 'invoice': return 'Invoice settled'
      case 'voucher':
      case 'payment_voucher': return 'Payment voucher'
      case 'fund_source': return 'Fund source'
      case 'fund_source_repayment': return 'Fund source repayment'
      case 'loan': return 'Loan'
      case 'repayment': return 'Loan repayment'
      case 'invoice_paid_credit': return 'Invoice paid credit'
      default: return refType.replace(/_/g, ' ')
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · VENTURE POOL · {dayjs(period).format('MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Venture Pool</h1>
        </div>
      </div>

      {/* ───────── Hero: balance + this-month summary ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
          <div className="font-serif italic text-graphite text-sm mb-1">Running balance</div>
          <div
            className={`font-serif text-[30px] sm:text-[44px] md:text-hero leading-none tabular tracking-[-0.01em] ${
              balance < 0 ? 'text-danger' : 'text-num-ink'
            }`}
          >
            {formatMoney(balance)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            Corporate-segment cash on HV bank accounts · all-time
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2">
          <div className="font-serif italic text-graphite text-sm mb-2">This month</div>
          <div className="flex items-baseline justify-between text-sm">
            <em className="font-serif text-graphite text-md">In</em>
            <span className="num text-ledger">{formatMoney(monthIn)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <em className="font-serif text-graphite text-md">Out</em>
            <span className="num">{formatMoney(-monthOut)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm border-t border-hairline pt-2 mt-2">
            <em className="font-serif text-ink text-md">Net</em>
            <span className={`num text-md ${netChange < 0 ? 'neg' : 'text-num-ink'}`}>
              {formatMoney(netChange)}
            </span>
          </div>
        </div>
      </div>

      {/* ───────── KPI tiles ───────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-hairline mb-10">
        <Kpi
          label="In this month"
          amount={monthIn}
          subtitle="Cash in: debits on HL/Alliance (segment=corporate)"
        />
        <Kpi label="Out this month" amount={-monthOut} subtitle="Cash out: credits on HL/Alliance" />
        <Kpi label="Net change" amount={netChange} accent />
        <Kpi label="Running balance" amount={balance} subtitle="All-time, see ledger below" />
      </div>

      {/* ───────── 12-month In/Out chart ───────── */}
      <div className="mb-10">
        <PnlCharts
          composition={composition}
          trend={trend}
          trendLabels={{ revenue: 'In', cost: 'Out' }}
          compositionTitle="In vs Out"
          trendTitle="12-month In/Out"
          trendSubtitle="Venture Pool — money flowing in and out by month"
        />
      </div>

      {/* ───────── Ledger ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">Pool ledger</h2>
        <p className="font-serif italic text-graphite text-xs mb-4">
          Latest 50 entries · derived from journal_lines (segment=corporate on HV banks)
        </p>
        {ledgerLines.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No movements yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="text-left m-hide">Date</th>
                  <th className="text-left m-hide">Type</th>
                  <th className="text-left m-hide">Direction</th>
                  <th className="text-left">Description</th>
                  <th className="text-right">Amount</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {ledgerLines.map((l) => {
                  const dr = Number(l.debit ?? 0)
                  const cr = Number(l.credit ?? 0)
                  const isIn = dr > 0
                  const signed = isIn ? dr : -cr
                  const desc = l.description ?? l.journal_entries.description ?? '—'
                  return (
                    <LedgerRow key={l.id}>
                      <td className="font-mono text-xs text-muted m-hide" data-label="Date">
                        {dayjs(l.journal_entries.transaction_date).format('D MMM YYYY')}
                      </td>
                      <td className="font-serif italic text-graphite text-sm m-hide" data-label="Type">
                        {refLabel(l.journal_entries.reference_type)}
                      </td>
                      <td className="m-hide" data-label="Direction">
                        <span
                          className={
                            isIn
                              ? 'text-xs font-serif italic text-ledger'
                              : 'text-xs font-serif italic text-graphite'
                          }
                        >
                          {isIn ? 'In' : 'Out'}
                        </span>
                      </td>
                      <td className="font-serif italic text-graphite">{desc}</td>
                      <td className={`num ${isIn ? 'text-ledger' : ''}`}>
                        {isIn ? formatMoney(signed) : <span className="neg">{formatMoney(signed)}</span>}
                      </td>
                    </LedgerRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Kpi({
  label,
  amount,
  subtitle,
  accent,
}: {
  label: string
  amount: number
  subtitle?: string
  accent?: boolean
}) {
  const colour = accent ? (amount < 0 ? 'text-danger' : 'text-accent') : 'text-ink'
  return (
    <div>
      <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
        {label}
      </div>
      <div className={`font-serif text-2xl mt-1 ${colour}`}>{formatMoney(amount)}</div>
      {subtitle ? (
        <p className="font-serif italic text-muted text-xs mt-1">{subtitle}</p>
      ) : null}
    </div>
  )
}
