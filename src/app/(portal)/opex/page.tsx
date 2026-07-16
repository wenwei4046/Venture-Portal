import dayjs from 'dayjs'
import Link from 'next/link'
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

interface Props {
  searchParams: Promise<{ dept?: string }>
}

export default async function OpexPage({ searchParams }: Props) {
  const user = await requireRole(['dept_manager', 'principal'])
  const supabase = await createClient()

  // Dept Manager is pinned to their own department; Principal picks any
  // department via ?dept= (unified portal 2026-07-16). Venture Office is the
  // internal pool dept — no payroll, excluded like the dashboard does.
  let deptId = user.department_id
  let allDepts: { id: string; name: string }[] = []
  if (user.role === 'principal') {
    const { data: deptRows } = await supabase
      .from('departments')
      .select('id, name')
      .neq('name', 'Venture Office')
      .order('name')
    allDepts = (deptRows ?? []) as { id: string; name: string }[]
    const { dept: deptParam } = await searchParams
    deptId = allDepts.some((d) => d.id === deptParam)
      ? (deptParam as string)
      : allDepts[0]?.id ?? null
  }
  if (!deptId) notFound()

  const { data: dept } = await supabase
    .from('departments')
    .select('name')
    .eq('id', deptId)
    .single()
  if (!dept) notFound()

  const period = getPeriodMonth()
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  // RPC bypasses RLS with internal role check (own-dept for dept_manager).
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
          <div className="num text-num-ink text-2xl tracking-[-0.01em] mt-1">{formatMoney(monthOpex)}</div>
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
        <h2 className="font-serif italic text-ink text-md mb-1">12-month trend</h2>
        <p className="font-serif italic text-graphite text-xs mb-4">
          Total monthly OPEX for {dept.name}
        </p>
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
                  <th className="right">Basic</th>
                  <th className="right">KPI</th>
                  <th className="right">Allowance</th>
                  <th className="right">ER Statutory</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <div className="font-serif text-ink">{r.name}</div>
                    </td>
                    <td className="num text-graphite">{formatMoney(r.basic)}</td>
                    <td className="num text-graphite">{formatMoney(r.kpi)}</td>
                    <td className="num text-graphite">{formatMoney(r.allowance)}</td>
                    <td className="num text-graphite">{formatMoney(r.erStat)}</td>
                    <td className="num">{formatMoney(r.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline bg-surface-2/40">
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num text-num-ink font-semibold">{formatMoney(currentRows.reduce((s, r) => s + r.basic, 0))}</td>
                  <td className="num text-num-ink font-semibold">{formatMoney(currentRows.reduce((s, r) => s + r.kpi, 0))}</td>
                  <td className="num text-num-ink font-semibold">{formatMoney(currentRows.reduce((s, r) => s + r.allowance, 0))}</td>
                  <td className="num text-num-ink font-semibold">{formatMoney(currentRows.reduce((s, r) => s + r.erStat, 0))}</td>
                  <td className="num text-accent font-semibold">{formatMoney(monthOpex)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
