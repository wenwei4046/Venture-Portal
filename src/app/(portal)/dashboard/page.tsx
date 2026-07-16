import Link from 'next/link'
import dayjs from 'dayjs'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatMoneyBare } from '@/lib/utils'

// Always re-fetch on request — dept pool balances change after every approve
// & pay, so cached renders go stale within seconds.
export const dynamic = 'force-dynamic'

type Subsidiary = {
  id: string
  name: string
  short_code: string
  tier: string
  savings_deposited: number
  loans_outstanding: number
  net_position: number
  position: 'creditor' | 'debtor' | 'even'
  has_overdue: boolean
}

type PendingApproval = {
  id: string
  request_type: string
  description: string | null
  amount: number | null
  submitted_by_name: string | null
  created_at: string
}

// payroll_run keeps its own read-only detail page (4-OPEX drill-down) at
// /approvals/payroll-run/[ref]; everything else uses the generic
// /approvals/[id] route. NOTE: payroll_run no longer enters the live approval
// queue (submit creates the run already-approved), so this branch only fires
// for legacy/read-only deep-links — the /approvals/page.tsx helper dropped it.
function approvalHref(req: {
  id: string
  request_type: string
  reference_id?: string | null
}): string {
  if (req.request_type === 'payroll_run' && req.reference_id) {
    return `/approvals/payroll-run/${req.reference_id}`
  }
  return `/approvals/${req.id}`
}

type Alert = {
  type: 'overdue' | 'buffer' | 'maturity'
  severity: 'danger' | 'warning' | 'info'
  message: string
}

type MarketingNp = {
  period_month: string
  revenue: number
  staff_cost: number
  expenses: number
  net_profit: number
}

type PoolBreakdown = {
  fund_sources: number
  dept_pool: number
  venture_pool: number
  total: number
}

type FundSourceBreakdownItem = {
  source_type: string
  count: number
  amount: number
}

type DeptPoolBreakdownItem = {
  department_id: string
  department_name: string
  balance: number
}

type DashboardSummary = {
  role: 'principal' | 'finance' | 'hr' | 'dept_manager'
  total_pool: number
  fund_sources_total: number
  loans_outstanding: number
  weighted_cost_rate: number | null
  current_base_rate: number | null
  net_spread: number | null
  monthly_interest_income: number
  monthly_interest_expense: number
  net_interest_income: number
  pending_approvals_count: number | null
  pending_approvals: PendingApproval[] | null
  subsidiaries: Subsidiary[]
  alerts: Alert[]
  // Phase 2 extensions
  dept_pool_total: number
  billing_float: number
  marketing_np_this_month: MarketingNp
  // Phase 3 extensions
  salary_pool_total: number | null
  payouts_pending: number | null
  hv_fund_balance: number | null
  invoice_pool_balance: number | null
  total_advance: number | null
  total_saving: number | null
  // Phase 4 extensions
  pool_breakdown: PoolBreakdown
  fund_source_breakdown: FundSourceBreakdownItem[]
  dept_pool_breakdown: DeptPoolBreakdownItem[]
}

