import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'

interface DeptNPRow {
  department_id: string
  period_month: string
  revenue: number
  staff_cost: number
  expenses: number
  net_profit: number
}

interface DeptNPRpcRow {
  out_department_id: string
  out_period_month: string
  out_revenue: number | string
  out_staff_cost: number | string
  out_expenses: number | string
  out_net_profit: number | string
}

interface HRCostSubmissionRow {
  id: string
  period_month: string
  submitted_at: string
  submitted_by_name: string | null
  execution_state: string
  dept_summaries: Record<string, { total_ctc?: number; department_id?: string }> | null
}

export default async function DeptPoolPage() {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  const period = getPeriodMonth()

  // Load departments
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .order('name')

  // Dept Manager sees only their own dept
  let visible = departments ?? []
  if (user.role === 'dept_manager') {
    visible = visible.filter((d) => d.id === user.department_id)
  }

  // Load balances — all 5 Dept Pools live in dept_pool_balances after the
  // Stage-6 unification (HR / Finance / Director Office migrated from
  // operating_pools into dept_pools).
  const { data: balances } = await supabase
    .from('dept_pool_balances')
    .select('department_id, balance')

  const balanceMap = new Map(
    (balances ?? []).map((b) => [b.department_id as string, Number(b.balance)])
  )

  // Compute NP for each visible dept for the current period.
  // calculate_dept_np returns a single-row set; Supabase wraps it in an array.
  const npByDept = new Map<string, DeptNPRow>()
  for (const dept of visible) {
    const { data } = await supabase.rpc('calculate_dept_np', {
      p_dept_id: dept.id,
      p_period: period,
    })
    const row = ((data ?? []) as unknown as DeptNPRpcRow[])[0]
    if (row) {
      npByDept.set(dept.id, {
        department_id: row.out_department_id,
        period_month: row.out_period_month,
        revenue: Number(row.out_revenue ?? 0),
        staff_cost: Number(row.out_staff_cost ?? 0),
        expenses: Number(row.out_expenses ?? 0),
        net_profit: Number(row.out_net_profit ?? 0),
      })
    }
  }

  // Lifetime sum of approved HR cost submissions per dept. Only count
  // submissions Principal has approved — pending snapshots shouldn't flow
  // into the Dept Pool total yet.
  const { data: submissionsRaw } = await supabase.rpc('get_hr_cost_submissions_list')
  const submissions = (submissionsRaw ?? []) as unknown as HRCostSubmissionRow[]
  const costingByDept = new Map<string, number>()
  for (const sub of submissions) {
    if (sub.execution_state === 'pending') continue
    const entries = Object.entries(sub.dept_summaries ?? {})
    for (const [, info] of entries) {
      const deptId = info?.department_id
      const ctc = Number(info?.total_ctc ?? 0)
      if (!deptId || !Number.isFinite(ctc)) continue
      costingByDept.set(deptId, (costingByDept.get(deptId) ?? 0) + ctc)
    }
  }

  const totalDeployed = Array.from(balanceMap.values()).reduce(
    (acc, b) => acc + (b > 0 ? b : 0),
    0
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Department Pools</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Running balance per department — credits from invoice settlement + P&amp;L, debits from payroll + expenses.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/dept-pool/submissions"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Past Month Submission
          </Link>
          {user.role === 'dept_manager' ? (
            <Link
              href="/dept-pool/contracts/new"
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors"
            >
              New project contract
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Hero totals ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Total pool deployed to Treasury
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {formatMoney(totalDeployed)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {visible.length} department{visible.length === 1 ? '' : 's'} visible · Period{' '}
            {dayjs(period).format('MMMM YYYY')}
          </div>
        </div>
      </div>

      {/* ───────── By department ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">By department</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Balance = running NP - expenses. <em>NP trend</em> updates once revenue and approved expenses flow in.
        </p>

        {visible.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No departments visible to your role.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Department</th>
                  <th className="text-right py-3 pr-4 font-medium">Balance</th>
                  <th className="text-right py-3 pr-4 font-medium">Revenue</th>
                  <th className="text-right py-3 pr-4 font-medium">Staff cost</th>
                  <th className="text-right py-3 pr-4 font-medium">Expenses</th>
                  <th className="text-right py-3 pr-4 font-medium">This month NP</th>
                  <th className="text-right py-3 pr-4 font-medium">Costing Submission</th>
                  <th className="py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((dept) => {
                  const balance = balanceMap.get(dept.id) ?? 0
                  const np = npByDept.get(dept.id)
                  const isMarketing = dept.name === 'Marketing'
                  const href = isMarketing ? '/dept-pool/marketing' : null
                  return (
                    <tr
                      key={dept.id}
                      className="border-b border-hairline last:border-0"
                    >
                      <td className="py-3 pr-4 font-serif text-md text-ink">
                        {dept.name}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(balance)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">
                        {formatMoney(np?.revenue ?? 0)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">
                        {formatMoney(np?.staff_cost ?? 0)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">
                        {formatMoney(np?.expenses ?? 0)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        {np ? (
                          <span className={np.net_profit >= 0 ? 'text-ink' : 'text-danger'}>
                            {formatMoney(np.net_profit)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {formatMoney(costingByDept.get(dept.id) ?? 0)}
                      </td>
                      <td className="py-3 text-right">
                        {href ? (
                          <Link
                            href={href}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            View
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="font-serif italic text-muted text-xs">
        All 5 Dept Pools share the same model: invoices settled + P&amp;L in, payroll consolidation + expenses out.
      </p>
    </div>
  )
}
