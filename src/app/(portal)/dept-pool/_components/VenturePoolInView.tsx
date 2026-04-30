import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import PnlCharts from './PnlCharts'

interface Props {
  deptId: string
  deptName: string
  period: string // YYYY-MM-01
}

// Shows what's flowing INTO this dept's pool — modelled on MarketingPnlView's
// layout (KPI tiles + 12-month bars + ledger). For HR / Finance / Director Office
// the In side is dominated by Venture Pool top-ups, so the user calls this the
// "Venture Pool In" view; for Marketing the In side includes invoice settlement
// revenue. The component itself is dept-agnostic — it reads dept_pools rows
// (np_in / expense_out) and the dept_pool_balances view.
export default async function VenturePoolInView({ deptId, deptName, period }: Props) {
  const supabase = await createClient()
  const monthStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
  const nextMonth = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  const [{ data: monthRows }, { data: balanceRow }, { data: trendRows }, { data: ledgerRows }] = await Promise.all([
    supabase
      .from('dept_pools')
      .select('transaction_type, amount')
      .eq('department_id', deptId)
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth),
    supabase
      .from('dept_pool_balances')
      .select('balance')
      .eq('department_id', deptId)
      .maybeSingle(),
    supabase
      .from('dept_pools')
      .select('transaction_type, amount, created_at')
      .eq('department_id', deptId)
      .gte('created_at', trendStart),
    supabase
      .from('dept_pools')
      .select('id, transaction_type, amount, period_month, description, created_at')
      .eq('department_id', deptId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  let monthIn = 0
  let monthOut = 0
  for (const r of monthRows ?? []) {
    if (r.transaction_type === 'np_in') monthIn += Number(r.amount)
    else if (r.transaction_type === 'expense_out') monthOut += Number(r.amount)
  }
  const balance = Number(balanceRow?.balance ?? 0)

  // 12-month trend bucketed by created_at month (matches MarketingPnlView,
  // which also buckets by created_at because payroll bank-transfer rows have
  // null period_month).
  const trendMap = new Map<string, { in: number; out: number }>()
  for (let i = 0; i < 12; i++) {
    const m = dayjs(period).subtract(11 - i, 'month').format('YYYY-MM-01')
    trendMap.set(m, { in: 0, out: 0 })
  }
  for (const r of trendRows ?? []) {
    const k = dayjs(r.created_at).format('YYYY-MM-01')
    const row = trendMap.get(k)
    if (!row) continue
    if (r.transaction_type === 'np_in') row.in += Number(r.amount)
    else if (r.transaction_type === 'expense_out') row.out += Number(r.amount)
  }
  const trend = Array.from(trendMap.entries()).map(([m, v]) => ({
    month: dayjs(m).format('MMM'),
    revenue: Math.round(v.in),
    cost: Math.round(v.out),
  }))

  // Pie composition: dollars-in vs dollars-out for the period. Empty months
  // collapse to "no movements" rather than rendering a degenerate chart.
  const composition = [
    { name: 'In', value: Math.max(monthIn, 0) },
    { name: 'Out', value: Math.max(monthOut, 0) },
  ].filter((d) => d.value > 0)

  const netChange = monthIn - monthOut

  return (
    <div className="space-y-10">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-hairline">
        <Kpi label="In this month" amount={monthIn} subtitle="Top-ups + invoice settlement" />
        <Kpi label="Out this month" amount={-monthOut} subtitle="Approved expenses" />
        <Kpi label="Net change" amount={netChange} accent />
        <Kpi label="Running balance" amount={balance} subtitle="All-time, see History tab" />
      </div>

      <PnlCharts
        composition={composition}
        trend={trend}
        trendLabels={{ revenue: 'In', cost: 'Out' }}
        compositionTitle="In vs Out"
        trendTitle="12-month In/Out"
        trendSubtitle={`${deptName} pool — money flowing in and out by month`}
      />

      {/* Ledger */}
      <section>
        <h2 className="font-serif text-xl text-ink mb-1">Pool ledger</h2>
        <p className="font-serif italic text-graphite text-xs mb-4">
          Latest 50 entries · all-time
        </p>
        {(ledgerRows ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No pool movements yet for {deptName}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Date</th>
                  <th className="text-left py-3 pr-4 font-medium">Period</th>
                  <th className="text-left py-3 pr-4 font-medium">Direction</th>
                  <th className="text-left py-3 pr-4 font-medium">Description</th>
                  <th className="text-right py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(ledgerRows ?? []).map((r) => {
                  const isIn = r.transaction_type === 'np_in'
                  const signed = isIn ? Number(r.amount) : -Number(r.amount)
                  return (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        {dayjs(r.created_at).format('D MMM YYYY')}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-graphite">
                        {r.period_month ? dayjs(r.period_month).format('MMM YYYY') : '—'}
                      </td>
                      <td className="py-3 pr-4">
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
                      <td className="py-3 pr-4 font-serif italic text-graphite">
                        {r.description ?? '—'}
                      </td>
                      <td
                        className={
                          isIn
                            ? 'py-3 text-right font-mono tabular font-medium text-ledger'
                            : 'py-3 text-right font-mono tabular font-medium text-ink'
                        }
                      >
                        {formatMoney(signed)}
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
  const colour = accent
    ? amount < 0
      ? 'text-danger'
      : 'text-accent'
    : 'text-ink'
  return (
    <div>
      <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">{label}</div>
      <div className={`font-serif text-2xl mt-1 ${colour}`}>{formatMoney(amount)}</div>
      {subtitle ? <p className="font-serif italic text-muted text-xs mt-1">{subtitle}</p> : null}
    </div>
  )
}