export default async function DashboardPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  // HR / Dept Manager dashboards branch on the APP-LAYER role (user.role) so
  // the Principal's view-as mask is honoured — dashboard_summary()'s own gate
  // keys off current_user_role(), the real DB role, so a masked Principal
  // would otherwise always land on the treasury dashboard.
  const roleDashboard = user.role === 'hr' || user.role === 'dept_manager'

  const { data: raw, error } = roleDashboard
    ? { data: null, error: null }
    : await supabase.rpc('dashboard_summary')
  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif italic text-danger">Failed to load dashboard.</p>
        <p className="font-mono text-xs text-muted mt-2">{error.message}</p>
      </div>
    )
  }

  // The RPC also returns { error: 'Access denied' } for a real HR/dept_manager
  // session (not a Supabase error) — kept as a belt-and-braces fallback.
  if (roleDashboard || (raw && typeof raw === 'object' && 'error' in raw && (raw as Record<string, unknown>).error === 'Access denied')) {
    const userRole = user.role

    if (userRole === 'hr') {
      // HR Dashboard — data overview. Under the post-mig-278 flow HR's job is
      // three actions (Import Employment List · Import Payroll · Calculate
      // Director Salary), so the dashboard is three entry cards over the live
      // HR figures. One RPC round-trip (hr_dashboard_summary, mig 283).
      const period = dayjs().startOf('month').format('YYYY-MM-DD')
      const periodUrl = `/hr-costing/payroll/${period}`

      const { data: hrRaw } = await supabase.rpc('hr_dashboard_summary')

      type HrDeptStaff = {
        department_id: string
        department_name: string
        staff_count: number
        total_basic: number
      }
      type HrPayrollDept = {
        department_name: string
        staff_count: number
        basic: number
        statutory_er: number
        statutory_ee: number
        gross: number
        net: number
      }
      type HrDashboard = {
        period: string
        staff: { total_count: number; departments: HrDeptStaff[] }
        payroll: {
          run: { status: string; total_amount: number; submitted_at: string | null; approved_at: string | null } | null
          rows_count: number
          draft_count: number
          by_department: HrPayrollDept[]
        }
        director: {
          payout_count: number
          status: 'not_calculated' | 'draft' | 'confirmed'
          payout_mode: 'split' | 'fully_paid' | null
          total_gross: number
          total_saving: number
          total_payroll_net: number
          total_invoice: number
          submission: { submitted_at: string; total_gross: number; director_count: number } | null
        }
        hr_pool_balance: number
      }
      const hr = hrRaw as unknown as HrDashboard

      const staffCount = Number(hr?.staff?.total_count ?? 0)
      const staffDepts = hr?.staff?.departments ?? []
      const payrollRows = Number(hr?.payroll?.rows_count ?? 0)
      const draftCount = Number(hr?.payroll?.draft_count ?? 0)
      const run = hr?.payroll?.run ?? null
      const payrollDepts = hr?.payroll?.by_department ?? []
      const director = hr?.director
      const poolBalance = Number(hr?.hr_pool_balance ?? 0)

      const payrollTotals = payrollDepts.reduce(
        (acc, d) => ({
          staff: acc.staff + Number(d.staff_count ?? 0),
          basic: acc.basic + Number(d.basic ?? 0),
          statutory: acc.statutory + Number(d.statutory_er ?? 0) + Number(d.statutory_ee ?? 0),
          gross: acc.gross + Number(d.gross ?? 0),
          net: acc.net + Number(d.net ?? 0),
        }),
        { staff: 0, basic: 0, statutory: 0, gross: 0, net: 0 },
      )

      const runSubmitted = run?.status === 'approved' || run?.status === 'paid' || run?.status === 'submitted'
      const directorStatus = director?.status ?? 'not_calculated'
      const directorSubmitted = Boolean(director?.submission)

      return (
        <div>
          <div className="page-head">
            <div>
              <div className="page-eyebrow">
                <em>II.</em> HR · OVERVIEW
              </div>
              <h1 className="page-title">HR Overview</h1>
              <p className="font-serif italic text-graphite text-base mt-3">
                {dayjs().format('MMMM YYYY')}
              </p>
            </div>
            <Link
              href="/hr-costing/payment"
              className="shrink-0 border border-hairline bg-surface hover:bg-surface-2 rounded-md px-5 py-3 transition-colors block text-right"
            >
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">HR Pool balance</div>
              <div className={`num text-xl mt-0.5 ${poolBalance < 0 ? 'neg' : ''}`}>
                {formatMoney(poolBalance)}
              </div>
              <div className="font-sans text-[11px] text-muted mt-0.5">Open Payment →</div>
            </Link>
          </div>

          {/* Three entry points — the whole HR job under the direct-submit flow */}
          <section className="mb-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ActionCard
                n="I"
                title="Employment List"
                status={staffCount > 0 ? `${staffCount} active staff · ${staffDepts.length} dept${staffDepts.length === 1 ? '' : 's'}` : 'No staff yet'}
                statusTone={staffCount > 0 ? 'ok' : 'idle'}
                ctaLabel={staffCount > 0 ? 'Manage / re-import →' : 'Import Employment List →'}
                ctaHref="/hr-costing/staff"
              />
              <ActionCard
                n="II"
                title="Import Payroll"
                status={
                  payrollRows === 0
                    ? 'Not imported this month'
                    : runSubmitted
                      ? `Submitted to Finance · RM ${formatMoneyBare(Number(run?.total_amount ?? 0))}`
                      : `${payrollRows} row${payrollRows === 1 ? '' : 's'} · ${draftCount} draft`
                }
                statusTone={payrollRows === 0 ? 'idle' : runSubmitted ? 'ok' : 'warn'}
                ctaLabel={payrollRows === 0 ? 'Import Payroll →' : 'Open grid →'}
                ctaHref={periodUrl}
              />
              <ActionCard
                n="III"
                title="Director Salary"
                status={
                  directorStatus === 'not_calculated'
                    ? 'Not calculated'
                    : `${directorStatus === 'confirmed' ? 'Confirmed' : 'Draft'}${director?.payout_mode === 'fully_paid' ? ' · Fully Paid' : director?.payout_mode === 'split' ? ' · 75/25 Split' : ''}${directorSubmitted ? ' · Submitted ✓' : ''}`
                }
                statusTone={directorStatus === 'not_calculated' ? 'idle' : directorStatus === 'confirmed' ? 'ok' : 'warn'}
                ctaLabel={directorStatus === 'not_calculated' ? 'Calculate →' : 'Open Director Salary →'}
                ctaHref="/director-salary"
              />
            </div>
          </section>

          {/* This month's payroll, per department */}
          <section className="mb-12">
            <div className="sect-head">
              <h2>This Month · Payroll</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {payrollRows} ROW{payrollRows === 1 ? '' : 'S'} · {run?.status ? run.status.toUpperCase() : 'NO RUN'}
              </span>
            </div>
            {payrollDepts.length === 0 ? (
              <div className="border border-hairline rounded-md bg-surface p-6">
                <p className="font-serif italic text-graphite text-base">
                  No payroll imported for {dayjs().format('MMMM YYYY')} yet.
                </p>
                <Link href={periodUrl} className="font-serif italic text-sm text-accent hover:text-accent-hover">
                  Import Payroll →
                </Link>
              </div>
            ) : (
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="num">Staff</th>
                    <th className="num">Basic</th>
                    <th className="num">Statutory</th>
                    <th className="num">Gross</th>
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollDepts.map((d) => (
                    <tr key={d.department_name}>
                      <td>{d.department_name}</td>
                      <td className="num">{d.staff_count}</td>
                      <td className="num">{formatMoneyBare(Number(d.basic))}</td>
                      <td className="num">{formatMoneyBare(Number(d.statutory_er) + Number(d.statutory_ee))}</td>
                      <td className="num">{formatMoneyBare(Number(d.gross))}</td>
                      <td className="num">{formatMoneyBare(Number(d.net))}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td>Total</td>
                    <td className="num">{payrollTotals.staff}</td>
                    <td className="num">{formatMoneyBare(payrollTotals.basic)}</td>
                    <td className="num">{formatMoneyBare(payrollTotals.statutory)}</td>
                    <td className="num">{formatMoneyBare(payrollTotals.gross)}</td>
                    <td className="num">{formatMoneyBare(payrollTotals.net)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Staff master, per department */}
          {staffDepts.length > 0 ? (
            <section className="mb-12">
              <div className="sect-head">
                <h2>Staff Master</h2>
                <span className="rule" aria-hidden />
                <span className="count">{staffCount} ACTIVE</span>
              </div>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="num">Staff</th>
                    <th className="num">Total Basic</th>
                  </tr>
                </thead>
                <tbody>
                  {staffDepts.map((d) => (
                    <tr key={d.department_id}>
                      <td>{d.department_name}</td>
                      <td className="num">{d.staff_count}</td>
                      <td className="num">{formatMoneyBare(Number(d.total_basic))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Director salary status strip */}
          <section className="mb-12">
            <div className="sect-head">
              <h2>Director Salary · {dayjs().format('MMMM')}</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {director?.payout_count ?? 0} DIRECTOR{(director?.payout_count ?? 0) === 1 ? '' : 'S'}
              </span>
            </div>
            {directorStatus === 'not_calculated' ? (
              <div className="border border-hairline rounded-md bg-surface p-6">
                <p className="font-serif italic text-graphite text-base">
                  Not calculated for {dayjs().format('MMMM YYYY')} yet.
                </p>
                <Link href="/director-salary" className="font-serif italic text-sm text-accent hover:text-accent-hover">
                  Calculate Director Salary →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border border-hairline rounded-md bg-surface p-5">
                  <div className="font-serif italic text-accent text-sm mb-1">Status</div>
                  <div className={`font-serif italic text-lg leading-none ${directorStatus === 'confirmed' ? 'text-ledger' : 'text-alert'}`}>
                    {directorStatus === 'confirmed' ? 'Confirmed' : 'Draft'}
                  </div>
                  <div className="font-mono text-xs text-muted mt-2">
                    {director?.payout_mode === 'fully_paid' ? 'Fully Paid mode' : '75/25 split mode'}
                    {directorSubmitted ? ' · submitted to Finance' : ''}
                  </div>
                </div>
                <div className="border border-hairline rounded-md bg-surface p-5">
                  <div className="font-serif italic text-accent text-sm mb-1">Total gross</div>
                  <div className="font-serif text-2xl text-num-ink tabular tracking-[-0.01em] leading-none">
                    {formatMoney(Number(director?.total_gross ?? 0))}
                  </div>
                  <div className="font-mono text-xs text-muted mt-2">
                    saving {formatMoneyBare(Number(director?.total_saving ?? 0))}
                  </div>
                </div>
                <div className="border border-hairline rounded-md bg-surface p-5">
                  <div className="font-serif italic text-accent text-sm mb-1">Payroll net</div>
                  <div className="font-serif text-2xl text-num-ink tabular tracking-[-0.01em] leading-none">
                    {formatMoney(Number(director?.total_payroll_net ?? 0))}
                  </div>
                  <div className="font-mono text-xs text-muted mt-2">paid via payroll</div>
                </div>
                <div className="border border-hairline rounded-md bg-surface p-5">
                  <div className="font-serif italic text-accent text-sm mb-1">Invoice total</div>
                  <div className="font-serif text-2xl text-num-ink tabular tracking-[-0.01em] leading-none">
                    {formatMoney(Number(director?.total_invoice ?? 0))}
                  </div>
                  <div className="font-mono text-xs text-muted mt-2">
                    {director?.payout_mode === 'fully_paid' ? 'n/a in Fully Paid mode' : '25% outsource accumulation'}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )
    }

    if (userRole === 'dept_manager') {
      // Dept Manager Dashboard — shows the manager's own department pool
      // state + their submitted expense requests awaiting Principal sign-off.
      if (!user.department_id) {
        return (
          <div className="py-16 text-center">
            <p className="font-serif italic text-2xl text-ink mb-2">Dashboard</p>
            <p className="font-serif italic text-graphite">
              No department assigned. Contact Principal to set this up.
            </p>
          </div>
        )
      }

      const period = dayjs().startOf('month').format('YYYY-MM-DD')

      const { data: dept } = await supabase
        .from('departments')
        .select('id, name')
        .eq('id', user.department_id)
        .single()

      if (!dept) {
        return (
          <div className="py-16 text-center">
            <p className="font-serif italic text-2xl text-ink mb-2">Dashboard</p>
            <p className="font-serif italic text-graphite">Department not found.</p>
          </div>
        )
      }

      const [
        { data: npData },
        { data: balanceRow },
        { data: pendingSubmissions },
        { data: recentExpenses },
      ] = await Promise.all([
        supabase.rpc('calculate_dept_np', { p_dept_id: dept.id, p_period: period }),
        supabase.from('dept_pool_balances').select('balance').eq('department_id', dept.id).maybeSingle(),
        supabase
          .from('approval_requests')
          .select('id, request_type, description, amount, created_at')
          .eq('submitted_by', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('dept_pools')
          .select('id, amount, description, created_at')
          .eq('department_id', dept.id)
          .eq('transaction_type', 'expense_out')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      type NpRow = {
        out_revenue: number | string
        out_staff_cost: number | string
        out_expenses: number | string
        out_net_profit: number | string
      }
      const npRow = ((npData ?? []) as unknown as NpRow[])[0]
      const np = {
        revenue: Number(npRow?.out_revenue ?? 0),
        staff_cost: Number(npRow?.out_staff_cost ?? 0),
        expenses: Number(npRow?.out_expenses ?? 0),
        net_profit: Number(npRow?.out_net_profit ?? 0),
      }
      const balance = Number(balanceRow?.balance ?? 0)
      const pendingList = pendingSubmissions ?? []
      const pendingCount = pendingList.length
      const pendingTotal = pendingList.reduce((s, r) => s + Number(r.amount ?? 0), 0)
      const recentList = recentExpenses ?? []
      const deptDetailHref =
        dept.name.toLowerCase() === 'marketing' ? '/dept-pool/marketing' : '/dept-pool'

      return (
        <div>
          <div className="page-head">
            <div>
              <div className="page-eyebrow">
                <em>·</em> {dept.name.toUpperCase()} · OVERVIEW
              </div>
              <h1 className="page-title">{dept.name} Department</h1>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-sm text-accent mb-1">
                Pool balance
              </div>
              <div className={`font-serif text-2xl tabular tracking-[-0.01em] leading-none ${balance < 0 ? 'text-danger' : 'text-num-ink'}`}>
                {formatMoney(balance)}
              </div>
              <div className="font-mono text-xs text-muted mt-2">
                running NP − approved expenses
              </div>
            </div>
            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-sm text-accent mb-1">
                Revenue {dayjs(period).format('MMM')}
              </div>
              <div className="font-serif text-2xl text-num-ink tabular tracking-[-0.01em] leading-none">
                {formatMoney(np.revenue)}
              </div>
              <div className="font-mono text-xs text-muted mt-2">
                from approved project invoices
              </div>
            </div>
            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-sm text-accent mb-1">
                This month NP
              </div>
              <div className={`font-serif text-2xl tabular tracking-[-0.01em] leading-none ${np.net_profit < 0 ? 'text-danger' : 'text-num-ink'}`}>
                {formatMoney(np.net_profit)}
              </div>
              <div className="font-mono text-xs text-muted mt-2">
                revenue − staff cost − expenses
              </div>
            </div>
            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-sm text-accent mb-1">
                Awaiting Principal
              </div>
              <div className="font-serif text-3xl text-num-ink tabular leading-none">
                {pendingCount}
              </div>
              <div className="font-mono text-xs text-muted mt-2">
                {pendingCount > 0
                  ? `${formatMoney(pendingTotal)} total`
                  : 'Nothing waiting'}
              </div>
            </div>
          </div>

          {/* Your submissions awaiting Principal sign-off */}
          <section className="mb-12">
            <div className="sect-head">
              <h2>Awaiting Principal sign-off</h2>
              <span className="rule" aria-hidden />
              <span className="count">{pendingCount} REQUEST{pendingCount === 1 ? '' : 'S'} · POSTS TO POOL ONCE APPROVED</span>
            </div>
            {pendingCount === 0 ? (
              <div className="border border-hairline rounded-md bg-surface p-6">
                <p className="font-serif italic text-ledger text-base">All caught up.</p>
                <p className="font-mono text-xs text-muted mt-1">
                  Nothing waiting on Principal.
                </p>
              </div>
            ) : (
              <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
                {pendingList.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    href={deptDetailHref}
                    className="flex items-baseline justify-between px-5 py-4 hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-accent mb-1">
                        {r.request_type.replace(/_/g, ' ')}
                      </div>
                      <div className="font-serif italic text-graphite text-sm truncate">
                        {r.description ?? '—'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="num">{formatMoney(Number(r.amount))}</span>
                      <div className="font-mono text-xs text-muted">
                        {dayjs(r.created_at).format('D MMM')}
                      </div>
                    </div>
                  </Link>
                ))}
                {pendingList.length > 5 ? (
                  <Link
                    href={deptDetailHref}
                    className="block text-center px-5 py-3 font-serif italic text-sm text-accent hover:text-accent-hover"
                  >
                    See all {pendingList.length} →
                  </Link>
                ) : null}
              </div>
            )}
          </section>

          {/* Recent approved expenses */}
          <section className="mb-12">
            <div className="sect-head">
              <h2>Recent approved</h2>
              <span className="rule" aria-hidden />
              <span className="count">LAST {Math.min(5, recentList.length || 5)} · POSTED TO POOL</span>
            </div>
            <div className="flex items-baseline justify-end -mt-3 mb-4">
              <Link
                href={deptDetailHref}
                className="font-serif italic text-sm text-accent hover:text-accent-hover"
              >
                See full pool →
              </Link>
            </div>
            {recentList.length === 0 ? (
              <div className="border border-hairline rounded-md bg-surface p-6">
                <p className="font-serif italic text-graphite text-base">
                  No approved expenses yet.
                </p>
              </div>
            ) : (
              <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
                {recentList.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-baseline justify-between px-5 py-4"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-serif italic text-graphite text-sm truncate">
                        {e.description ?? '—'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="num neg">{formatMoney(-Number(e.amount))}</span>
                      <div className="font-mono text-xs text-muted">
                        {dayjs(e.created_at).format('D MMM YYYY')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )
    }

    // Any other non-treasury role (future-proofing — currently only hr/dept_manager hit
    // the Access denied branch, so this is dead-ish code but keeps the type checker happy)
    return (
      <div className="py-16 text-center">
        <p className="font-serif italic text-2xl text-ink mb-2">Dashboard</p>
        <p className="font-serif italic text-graphite">
          Treasury data is available to Principal and Finance only.
        </p>
        <p className="font-mono text-xs text-muted mt-4">
          Use the sidebar to navigate to your modules.
        </p>
      </div>
    )
  }

  const summary = raw as unknown as DashboardSummary
  const today = dayjs().format('D MMMM YYYY')

  // Bank accounts (Phase 4: direct query, RLS-gated)
  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, account_number, current_balance, is_primary, status')
    .eq('status', 'active')
    .order('is_primary', { ascending: false })
  const banks = bankAccounts ?? []
  const totalBankBalance = banks.reduce((sum, b) => sum + Number(b.current_balance), 0)

  const hasAnyData =
    summary.total_pool > 0 || summary.loans_outstanding > 0

  // App-layer role, not summary.role: a Principal masked as Finance must get
  // the Finance dashboard (the RPC reports the real DB role).
  const isPrincipal = user.role === 'principal'
  const isFinance = user.role === 'finance'
  const pendingApprovals = summary.pending_approvals ?? []
  const pendingCount = summary.pending_approvals_count ?? 0
  const subsidiaries = summary.subsidiaries ?? []
  const alerts = summary.alerts ?? []

  // dashboard_summary RPC doesn't return reference_id for pending approvals.
  // Supplementary query so Overview links can deep-link to /approvals/payroll-run/[ref]
  // the same way the Approvals tab does.
  const pendingApprovalRefs = new Map<string, string | null>()
  if (isPrincipal && pendingApprovals.length > 0) {
    const { data: refData } = await supabase
      .from('approval_requests')
      .select('id, reference_id')
      .in(
        'id',
        pendingApprovals.map((p: PendingApproval) => p.id),
      )
    for (const row of refData ?? []) {
      pendingApprovalRefs.set(row.id, row.reference_id as string | null)
    }
  }

  // Finance sees "Awaiting Principal sign-off" — their own submitted approval_requests
  // (new_loan, new_contract, advance, etc) still pending Principal decision. This is
  // the mirror image of Principal's "Pending your hand" — Finance submits, Principal
  // approves, each sees their own queue on the dashboard.
  const { data: financePending } = isFinance
    ? await supabase
        .from('approval_requests')
        .select('id, request_type, description, amount, reference_id, created_at')
        .eq('submitted_by', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: null }
  const financePendingList = financePending ?? []

  // Finance sees "Recent actions" — their submitted requests that have been decided
  const { data: financeRecent } = isFinance
    ? await supabase
        .from('approval_requests')
        .select('id, request_type, description, amount, reference_id, status, approved_at, created_at')
        .eq('submitted_by', user.id)
        .in('status', ['approved', 'rejected'])
        .order('approved_at', { ascending: false })
        .limit(5)
    : { data: null }
  const financeRecentList = financeRecent ?? []

  return (
    <div>
      {/* ───────── Hero grid: 7+5 broadsheet ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 mb-16">
        {/* LEFT 7 columns — Venture Pool hero */}
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Venture Pool
          </div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none mb-3 tabular tracking-[-0.01em]">
            {hasAnyData ? (
              <span className={(summary.hv_fund_balance ?? 0) < 0 ? 'text-danger' : ''}>
                {formatMoney(summary.hv_fund_balance ?? 0)}
              </span>
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-xs text-muted">
            As of {today}
            {hasAnyData ? ' · live ledger' : ' · no fund sources yet'}
          </div>

          {/* Sparkline placeholder — 12-month trend belongs to /reports */}
          <svg
            className="w-full h-12 my-7"
            viewBox="0 0 600 48"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {hasAnyData ? (
              <>
                <path
                  d="M 0 30 L 40 28 L 80 32 L 120 25 L 160 22 L 200 20 L 240 24 L 280 18 L 320 15 L 360 17 L 400 12 L 440 14 L 480 10 L 520 13 L 560 8 L 600 6"
                  fill="none"
                  stroke="rgb(var(--ink))"
                  strokeWidth="1.25"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1="0"
                  y1="40"
                  x2="600"
                  y2="40"
                  stroke="rgb(var(--hairline))"
                  strokeWidth="0.5"
                  strokeDasharray="3,3"
                />
              </>
            ) : (
              <line
                x1="0"
                y1="40"
                x2="600"
                y2="40"
                stroke="rgb(var(--hairline))"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
            )}
          </svg>

          {hasAnyData ? (
            <>
              <div className="text-sm text-graphite">
                <em className="font-serif text-graphite">
                  Pool{' '}
                  <span className="font-mono tabular not-italic font-medium text-ink">
                    {formatMoney(summary.total_pool)}
                  </span>
                </em>
                {' · '}
                <em className="font-serif text-graphite">
                  lent{' '}
                  <span className="font-mono tabular not-italic">
                    {formatMoney(summary.loans_outstanding)}
                  </span>
                </em>
              </div>

              {/* ── Pool breakdown detail ── */}
              {summary.pool_breakdown ? (
                <details className="mt-4">
                  <summary className="font-serif italic text-accent text-sm cursor-pointer hover:text-accent-hover">
                    Pool breakdown
                  </summary>
                  <div className="mt-3 border border-hairline rounded-md bg-surface p-4 space-y-3">
                    {/* Source categories */}
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">Fund Sources</div>
                        <div className="font-mono tabular font-medium text-ink">{formatMoney(summary.pool_breakdown.fund_sources)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">Dept Pool</div>
                        <div className="font-mono tabular font-medium text-ink">{formatMoney(summary.pool_breakdown.dept_pool)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">Venture Pool</div>
                        <div className="font-mono tabular font-medium text-ink">{formatMoney(summary.pool_breakdown.venture_pool)}</div>
                      </div>
                    </div>

                    {/* Fund source type breakdown */}
                    {summary.fund_source_breakdown?.length > 0 ? (
                      <div className="border-t border-hairline pt-3">
                        <div className="font-mono text-xs text-muted uppercase tracking-wide mb-2">By fund source type</div>
                        {summary.fund_source_breakdown.map((fs) => (
                          <div key={fs.source_type} className="flex justify-between text-sm py-0.5">
                            <span className="font-serif italic text-graphite">
                              {fs.source_type.replace(/_/g, ' ')} ({fs.count})
                            </span>
                            <span className="font-mono tabular font-medium text-ink">
                              {formatMoney(Number(fs.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* Dept pool by department (+ Venture from corporate+treasury GL) */}
                    {(() => {
                      const rows: Array<{ key: string; name: string; balance: number }> = [
                        ...(summary.dept_pool_breakdown ?? []).map((dp) => ({
                          key: dp.department_id,
                          name: dp.department_name,
                          balance: Number(dp.balance),
                        })),
                      ]
                      const venture = Number(summary.hv_fund_balance ?? 0)
                      if (Math.abs(venture) >= 0.005) {
                        rows.push({ key: 'venture', name: 'Venture (Office)', balance: venture })
                      }
                      rows.sort((a, b) => b.balance - a.balance)
                      if (rows.length === 0) return null
                      return (
                        <div className="border-t border-hairline pt-3">
                          <div className="font-mono text-xs text-muted uppercase tracking-wide mb-2">Dept pool by department</div>
                          {rows.map((r) => (
                            <div key={r.key} className="flex justify-between text-sm py-0.5">
                              <span className="font-serif italic text-graphite">{r.name}</span>
                              <span className="font-mono tabular font-medium text-ink">
                                {formatMoney(r.balance)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <div className="mt-4">
              <p className="font-serif italic text-graphite text-base mb-4">
                No fund sources yet. Start by recording the first one.
              </p>
              <Link
                href="/fund-in"
                className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-md font-serif italic text-sm transition-colors"
              >
                Record first fund source
              </Link>
            </div>
          )}
        </div>

        {/* RIGHT 5 columns — Pending your hand (Principal only) */}
        <div className="lg:col-span-5">
          {isPrincipal ? (
            <>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif italic text-xl text-ink">
                  Pending your hand
                </h2>
                <span className="font-mono text-xs text-muted">
                  {pendingCount} {pendingCount === 1 ? 'item' : 'items'}
                </span>
              </div>

              {pendingCount === 0 ? (
                <div className="border border-hairline rounded-md bg-surface p-6 text-center">
                  <p className="font-serif italic text-ledger text-base">
                    All caught up.
                  </p>
                  <p className="text-xs text-muted mt-1">
                    No approvals waiting.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingApprovals.slice(0, 5).map((req) => (
                    <Link
                      key={req.id}
                      href={approvalHref({
                        id: req.id,
                        request_type: req.request_type,
                        reference_id: pendingApprovalRefs.get(req.id) ?? null,
                      })}
                      className="block border-b border-hairline pb-3 hover:bg-surface-2/40 -mx-2 px-2 rounded transition-colors"
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                          {req.request_type.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-xs text-muted">
                          {dayjs(req.created_at).format('D MMM')}
                        </span>
                      </div>
                      <div className="font-serif text-sm text-ink leading-tight">
                        {req.description ?? '—'}
                      </div>
                      <div className="font-mono text-xs text-muted mt-1">
                        {req.amount != null ? formatMoney(Number(req.amount)) : '—'}
                        {req.submitted_by_name
                          ? ` · by ${req.submitted_by_name}`
                          : ''}
                      </div>
                    </Link>
                  ))}
                  {pendingCount > 5 ? (
                    <Link
                      href="/approvals"
                      className="block text-center text-sm text-accent hover:text-accent-hover font-serif italic pt-2"
                    >
                      See all {pendingCount} →
                    </Link>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif italic text-xl text-ink">
                  Margin panel
                </h2>
                <span className="font-mono text-xs text-muted">monthly</span>
              </div>
              <MarginPanel summary={summary} />
            </>
          )}
        </div>
      </div>

      {/* ───────── Margin panel (Principal sees this below hero) ───────── */}
      {isPrincipal && hasAnyData ? (
        <section className="mb-16">
          <h2 className="font-serif text-2xl text-ink mb-1">Margin panel</h2>
          <MarginPanel summary={summary} />
        </section>
      ) : null}

      {/* ───────── Awaiting + Recent Actions (Finance only) ───────── */}
      {isFinance ? (
        <section className="mb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT — Awaiting Principal sign-off */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="font-serif text-xl text-ink">Awaiting Principal sign-off</h2>
                <span className="font-mono text-xs text-muted">
                  {financePendingList.length}{' '}
                  {financePendingList.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              {financePendingList.length === 0 ? (
                <div className="border border-hairline rounded-md bg-surface p-6">
                  <p className="font-serif italic text-ledger text-base">All caught up.</p>
                  <p className="font-mono text-xs text-muted mt-1">
                    Nothing waiting on Principal.
                  </p>
                </div>
              ) : (
                <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
                  {financePendingList.slice(0, 5).map((req) => (
                    <Link
                      key={req.id}
                      href={approvalHref(req)}
                      className="flex items-baseline justify-between px-5 py-4 hover:bg-surface-2/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-accent mb-1">
                          {req.request_type.replace(/_/g, ' ')}
                        </div>
                        <div className="font-serif italic text-graphite text-sm truncate">
                          {req.description ?? '—'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono tabular font-medium text-ink text-sm">
                          {req.amount != null ? formatMoney(Number(req.amount)) : '—'}
                        </div>
                        <div className="font-mono text-xs text-muted">
                          {dayjs(req.created_at).format('D MMM')}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {financePendingList.length > 5 ? (
                    <div className="block text-center px-5 py-3 font-serif italic text-sm text-muted">
                      + {financePendingList.length - 5} more pending
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* RIGHT — Recent actions (approved / rejected) */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="font-serif text-xl text-ink">Recent actions</h2>
                <span className="font-mono text-xs text-muted">
                  {financeRecentList.length}{' '}
                  {financeRecentList.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              {financeRecentList.length === 0 ? (
                <div className="border border-hairline rounded-md bg-surface p-6">
                  <p className="font-serif italic text-muted text-base">No recent actions.</p>
                  <p className="font-mono text-xs text-muted mt-1">
                    Decisions will appear here once Principal acts.
                  </p>
                </div>
              ) : (
                <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
                  {financeRecentList.map((req) => (
                    <Link
                      key={req.id}
                      href={approvalHref(req)}
                      className="flex items-baseline justify-between px-5 py-4 hover:bg-surface-2/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
                            {req.request_type.replace(/_/g, ' ')}
                          </div>
                          <span
                            className={`font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              req.status === 'approved'
                                ? 'bg-ledger/10 text-ledger'
                                : 'bg-danger/10 text-danger'
                            }`}
                          >
                            {req.status}
                          </span>
                        </div>
                        <div className="font-serif italic text-graphite text-sm truncate">
                          {req.description ?? '—'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono tabular font-medium text-ink text-sm">
                          {req.amount != null ? formatMoney(Number(req.amount)) : '—'}
                        </div>
                        <div className="font-mono text-xs text-muted">
                          {req.approved_at ? dayjs(req.approved_at).format('D MMM') : dayjs(req.created_at).format('D MMM')}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* ───────── Subsidiaries ───────── */}
      <section className="mb-16">
        <div className="sect-head">
          <h2>Subsidiaries</h2>
          <span className="rule" aria-hidden />
          <span className="count">{subsidiaries.length} ENTITIES · NET POSITION TODAY</span>
        </div>

        {subsidiaries.length === 0 ? (
          <div className="py-10 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-muted text-base">
              No companies configured. Visit Settings to add subsidiaries.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="right">Savings</th>
                  <th className="right">Loans</th>
                  <th className="right">Net</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {subsidiaries.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <div className="font-serif text-[15px] text-ink">{sub.name}</div>
                      <div className="font-mono text-[11px] text-graphite mt-0.5">
                        {sub.short_code}
                        {sub.has_overdue ? (
                          <span className="text-danger"> · overdue</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="num">
                      {sub.savings_deposited > 0
                        ? formatMoney(sub.savings_deposited)
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="num">
                      {sub.loans_outstanding > 0
                        ? formatMoney(sub.loans_outstanding)
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="num">
                      {sub.net_position === 0 ? (
                        <span className="text-muted">—</span>
                      ) : sub.net_position > 0 ? (
                        <span className="text-ledger font-semibold">
                          +{formatMoneyBare(sub.net_position)}
                        </span>
                      ) : (
                        <span className="text-danger font-semibold neg">
                          {formatMoneyBare(sub.net_position)}
                        </span>
                      )}
                    </td>
                    <td>
                      <PositionLabel position={sub.position} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────── Alerts ───────── */}
      {alerts.length > 0 ? (
        <section className="mb-16">
          <h2 className="font-serif text-2xl text-ink mb-1">Alerts</h2>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="border-b border-hairline pb-2 flex items-baseline gap-3"
              >
                <span
                  className={
                    alert.severity === 'danger'
                      ? 'font-mono text-[10px] uppercase tracking-wider text-danger'
                      : alert.severity === 'warning'
                        ? 'font-mono text-[10px] uppercase tracking-wider text-alert'
                        : 'font-mono text-[10px] uppercase tracking-wider text-muted'
                  }
                >
                  {alert.type}
                </span>
                <span className="font-serif italic text-sm text-graphite">
                  {alert.message}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ───────── Phase 4 — Bank Accounts ───────── */}
      {banks.length > 0 ? (
        <section className="mb-16">
          <h2 className="font-serif text-2xl text-ink mb-1">Bank Accounts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {banks.map((b) => (
              <div
                key={b.id}
                className="border border-hairline rounded-md bg-surface p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-serif text-md text-ink">{b.bank_name}</div>
                  {b.is_primary ? (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-accent bg-accent-bg px-1.5 py-0.5 rounded">
                      Primary
                    </span>
                  ) : null}
                </div>
                <div className="font-mono text-xs text-muted mb-3">{b.account_number}</div>
                <div className="font-serif text-2xl text-ink">
                  {formatMoney(Number(b.current_balance))}
                </div>
              </div>
            ))}
            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif text-md text-graphite mb-2">Total balance</div>
              <div className="font-mono text-xs text-muted mb-3">across all accounts</div>
              <div className="font-serif text-2xl text-ink font-medium">
                {formatMoney(totalBankBalance)}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ───────── Phase 2 — Billing + Dept Pool snapshot ───────── */}
      <section className="mb-16">
        <h2 className="font-serif text-2xl text-ink mb-1">Billing &amp; Dept Pool</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">
              Billing float
            </div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.billing_float ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              Unpaid invoices (draft + issued)
            </p>
          </div>

          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">
              Dept pool total
            </div>
            <div
              className={
                Number(summary.dept_pool_total ?? 0) < 0
                  ? 'font-serif text-2xl text-danger leading-none'
                  : 'font-serif text-2xl text-ink leading-none'
              }
            >
              {formatMoney(Number(summary.dept_pool_total ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              Sum of positive dept pool balances
            </p>
          </div>

          <MarketingNpCard mkNp={summary.marketing_np_this_month} />
        </div>
      </section>

      {/* ───────── Phase 3 — Director Salary + Director Pool ───────── */}
      <section className="mb-12 pb-12 border-b border-hairline">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-serif text-2xl text-ink">Director Salary</h2>
          <Link
            href="/director-pool"
            className="font-serif italic text-sm text-accent hover:text-accent-hover"
          >
            Director Pool →
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">Director Pool</div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.salary_pool_total ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              {(summary.payouts_pending ?? 0) === 0
                ? 'No draft payouts'
                : `${summary.payouts_pending} draft payout${summary.payouts_pending === 1 ? '' : 's'} pending`}
            </p>
          </div>

          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">Venture Pool</div>
            <div
              className={
                Number(summary.hv_fund_balance ?? 0) < 0
                  ? 'font-serif text-2xl text-danger leading-none'
                  : 'font-serif text-2xl text-ink leading-none'
              }
            >
              {formatMoney(Number(summary.hv_fund_balance ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              HV group-level running balance
            </p>
          </div>

          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">Director Invoice</div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.invoice_pool_balance ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              25% director invoice accumulation
            </p>
          </div>
        </div>
      </section>

    </div>
  )
}

// HR Overview entry card — one of the three actions that make up the HR job
// under the direct-submit flow (Employment List / Import Payroll / Director
// Salary). Roman numeral marker echoes the sidebar convention.
function ActionCard({
  n,
  title,
  status,
  statusTone,
  ctaLabel,
  ctaHref,
}: {
  n: string
  title: string
  status: string
  statusTone: 'ok' | 'warn' | 'idle'
  ctaLabel: string
  ctaHref: string
}) {
  const toneStyle =
    statusTone === 'ok'
      ? 'text-ledger'
      : statusTone === 'warn'
        ? 'text-alert'
        : 'text-muted'

  return (
    <Link
      href={ctaHref}
      className="border border-hairline rounded-md bg-surface hover:bg-surface-2 p-5 transition-colors block"
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-accent mb-2">
        <em className="font-serif normal-case">{n}.</em>
      </div>
      <div className="font-serif text-lg text-ink mb-1">{title}</div>
      <div className={`font-serif italic text-sm ${toneStyle}`}>{status}</div>
      <div className="font-serif italic text-sm text-accent mt-3">{ctaLabel}</div>
    </Link>
  )
}

function MarketingNpCard({ mkNp }: { mkNp: MarketingNp | undefined }) {
  const revenue = Number(mkNp?.revenue ?? 0)
  const staffCost = Number(mkNp?.staff_cost ?? 0)
  const expenses = Number(mkNp?.expenses ?? 0)
  const netProfit = Number(mkNp?.net_profit ?? 0)
  const isLoss = netProfit < 0

  return (
    <div className="border border-hairline rounded-md bg-surface p-5">
      <div className="font-serif italic text-accent text-sm mb-1">
        Marketing NP this month
      </div>
      <div
        className={
          isLoss
            ? 'font-serif text-2xl text-danger leading-none'
            : 'font-serif text-2xl text-ink leading-none'
        }
      >
        {formatMoney(netProfit)}
      </div>
      <div className="font-mono text-xs text-muted mt-2 space-y-0.5">
        <div>Revenue {formatMoney(revenue)}</div>
        <div>− Staff {formatMoney(staffCost)}</div>
        <div>− Expenses {formatMoney(expenses)}</div>
      </div>
    </div>
  )
}

function PositionLabel({ position }: { position: Subsidiary['position'] }) {
  if (position === 'creditor') {
    return (
      <em className="font-serif text-ledger text-sm" title="HV owes this subsidiary">
        creditor
      </em>
    )
  }
  if (position === 'debtor') {
    return (
      <em className="font-serif text-alert text-sm" title="Subsidiary owes HV">
        debtor
      </em>
    )
  }
  return <em className="font-serif text-muted text-sm">even</em>
}

function MarginPanel({ summary }: { summary: DashboardSummary }) {
  const weightedCost = summary.weighted_cost_rate
  const baseRate = summary.current_base_rate
  const netSpread = summary.net_spread
  const netInterest = summary.net_interest_income

  const spreadNegative = netSpread != null && netSpread < 0
  const interestNegative = netInterest < 0

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-serif italic text-base text-ink">
          Weighted cost of capital
        </span>
        <span className="font-mono tabular text-base font-medium text-ink">
          {weightedCost != null ? `${(weightedCost * 100).toFixed(3)}%/mo` : '—'}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-serif italic text-base text-ink">
          Current base rate
        </span>
        <span className="font-mono tabular text-base font-medium text-ink">
          {baseRate != null ? `${(baseRate * 100).toFixed(3)}%/mo` : '—'}
        </span>
      </div>
      <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
        <span className="font-serif italic text-base font-medium text-accent">Net spread</span>
        <span
          className={
            spreadNegative
              ? 'font-mono tabular text-lg font-semibold text-danger'
              : 'font-mono tabular text-lg font-semibold text-ledger'
          }
        >
          {netSpread != null ? `${(netSpread * 100).toFixed(3)}%/mo` : '—'}
        </span>
      </div>

      <div className="pt-3 border-t border-hairline space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-sm text-ink">
            Interest income
          </span>
          <span className="font-mono tabular text-sm font-medium text-ink">
            {formatMoney(summary.monthly_interest_income)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-sm text-ink">
            Interest expense
          </span>
          <span className="font-mono tabular text-sm font-medium text-graphite">
            {formatMoney(-Math.abs(summary.monthly_interest_expense))}
          </span>
        </div>
        <div className="flex items-baseline justify-between pt-1 border-t border-hairline">
          <span className="font-serif italic text-base font-medium text-accent">
            Net interest
          </span>
          <span
            className={
              interestNegative
                ? 'font-mono tabular text-base font-semibold text-danger'
                : 'font-mono tabular text-base font-semibold text-ledger'
            }
          >
            {formatMoney(netInterest)}
          </span>
        </div>
      </div>
    </div>
  )
}
