import Link from 'next/link'
import dayjs from 'dayjs'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'

// dept_manager only owns their own dept pool. Skip the multi-dept list and
// land them straight on their own detail page — same content as clicking View.
const DEPT_NAME_TO_SLUG: Record<string, string> = {
  Marketing: 'marketing',
  HR: 'hr',
  Finance: 'finance',
  'Director Office': 'director-office',
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

  // Fast-path: dept_manager → their own dept detail page. No reason to show
  // a 1-row list and make them click View.
  if (user.role === 'dept_manager' && user.department_id) {
    const { data: ownDept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', user.department_id)
      .single()
    const slug = ownDept?.name ? DEPT_NAME_TO_SLUG[ownDept.name] : null
    if (slug) redirect(`/dept-pool/${slug === 'marketing' ? 'marketing' : slug}`)
  }

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

  // This-month In / Out per dept. Only Marketing runs on P&L semantics
  // (revenue - staff cost - expenses); the other 4 pools are pure ledger
  // movement so we show credits in / debits out directly from dept_pools.
  // Marketing's P&L breakdown still lives on /dept-pool/marketing.
  const periodStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
  const nextMonthStart = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')
  const { data: poolTxns } = await supabase
    .from('dept_pools')
    .select('department_id, transaction_type, amount')
    .gte('created_at', periodStart)
    .lt('created_at', nextMonthStart)

  const inOutByDept = new Map<string, { in_amt: number; out_amt: number }>()
  for (const t of poolTxns ?? []) {
    const key = t.department_id as string
    const cur = inOutByDept.get(key) ?? { in_amt: 0, out_amt: 0 }
    if (t.transaction_type === 'np_in') {
      cur.in_amt += Number(t.amount)
    } else if (t.transaction_type === 'expense_out') {
      cur.out_amt += Number(t.amount)
    }
    inOutByDept.set(key, cur)
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
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · POOL OVERVIEW
          </div>
          <h1 className="page-title">Department Pools</h1>
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
                  <th className="text-right py-3 pr-4 font-medium">In (this month)</th>
                  <th className="text-right py-3 pr-4 font-medium">Out (this month)</th>
                  <th className="text-right py-3 pr-4 font-medium">Net (this month)</th>
                  <th className="text-right py-3 pr-4 font-medium">Costing Submission</th>
                  <th className="py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((dept) => {
                  const balance = balanceMap.get(dept.id) ?? 0
                  const inOut = inOutByDept.get(dept.id) ?? { in_amt: 0, out_amt: 0 }
                  const net = inOut.in_amt - inOut.out_amt
                  // Director (the special director payout pool) has its own
                  // /director-pool view and does not get a generic detail page.
                  const slugByName: Record<string, string> = {
                    Marketing: 'marketing',
                    HR: 'hr',
                    Finance: 'finance',
                    'Director Office': 'director-office',
                  }
                  const slug = slugByName[dept.name]
                  const href = slug ? `/dept-pool/${slug}` : null
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
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(inOut.in_amt)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {formatMoney(inOut.out_amt)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={net >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(net)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {formatMoney(costingByDept.get(dept.id) ?? 0)}
                      </td>
                      <td className="py-3 text-right space-x-4">
                        {href ? (
                          <Link
                            href={href}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            View
                          </Link>
                        ) : null}
                        {dept.name === 'Marketing' && href ? (
                          <Link
                            href={`${href}?tab=pnl`}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            P&amp;L
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
