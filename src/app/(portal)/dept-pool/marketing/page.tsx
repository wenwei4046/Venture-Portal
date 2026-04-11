import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import ExpenseForm from '../_components/ExpenseForm'

export default async function MarketingDeptPoolPage() {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  // Find Marketing dept
  const { data: marketing } = await supabase
    .from('departments')
    .select('id, name')
    .eq('name', 'Marketing')
    .single()

  if (!marketing) notFound()

  // Dept Manager restriction: must be Marketing's manager
  if (user.role === 'dept_manager' && user.department_id !== marketing.id) {
    notFound()
  }

  const period = getPeriodMonth()

  // Compute NP (calculate_dept_np returns a single-row set)
  const { data: npData } = await supabase.rpc('calculate_dept_np', {
    p_dept_id: marketing.id,
    p_period: period,
  })
  const npRow = ((npData ?? []) as unknown as Array<{
    out_revenue: number | string
    out_staff_cost: number | string
    out_expenses: number | string
    out_net_profit: number | string
  }>)[0]

  const np = {
    revenue: Number(npRow?.out_revenue ?? 0),
    staff_cost: Number(npRow?.out_staff_cost ?? 0),
    expenses: Number(npRow?.out_expenses ?? 0),
    net_profit: Number(npRow?.out_net_profit ?? 0),
  }

  // Expense history (approved + dept pool rows)
  const { data: poolRows } = await supabase
    .from('dept_pools')
    .select('id, transaction_type, amount, period_month, description, created_at, approval_id')
    .eq('department_id', marketing.id)
    .eq('transaction_type', 'expense_out')
    .order('created_at', { ascending: false })
    .limit(20)

  // Pending dept expenses: approval_requests with request_type='dept_expense'
  // + reference_id=marketing.id + status='pending'
  const { data: pendingExpenses } = await supabase
    .from('approval_requests')
    .select('id, description, amount, submitted_by, created_at')
    .eq('request_type', 'dept_expense')
    .eq('reference_id', marketing.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  // Running balance from the view
  const { data: balanceRow } = await supabase
    .from('dept_pool_balances')
    .select('balance')
    .eq('department_id', marketing.id)
    .maybeSingle()

  const balance = Number(balanceRow?.balance ?? 0)

  const canSubmitExpense = user.role === 'dept_manager' && user.department_id === marketing.id

  return (
    <div>
      <Link
        href="/dept-pool"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Dept Pools
      </Link>

      {/* ───────── Header ───────── */}
      <div className="flex items-baseline justify-between mt-3 mb-10">
        <div>
          <p className="font-serif italic text-accent text-base mb-1">
            Department pool
          </p>
          <h1 className="font-serif text-3xl text-ink">Marketing</h1>
          <p className="font-mono text-xs text-muted mt-1">
            Period {dayjs(period).format('MMMM YYYY')}
          </p>
        </div>
      </div>

      {/* ───────── Hero balance + NP ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-graphite text-sm mb-1">
            Pool balance
          </div>
          <div className="font-serif text-hero leading-none">
            <span className={balance < 0 ? 'text-danger' : 'text-ink'}>
              {formatMoney(balance)}
            </span>
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {balance === 0
              ? 'No NP or expenses booked yet'
              : `Running balance after ${(poolRows ?? []).length} expense entr${
                  (poolRows ?? []).length === 1 ? 'y' : 'ies'
                }`}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-baseline justify-between font-mono text-sm">
            <em className="font-serif text-graphite text-md">Revenue</em>
            <span className="text-ink tabular">{formatMoney(np.revenue)}</span>
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm">
            <em className="font-serif text-graphite text-md">Staff cost</em>
            <span className="text-ink tabular">{formatMoney(-np.staff_cost)}</span>
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm">
            <em className="font-serif text-graphite text-md">Dept expenses</em>
            <span className="text-ink tabular">{formatMoney(-np.expenses)}</span>
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm border-t border-hairline pt-2 mt-2">
            <em className="font-serif text-ink text-md">Net profit</em>
            <span className={`font-serif italic text-md ${np.net_profit < 0 ? 'text-danger' : 'text-ink'}`}>
              {formatMoney(np.net_profit)}
            </span>
          </div>
        </div>
      </div>

      {/* ───────── Pending expenses ───────── */}
      {(pendingExpenses ?? []).length > 0 ? (
        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-1">Pending approval</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Awaiting Principal sign-off. Approved items appear in the history below.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Submitted</th>
                  <th className="text-left py-3 pr-4 font-medium">Description</th>
                  <th className="text-right py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(pendingExpenses ?? []).map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {dayjs(p.created_at).format('D MMM YYYY HH:mm')}
                    </td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">
                      {p.description ?? '—'}
                    </td>
                    <td className="py-3 text-right font-mono tabular font-medium text-alert">
                      {p.amount != null ? formatMoney(Number(p.amount)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ───────── Expense history ───────── */}
      <section className="mb-10">
        <h2 className="font-serif text-xl text-ink mb-1">Expense history</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Approved expenses posted to the dept pool.
        </p>
        {(poolRows ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No approved expenses yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Date</th>
                  <th className="text-left py-3 pr-4 font-medium">Description</th>
                  <th className="text-left py-3 pr-4 font-medium">Period</th>
                  <th className="text-right py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(poolRows ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {dayjs(row.created_at).format('D MMM YYYY')}
                    </td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">
                      {row.description ?? '—'}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {row.period_month ? dayjs(row.period_month).format('MMM YYYY') : '—'}
                    </td>
                    <td className="py-3 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(-Number(row.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────── New expense form (Dept Manager only) ───────── */}
      {canSubmitExpense ? (
        <section className="border-t border-hairline pt-8">
          <h2 className="font-serif text-xl text-ink mb-1">New expense</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Submit a new department expense for Principal approval.
          </p>
          <ExpenseForm />
        </section>
      ) : null}
    </div>
  )
}
