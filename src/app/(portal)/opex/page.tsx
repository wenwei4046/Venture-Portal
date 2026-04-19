import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import OpexTrendChart from './_components/OpexTrendChart'

interface PayrollRow {
  basic_salary: number | string
  statutory_allowance: number | string
  non_statutory_allowance: number | string
  commission_amount: number | string
  epf_er: number | string
  socso_er: number | string
  eis_er: number | string
  period_month: string
  employee_name: string | null
}

export default async function OpexPage() {
  const user = await requireRole(['dept_manager'])
  if (!user.department_id) notFound()

  const supabase = await createClient()
  const { data: dept } = await supabase
    .from('departments')
    .select('name')
    .eq('id', user.department_id)
    .single()
  if (!dept) notFound()

  const period = getPeriodMonth()
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  // RPC bypasses RLS with internal role check (own-dept for dept_manager).
  // See migration 20260101000172_get_dept_opex_rows.sql.
  const { data: rowsRaw } = await supabase.rpc('get_dept_opex_rows', {
    p_dept_id: user.department_id,
    p_period_start: trendStart,
    p_period_end: period,
  })

  const rows = (rowsRaw ?? []) as unknown as PayrollRow[]

  const trendMap = new Map<string, number>()
  for (let i = 0; i < 12; i++) {
    const m = dayjs(period).subtract(11 - i, 'month').format('YYYY-MM-01')
    trendMap.set(m, 0)
  }
  for (const r of rows) {
    const total =
      Number(r.basic_salary) +
      Number(r.statutory_allowance) +
      Number(r.non_statutory_allowance) +
      Number(r.commission_amount) +
      Number(r.epf_er) +
      Number(r.socso_er) +
      Number(r.eis_er)
    const k = r.period_month
    if (trendMap.has(k)) trendMap.set(k, (trendMap.get(k) ?? 0) + total)
  }
  const trend = Array.from(trendMap.entries()).map(([m, v]) => ({
    month: dayjs(m).format('MMM'),
    opex: Math.round(v),
  }))

  // Current month per-employee table
  const currentRows = rows
    .filter((r) => r.period_month === period)
    .map((r) => {
      const basic = Number(r.basic_salary)
      const kpi = Number(r.commission_amount)
      const allowance = Number(r.statutory_allowance) + Number(r.non_statutory_allowance)
      const erStat = Number(r.epf_er) + Number(r.socso_er) + Number(r.eis_er)
      return {
        name: r.employee_name ?? '—',
        basic,
        kpi,
        allowance,
        erStat,
        total: basic + kpi + allowance + erStat,
      }
    })
    .sort((a, b) => b.total - a.total)

  const monthOpex = currentRows.reduce((s, r) => s + r.total, 0)

  return (
    <div>
      <div className="flex items-baseline justify-between mt-2 mb-8">
        <div>
          <p className="font-serif italic text-accent text-base mb-1">{dept.name}</p>
          <h1 className="font-serif text-3xl text-ink">OPEX</h1>
          <p className="font-mono text-xs text-muted mt-1">
            Period {dayjs(period).format('MMMM YYYY')} · {currentRows.length} staff
          </p>
        </div>
        <div className="text-right">
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
            Total OPEX (this month)
          </div>
          <div className="font-serif text-2xl text-ink mt-1">{formatMoney(monthOpex)}</div>
          <p className="font-serif italic text-muted text-xs mt-1">
            Basic + KPI + Allowance + ER Statutory
          </p>
        </div>
      </div>

      <section className="border border-hairline rounded-md bg-surface p-6 mb-10">
        <h2 className="font-serif text-lg text-ink mb-1">12-month trend</h2>
        <p className="font-serif italic text-graphite text-xs mb-4">
          Total monthly OPEX for {dept.name}
        </p>
        <OpexTrendChart data={trend} />
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink mb-1">Employee breakdown</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          {dayjs(period).format('MMMM YYYY')} · per-staff cost components
        </p>
        {currentRows.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No payroll posted for this period yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Employee</th>
                  <th className="text-right py-3 pr-4 font-medium">Basic</th>
                  <th className="text-right py-3 pr-4 font-medium">KPI</th>
                  <th className="text-right py-3 pr-4 font-medium">Allowance</th>
                  <th className="text-right py-3 pr-4 font-medium">ER Statutory</th>
                  <th className="text-right py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((r) => (
                  <tr key={r.name} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-serif text-ink">{r.name}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(r.basic)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(r.kpi)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(r.allowance)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(r.erStat)}
                    </td>
                    <td className="py-3 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(r.total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline">
                  <td className="py-3 pr-4 font-serif italic text-ink">Total</td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {formatMoney(currentRows.reduce((s, r) => s + r.basic, 0))}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {formatMoney(currentRows.reduce((s, r) => s + r.kpi, 0))}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {formatMoney(currentRows.reduce((s, r) => s + r.allowance, 0))}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {formatMoney(currentRows.reduce((s, r) => s + r.erStat, 0))}
                  </td>
                  <td className="py-3 text-right font-mono tabular font-medium text-accent">
                    {formatMoney(monthOpex)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
