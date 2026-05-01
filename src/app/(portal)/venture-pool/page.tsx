import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import PnlCharts from '../dept-pool/_components/PnlCharts'

type HvFundTxn =
  | 'profit_in'
  | 'fund_in'
  | 'fund_out'
  | 'loan_repayment_in'
  | 'expense_out'

const IN_TYPES: HvFundTxn[] = ['fund_in', 'loan_repayment_in', 'profit_in']
const OUT_TYPES: HvFundTxn[] = ['fund_out', 'expense_out']

const TXN_LABEL: Record<HvFundTxn, string> = {
  fund_in: 'Fund in',
  loan_repayment_in: 'Loan repayment',
  profit_in: 'Profit in',
  fund_out: 'Loan disbursed',
  expense_out: 'Expense out',
}

export default async function VenturePoolPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const period = getPeriodMonth()
  const monthStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
  const nextMonth = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  const [{ data: monthRows }, { data: balanceRow }, { data: trendRows }, { data: ledgerRows }] =
    await Promise.all([
      supabase
        .from('venture_pool')
        .select('transaction_type, amount')
        .gte('created_at', monthStart)
        .lt('created_at', nextMonth),
      supabase.from('venture_pool_balance').select('balance').maybeSingle(),
      supabase
        .from('venture_pool')
        .select('transaction_type, amount, created_at')
        .gte('created_at', trendStart),
      supabase
        .from('venture_pool')
        .select('id, transaction_type, amount, description, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  let monthIn = 0
  let monthOut = 0
  for (const r of monthRows ?? []) {
    if (IN_TYPES.includes(r.transaction_type as HvFundTxn)) monthIn += Number(r.amount)
    else if (OUT_TYPES.includes(r.transaction_type as HvFundTxn)) monthOut += Number(r.amount)
  }
  const balance = Number(balanceRow?.balance ?? 0)
  const netChange = monthIn - monthOut

  // 12-month trend bucketed by created_at month.
  const trendMap = new Map<string, { in: number; out: number }>()
  for (let i = 0; i < 12; i++) {
    const m = dayjs(period).subtract(11 - i, 'month').format('YYYY-MM-01')
    trendMap.set(m, { in: 0, out: 0 })
  }
  for (const r of trendRows ?? []) {
    const k = dayjs(r.created_at).format('YYYY-MM-01')
    const row = trendMap.get(k)
    if (!row) continue
    if (IN_TYPES.includes(r.transaction_type as HvFundTxn)) row.in += Number(r.amount)
    else if (OUT_TYPES.includes(r.transaction_type as HvFundTxn)) row.out += Number(r.amount)
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
        <div className="lg:col-span-7">
          <div className="font-serif italic text-graphite text-sm mb-1">Running balance</div>
          <div
            className={`font-serif text-[44px] md:text-hero leading-none tabular tracking-[-0.01em] ${
              balance < 0 ? 'text-danger' : 'text-num-ink'
            }`}
          >
            {formatMoney(balance)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            HV holding-company cash ledger · all-time
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
          subtitle="Fund in + loan repayment + profit"
        />
        <Kpi label="Out this month" amount={-monthOut} subtitle="Loans disbursed + HV expense" />
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
          Latest 50 entries · all-time
        </p>
        {(ledgerRows ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No movements yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Type</th>
                  <th className="text-left">Direction</th>
                  <th className="text-left">Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(ledgerRows ?? []).map((r) => {
                  const isIn = IN_TYPES.includes(r.transaction_type as HvFundTxn)
                  const signed = isIn ? Number(r.amount) : -Number(r.amount)
                  const label = TXN_LABEL[r.transaction_type as HvFundTxn] ?? r.transaction_type
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-xs text-muted">
                        {dayjs(r.created_at).format('D MMM YYYY')}
                      </td>
                      <td className="font-serif italic text-graphite text-sm">{label}</td>
                      <td>
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
                      <td className="font-serif italic text-graphite">
                        {r.description ?? '—'}
                      </td>
                      <td className={`num ${isIn ? 'text-ledger' : ''}`}>
                        {isIn ? formatMoney(signed) : <span className="neg">{formatMoney(signed)}</span>}
                      </td>
                    </tr>
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
