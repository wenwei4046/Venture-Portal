import Link from 'next/link'
import dayjs from 'dayjs'
import { officeDayStart } from '@/lib/office-time'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { canSeePayrollPayouts } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import DeptPoolTabs from '../_components/DeptPoolTabs'
import HistoryTable from '../_components/HistoryTable'
import DeptPnlView from '../_components/DeptPnlView'

// Slug → dept name. Director (the special director payout pool) is intentionally
// excluded — it has its own /director-pool view and is not a regular dept pool.
const SLUG_TO_NAME: Record<string, string> = {
  hr: 'HR',
  finance: 'Finance',
  'director-office': 'Director Office',
}

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string; filter?: string }>
}

export default async function DeptPoolDetailPage({ params, searchParams }: Props) {
  const user = await requirePermission('dept_pool')
  const { slug } = await params
  const deptName = SLUG_TO_NAME[slug]
  if (!deptName) notFound()

  const { tab: rawTab, filter: rawFilter } = await searchParams
  const activeTab = rawTab === 'history' ? 'history' : rawTab === 'pnl' ? 'pnl' : 'overview'
  const historyFilter =
    rawFilter === 'in' ? 'in' : rawFilter === 'out' ? 'out' : 'all'

  const supabase = await createClient()
  const { data: dept } = await supabase
    .from('departments')
    .select('id, name')
    .eq('name', deptName)
    .single()
  if (!dept) notFound()

  // Dept Manager restriction: must be their own dept
  if (user.role === 'dept_manager' && user.department_id !== dept.id) {
    notFound()
  }

  const period = getPeriodMonth()
  const isOwnDept = user.department_id === dept.id

  // Balance from the view
  const { data: balanceRow } = await supabase
    .from('dept_pool_balances')
    .select('balance')
    .eq('department_id', dept.id)
    .maybeSingle()
  const balance = Number(balanceRow?.balance ?? 0)

  // This-month In / Out for Overview tab
  let monthIn = 0
  let monthOut = 0
  if (activeTab === 'overview') {
    const periodStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
    const nextMonthStart = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')
    const { data: monthRows } = await supabase
      .from('dept_pools')
      .select('transaction_type, amount')
      .eq('department_id', dept.id)
      // By the office's calendar: a bare date is UTC midnight to the database.
      .gte('created_at', officeDayStart(periodStart))
      .lt('created_at', officeDayStart(nextMonthStart))
    for (const r of monthRows ?? []) {
      if (r.transaction_type === 'np_in') monthIn += Number(r.amount)
      else if (r.transaction_type === 'expense_out' || r.transaction_type === 'inter_billing_out') {
        // 'inter_billing_out' (mig 255) is the paying-side mirror of an
        // inter-billing settlement — folded into Out alongside expense_out.
        monthOut += Number(r.amount)
      }
    }
  }

  return (
    <div>
      <Link
        href="/dept-pool"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Dept Pools
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · {dept.name.toUpperCase()} POOL · {dayjs(period).format('MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">{dept.name}</h1>
        </div>
      </div>

      <DeptPoolTabs
        basePath={`/dept-pool/${slug}`}
        role={user.role}
        isOwnDept={isOwnDept}
        extraTabs={[{ key: 'pnl', label: 'P&L' }]}
      />

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
          <div className="lg:col-span-7">
            <div className="font-serif italic text-graphite text-sm mb-1">Pool balance</div>
            <div className={`statement-amount ${balance < 0 ? 'text-danger' : 'text-num-ink'}`}>
              {formatMoney(balance)}
            </div>
            <div className="font-mono text-xs text-muted mt-2">
              {balance === 0 ? 'No movements yet' : 'Running balance — see History tab for full ledger'}
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
              <span className={`num text-md ${monthIn - monthOut < 0 ? 'neg' : 'text-num-ink'}`}>
                {formatMoney(monthIn - monthOut)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'history' ? (
        <HistoryTable deptId={dept.id} filter={historyFilter} seesPayroll={canSeePayrollPayouts(user)} />
      ) : null}

      {activeTab === 'pnl' ? (
        <DeptPnlView deptId={dept.id} deptName={dept.name} period={period} />
      ) : null}
    </div>
  )
}
