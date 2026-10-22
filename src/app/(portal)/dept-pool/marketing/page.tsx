import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { requirePermission, requirePage } from '@/lib/auth'
import { listsPayrollByPerson } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import DeptPoolTabs from '../_components/DeptPoolTabs'
import HistoryTable from '../_components/HistoryTable'
import MarketingPnlView from '../_components/MarketingPnlView'
import { readsEveryPool } from '@/lib/surfaces'

interface Props {
  searchParams: Promise<{ tab?: string; filter?: string }>
}

export default async function MarketingDeptPoolPage({ searchParams }: Props) {
  await requirePage('/dept-pool/marketing')
  const user = await requirePermission('dept_pool')
  const supabase = await createClient()

  const { tab: rawTab, filter: rawFilter } = await searchParams
  const activeTab = rawTab === 'history' ? 'history' : rawTab === 'pnl' ? 'pnl' : 'overview'
  const historyFilter =
    rawFilter === 'in' ? 'in' : rawFilter === 'out' ? 'out' : 'all'

  // Find Marketing dept
  const { data: marketing } = await supabase
    .from('departments')
    .select('id, name')
    .eq('name', 'Marketing')
    .single()

  if (!marketing) notFound()

  // Whoever reads every department's pool (Marketing's own manager and their requests went with the Dept Manager,
  // 2026-10-17).
  if (!readsEveryPool(user)) notFound()

  const period = getPeriodMonth()

  // ── Overview-only data ─────────────────────────────────────────────────────
  // Compute NP (calculate_dept_np returns a single-row set)
  const { data: npData } = activeTab === 'overview'
    ? await supabase.rpc('calculate_dept_np', {
        p_dept_id: marketing.id,
        p_period: period,
      })
    : { data: null }
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

  // Running balance from the view
  const { data: balanceRow } = await supabase
    .from('dept_pool_balances')
    .select('balance')
    .eq('department_id', marketing.id)
    .maybeSingle()

  const balance = Number(balanceRow?.balance ?? 0)

  return (
    <div>
      <Link
        href="/dept-pool"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Dept Pools
      </Link>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · MARKETING POOL · {dayjs(period).format('MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Marketing</h1>
        </div>
      </div>

      <DeptPoolTabs basePath="/dept-pool/marketing" extraTabs={[{ key: 'pnl', label: 'P&L' }]} />

      {activeTab === 'overview' ? (
        <>
          {/* ───────── Hero balance + NP ───────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
            <div className="lg:col-span-7">
              <div className="font-serif italic text-graphite text-sm mb-1">
                Pool balance
              </div>
              <div className={`statement-amount ${balance < 0 ? 'text-danger' : 'text-num-ink'}`}>
                {formatMoney(balance)}
              </div>
              {balance === 0 ? <div className="font-mono text-xs text-muted mt-2">No NP or expenses booked yet</div> : null}
            </div>

            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <em className="font-serif text-graphite text-md">Revenue</em>
                <span className="num">{formatMoney(np.revenue)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <em className="font-serif text-graphite text-md">Staff cost</em>
                <span className="num">{formatMoney(-np.staff_cost)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <em className="font-serif text-graphite text-md">Dept expenses</em>
                <span className="num">{formatMoney(-np.expenses)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm border-t border-hairline pt-2 mt-2">
                <em className="font-serif text-ink text-md">Net profit</em>
                <span className={`num text-md ${np.net_profit < 0 ? 'neg' : 'text-num-ink'}`}>
                  {formatMoney(np.net_profit)}
                </span>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {activeTab === 'history' ? (
        <HistoryTable deptId={marketing.id} filter={historyFilter} seesPayroll={listsPayrollByPerson(user)} />
      ) : null}

      {activeTab === 'pnl' ? (
        <MarketingPnlView deptId={marketing.id} period={period} seesPayroll={listsPayrollByPerson(user)} />
      ) : null}
    </div>
  )
}
