import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import PnlCharts from './PnlCharts'

interface Props {
  deptId: string
  period: string // YYYY-MM-01
}

export default async function MarketingPnlView({ deptId, period }: Props) {
  const supabase = await createClient()
  const monthStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
  const nextMonth = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  // Revenue: marketing_project invoices for this dept this period.
  // Pool out: ALL expense_out rows (filter by created_at not period_month —
  // payroll bank transfer rows have period_month=null but should still count).
  // Matches the dashboard /dept-pool list aggregate.
  const [{ data: invoiceRows }, { data: expenseRows }] = await Promise.all([
    supabase
      .from('invoices')
      .select('total_amount')
      .eq('period_month', period)
      .eq('billing_mode', 'marketing_project'),
    supabase
      .from('dept_pools')
      .select('amount')
      .eq('department_id', deptId)
      .in('transaction_type', ['expense_out', 'inter_billing_out'])
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth),
  ])

  const revenue = (invoiceRows ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
  const expenses = (expenseRows ?? []).reduce((s, r) => s + Number(r.amount), 0)

  // OPEX = full Cost-To-Company for Marketing employees this month, from the
  // payroll grid. CTC = gross + employer statutory (epf/socso/eis ER).
  // calculate_dept_np's staff_cost only counts basic_salary so it under-reports
  // OPEX — this view shows the real number.
  const { data: payRows } = await supabase
    .from('hr_monthly_payroll')
    .select('gross, epf_er, socso_er, eis_er, hr_staff_costs!inner(department_id)')
    .eq('period_month', period)
    .eq('hr_staff_costs.department_id', deptId)

  const opex = (payRows ?? []).reduce(
    (sum, r) =>
      sum + Number(r.gross) + Number(r.epf_er) + Number(r.socso_er) + Number(r.eis_er),
    0,
  )

  // Pool Out already includes payroll consolidation entries written by the
  // payroll → HR Pool flow, so OPEX is a subset of expenses, not an additional
  // line to subtract. Net Profit = Revenue − Pool Out (single source of truth).
  const netProfit = revenue - expenses
  const headcount = (payRows ?? []).length
  const otherExpenses = Math.max(expenses - opex, 0)

  // Composition pie: OPEX (staff) vs Other (vendor / non-payroll out)
  const composition = [
    { name: 'OPEX (staff)', value: Math.max(opex, 0) },
    { name: 'Other expenses', value: otherExpenses },
  ].filter((d) => d.value > 0)

  // 12-month trend: revenue from invoices + cost (= expense_out from pool,
  // which already includes payroll consolidation). Bucket by created_at month
  // since payroll bank-transfer rows have null period_month.
  const [{ data: trendInvoices }, { data: trendExpenses }] = await Promise.all([
    supabase
      .from('invoices')
      .select('total_amount, period_month')
      .gte('period_month', trendStart)
      .lte('period_month', period)
      .eq('billing_mode', 'marketing_project'),
    supabase
      .from('dept_pools')
      .select('amount, created_at')
      .eq('department_id', deptId)
      .in('transaction_type', ['expense_out', 'inter_billing_out'])
      .gte('created_at', trendStart),
  ])

  const trendMap = new Map<string, { revenue: number; cost: number }>()
  // Seed all 12 months so empty months show as 0
  for (let i = 0; i < 12; i++) {
    const m = dayjs(period).subtract(11 - i, 'month').format('YYYY-MM-01')
    trendMap.set(m, { revenue: 0, cost: 0 })
  }
  for (const inv of trendInvoices ?? []) {
    const k = inv.period_month as string
    const row = trendMap.get(k)
    if (row) row.revenue += Number(inv.total_amount)
  }
  for (const e of trendExpenses ?? []) {
    const k = dayjs(e.created_at).format('YYYY-MM-01')
    const row = trendMap.get(k)
    if (row) row.cost += Number(e.amount)
  }
  const trend = Array.from(trendMap.entries()).map(([m, v]) => ({
    month: dayjs(m).format('MMM'),
    revenue: Math.round(v.revenue),
    cost: Math.round(v.cost),
  }))

  // Payment Voucher history — anything touching the Marketing dept pool.
  // Pool name convention is `dept_pool_<lowercase>` (see migrations).
  const { data: pvRows } = await supabase
    .from('payment_vouchers')
    .select('id, voucher_no, direction, amount, payee_name, description, status, created_at')
    .or('source_pool.eq.dept_pool_marketing,target_pool.eq.dept_pool_marketing')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-10">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-hairline">
        <Kpi label="Revenue" amount={revenue} />
        <Kpi
          label="Total out"
          amount={-expenses}
          subtitle="All debits from Marketing pool this month"
        />
        <Kpi
          label="OPEX (staff)"
          amount={-opex}
          subtitle={`${headcount} staff · subset of Total out`}
        />
        <Kpi label="Net profit" amount={netProfit} accent />
      </div>

      <PnlCharts composition={composition} trend={trend} />

      {/* PV history */}
      <section>
        <h2 className="font-serif text-xl text-ink mb-1">Payment voucher history</h2>
        {(pvRows ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No payment vouchers yet for Marketing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Date</th>
                  <th className="text-left py-3 pr-4 font-medium">Voucher</th>
                  <th className="text-left py-3 pr-4 font-medium">Direction</th>
                  <th className="text-left py-3 pr-4 font-medium">Payee</th>
                  <th className="text-left py-3 pr-4 font-medium">Description</th>
                  <th className="text-right py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(pvRows ?? []).map((r) => {
                  const isIn = r.direction === 'credit'
                  const signed = isIn ? Number(r.amount) : -Number(r.amount)
                  return (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        {dayjs(r.created_at).format('D MMM YYYY')}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-graphite">{r.voucher_no}</td>
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
                      <td className="py-3 pr-4 font-serif italic text-graphite">{r.payee_name ?? '—'}</td>
                      <td className="py-3 pr-4 font-serif italic text-graphite">{r.description ?? '—'}</td>
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
  negativeWhenZero = true,
}: {
  label: string
  amount: number
  subtitle?: string
  accent?: boolean
  negativeWhenZero?: boolean
}) {
  const colour = accent
    ? amount < 0
      ? 'text-danger'
      : 'text-accent'
    : amount < 0 || (amount === 0 && negativeWhenZero)
      ? 'text-ink'
      : 'text-ink'
  return (
    <div>
      <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">{label}</div>
      <div className={`statement-amount mt-1 ${colour}`}>{formatMoney(amount)}</div>
      {subtitle ? <p className="font-serif italic text-muted text-xs mt-1">{subtitle}</p> : null}
    </div>
  )
}
