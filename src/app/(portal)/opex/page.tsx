import dayjs from 'dayjs'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import OpexTrendChart from './_components/OpexTrendChart'
import LedgerRow from '@/components/LedgerRow'
import { canDo } from '@/lib/permission-actions'

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

interface Props {
  searchParams: Promise<{ dept?: string }>
}

export default async function OpexPage({ searchParams }: Props) {
  await requirePage('/opex')
  const user = await requirePermission('opex')
  const supabase = await createClient()

  // Whoever reads OPEX company-wide picks the department via ?dept= (unified
  // portal 2026-07-16); the Dept Manager's pin to their own went with the kind
  // (2026-10-17), so a reader short of All sees none. Venture Office is the
  // internal pool dept — no payroll, excluded like the dashboard does.
  if (!canDo(user, 'opex', 'view')) notFound()
  const { data: deptRows } = await supabase
    .from('departments')
    .select('id, name')
    .neq('name', 'Venture Office')
    .order('name')
  const allDepts = (deptRows ?? []) as { id: string; name: string }[]
  const { dept: deptParam } = await searchParams
  const deptId = allDepts.some((d) => d.id === deptParam) ? (deptParam as string) : allDepts[0]?.id ?? null
  if (!deptId) notFound()

  const { data: dept } = await supabase
    .from('departments')
    .select('name')
    .eq('id', deptId)
    .single()
  if (!dept) notFound()

  const period = getPeriodMonth()
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  // RPC bypasses RLS with its own check (Opex · View).
  // See migration 20260101000172_get_dept_opex_rows.sql.
  const { data: rowsRaw } = await supabase.rpc('get_dept_opex_rows', {
    p_dept_id: deptId,
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
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> {dept.name.toUpperCase()} · OPEX · {dayjs(period).format('MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">OPEX</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            <em>{currentRows.length} staff · period {dayjs(period).format('MMMM YYYY')}</em>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
            Total OPEX (this month)
          </div>
          <div className="statement-amount text-num-ink mt-1">{formatMoney(monthOpex)}</div>
          <p className="font-serif italic text-muted text-xs mt-1">
            Basic + KPI + Allowance + ER Statutory
          </p>
        </div>
      </div>

      {allDepts.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-8">
          {allDepts.map((d) => (
            <Link
              key={d.id}
              href={`/opex?dept=${d.id}`}
              className={
                d.id === deptId
                  ? 'border border-accent-border bg-accent-bg text-accent font-serif italic text-sm px-3 py-1 rounded-md'
                  : 'border border-hairline bg-surface text-graphite hover:text-ink hover:bg-surface-2 font-sans text-sm px-3 py-1 rounded-md transition-colors'
              }
            >
              {d.name}
            </Link>
          ))}
        </div>
      ) : null}

      <section className="border border-hairline rounded-md bg-surface p-6 mb-10">
        <h2 className="font-serif italic text-ink text-md mb-4">12-month trend</h2>
        <OpexTrendChart data={trend} />
      </section>

      <section>
        <div className="sect-head">
          <h2>Employee breakdown</h2>
          <span className="rule" aria-hidden />
          <span className="count">{currentRows.length} STAFF · BASIC · KPI · ALLOWANCE · ER STAT</span>
        </div>
        {currentRows.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No payroll posted for this period yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="right m-hide">Basic</th>
                  <th className="right m-hide">KPI</th>
                  <th className="right m-hide">Allowance</th>
                  <th className="right m-hide">ER Statutory</th>
                  <th className="right">Total</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {currentRows.map((r) => (
                  <LedgerRow key={r.name}>
                    <td>
                      <div className="font-serif text-ink">{r.name}</div>
                    </td>
                    <td className="num text-graphite m-hide" data-label="Basic">{formatMoney(r.basic)}</td>
                    <td className="num text-graphite m-hide" data-label="KPI">{formatMoney(r.kpi)}</td>
                    <td className="num text-graphite m-hide" data-label="Allowance">{formatMoney(r.allowance)}</td>
                    <td className="num text-graphite m-hide" data-label="ER Statutory">{formatMoney(r.erStat)}</td>
                    <td className="num">{formatMoney(r.total)}</td>
                  </LedgerRow>
                ))}
                {/* Summary row: no panel to open, but it still needs the
                    chevron column's placeholder so its Total stays under the
                    Total above it. */}
                <tr className="border-t-2 border-hairline bg-surface-2/40">
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num text-num-ink font-semibold m-hide">{formatMoney(currentRows.reduce((s, r) => s + r.basic, 0))}</td>
                  <td className="num text-num-ink font-semibold m-hide">{formatMoney(currentRows.reduce((s, r) => s + r.kpi, 0))}</td>
                  <td className="num text-num-ink font-semibold m-hide">{formatMoney(currentRows.reduce((s, r) => s + r.allowance, 0))}</td>
                  <td className="num text-num-ink font-semibold m-hide">{formatMoney(currentRows.reduce((s, r) => s + r.erStat, 0))}</td>
                  <td className="num text-accent font-semibold">{formatMoney(monthOpex)}</td>
                  <td className="lt-toggle" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
