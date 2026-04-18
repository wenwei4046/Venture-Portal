import Link from 'next/link'
import dayjs from 'dayjs'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatMoneyBare } from '@/lib/utils'

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

// payroll_run approvals have their own detail page with 4-OPEX drill-down +
// fan-out approval. Everything else uses the generic /approvals/[id] route.
// Mirrors the same helper in /approvals/page.tsx — both the Approvals tab and
// the Overview's Pending Action should deep-link to the same detail page.
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
  free_cash: number
  buffer_amount: number | null
  buffer_breach: boolean
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

  const { data: raw, error } = await supabase.rpc('dashboard_summary')
  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif italic text-danger">Failed to load dashboard.</p>
        <p className="font-mono text-xs text-muted mt-2">{error.message}</p>
      </div>
    )
  }

  // RPC returns { error: 'Access denied' } for HR/dept_manager (not a Supabase error)
  if (raw && typeof raw === 'object' && 'error' in raw && (raw as Record<string, unknown>).error === 'Access denied') {
    // Determine role for role-specific dashboard
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: currentUser } = await supabase.from('users').select('role, name').eq('id', authUser?.id ?? '').single()
    const userRole = currentUser?.role

    if (userRole === 'hr') {
      // HR Dashboard — Monthly Cycle board.
      // One glance tells HR exactly where this month's payroll stands and
      // which step is next. Each step links directly to the page where the
      // action happens so HR never has to hunt for it.
      const period = dayjs().startOf('month').format('YYYY-MM-DD')
      const periodUrl = `/hr-costing/payroll/${period}`

      const [
        { data: hrSummary },
        { data: monthlyPayroll },
        { data: payrollRun },
        { data: pendingClaims },
        { data: dirPayouts },
        { data: poolRows },
      ] = await Promise.all([
        supabase.rpc('get_hr_cost_summary'),
        supabase
          .from('hr_monthly_payroll')
          .select('id, status, net')
          .eq('period_month', period),
        supabase
          .from('payroll_runs')
          .select('id, status, total_amount, submitted_at, approved_at, paid_at')
          .eq('period_month', period)
          .maybeSingle(),
        supabase
          .from('claims')
          .select('id, claim_type, status, claimant_name, amount, description, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('director_payouts')
          .select('id, status')
          .eq('period_month', period),
        supabase
          .from('operating_pool_balance')
          .select('balance')
          .eq('pool_type', 'hr_opex'),
      ])

      const poolBalance = Number(poolRows?.[0]?.balance ?? 0)

      // Latest active payment request for the current run, if any.
      // Drives steps 6 and 7 on the Monthly Cycle board.
      const { data: paymentRequest } = payrollRun?.id
        ? await supabase
            .from('payroll_payment_requests')
            .select('id, status, pv_id')
            .eq('payroll_run_id', payrollRun.id)
            .in('status', ['submitted', 'pv_generated', 'completed'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const depts = (hrSummary as any[]) ?? []
      const totalStaff = depts.reduce((s: number, d: { staff_count: number }) => s + Number(d.staff_count ?? 0), 0)

      const rows = monthlyPayroll ?? []
      const payrollImported = rows.length > 0
      const draftCount = rows.filter(r => r.status === 'draft').length
      const totalNet = rows.reduce((s, r) => s + Number(r.net ?? 0), 0)

      const runStatus = payrollRun?.status as string | undefined
      const runSubmitted = runStatus === 'submitted' || runStatus === 'approved' || runStatus === 'paid'
      const runApproved = runStatus === 'approved' || runStatus === 'paid'
      const runPaid = runStatus === 'paid'

      const requestStatus = paymentRequest?.status as string | undefined
      const requestActive =
        requestStatus === 'submitted' ||
        requestStatus === 'pv_generated' ||
        requestStatus === 'completed'
      const poolFunded = requestStatus === 'completed' || runPaid

      const pendingBenefit = (pendingClaims ?? []).filter(c => c.claim_type === 'benefit').length
      const pendingPool = (pendingClaims ?? []).filter(c => c.claim_type === 'project').length
      const totalPending = pendingBenefit + pendingPool

      const payoutStatus = (dirPayouts ?? []).length > 0
        ? (dirPayouts ?? []).every(p => p.status === 'confirmed') ? 'confirmed' : 'draft'
        : 'not calculated'

      // Cycle step state — 'done' / 'active' / 'waiting' / 'pending'.
      // Exactly one 'active' at a time so HR always has one obvious next click.
      // Nine steps mirror the split flow post-refactor:
      //   1 staff master · 2 import · 3 review drafts · 4 submit for approval
      //   5 Principal approves costing · 6 request payment from Finance
      //   7 Finance generates + Principal approves PV · 8 HR Pool → staff (bank CSV)
      //   9 Statutory files
      type StepState = 'done' | 'active' | 'waiting' | 'pending'
      const s1: StepState = totalStaff > 0 ? 'done' : 'active'
      const s2: StepState = payrollImported ? 'done' : (s1 === 'done' ? 'active' : 'pending')
      const s3: StepState = (rows.length > 0 && draftCount === 0) ? 'done' : (s2 === 'done' && draftCount > 0 ? 'active' : 'pending')
      const s4: StepState = runSubmitted ? 'done' : (s3 === 'done' ? 'active' : 'pending')
      const s5: StepState = runApproved ? 'done' : (runSubmitted ? 'waiting' : 'pending')
      const s6: StepState = requestActive
        ? 'done'
        : runApproved
          ? 'active'
          : 'pending'
      const s7: StepState = poolFunded
        ? 'done'
        : requestStatus === 'submitted' || requestStatus === 'pv_generated'
          ? 'waiting'
          : 'pending'
      const s8: StepState = poolFunded ? 'active' : 'pending'
      const s9: StepState = poolFunded ? 'active' : 'pending'
      const doneCount = [s1, s2, s3, s4, s5, s6, s7, s8, s9].filter(s => s === 'done').length

      return (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-10">
            <div>
              <div className="font-serif italic text-accent text-base mb-1">HR · {dayjs().format('MMMM YYYY')}</div>
              <h1 className="font-serif text-3xl text-ink mb-1">Monthly Payroll Cycle</h1>
              <p className="font-mono text-xs text-muted">{dayjs().format('dddd, D MMMM YYYY')} · {doneCount} of 9 steps complete</p>
            </div>
            <Link
              href="/hr-costing/payment"
              className="shrink-0 border border-hairline bg-surface hover:bg-surface-2 rounded-md px-5 py-3 transition-colors block text-right"
            >
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">HR Pool balance</div>
              <div className={`font-mono tabular text-xl mt-0.5 ${poolBalance >= 0 ? 'text-ink' : 'text-danger'}`}>
                {formatMoney(poolBalance)}
              </div>
              <div className="font-sans text-[11px] text-muted mt-0.5">Open Payment →</div>
            </Link>
          </div>

          {/* Monthly Cycle — the whole HR job in one linear board */}
          <section className="mb-12">
            <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
              <CycleStep
                n={1}
                state={s1}
                title="Staff master"
                detail={totalStaff > 0 ? `${totalStaff} active across ${depts.length} dept${depts.length === 1 ? '' : 's'}` : 'Add your first staff'}
                ctaLabel={totalStaff > 0 ? 'Manage staff →' : 'Add staff →'}
                ctaHref="/hr-costing/staff"
              />
              <CycleStep
                n={2}
                state={s2}
                title="Import payroll"
                detail={payrollImported ? `${rows.length} row${rows.length === 1 ? '' : 's'} imported` : 'Upload InfoTech xlsx or start fresh'}
                ctaLabel={payrollImported ? 'Re-import / open grid →' : 'Start payroll →'}
                ctaHref={periodUrl}
              />
              <CycleStep
                n={3}
                state={s3}
                title="Review drafts"
                detail={
                  rows.length === 0
                    ? '—'
                    : draftCount > 0
                      ? `${draftCount} draft row${draftCount === 1 ? '' : 's'} pending · RM ${formatMoneyBare(totalNet)} net`
                      : `All ${rows.length} rows submitted · RM ${formatMoneyBare(totalNet)} net`
                }
                ctaLabel="Open grid →"
                ctaHref={periodUrl}
              />
              <CycleStep
                n={4}
                state={s4}
                title="Submit for Approval"
                detail={
                  runSubmitted
                    ? `Submitted · RM ${formatMoneyBare(Number(payrollRun?.total_amount ?? 0))}`
                    : s4 === 'active'
                      ? 'Send the payroll numbers to Principal'
                      : 'Finish drafts first'
                }
                ctaLabel={s4 === 'active' ? 'Go to grid →' : 'View →'}
                ctaHref={periodUrl}
                hideCta={s4 === 'pending'}
              />
              <CycleStep
                n={5}
                state={s5}
                title="Principal approves costing"
                detail={
                  runApproved
                    ? `Approved ${payrollRun?.approved_at ? dayjs(payrollRun.approved_at).format('D MMM HH:mm') : ''}`
                    : s5 === 'waiting'
                      ? 'Awaiting Principal sign-off — no money moves yet'
                      : '—'
                }
                ctaLabel=""
                ctaHref=""
                hideCta
              />
              <CycleStep
                n={6}
                state={s6}
                title="Request payment from Finance"
                detail={
                  requestActive
                    ? 'Request sent to Finance'
                    : s6 === 'active'
                      ? 'Ask Finance to generate the Payment Voucher'
                      : 'Wait for costing approval'
                }
                ctaLabel={s6 === 'active' ? 'Go to grid →' : 'View →'}
                ctaHref={periodUrl}
                hideCta={s6 === 'pending'}
              />
              <CycleStep
                n={7}
                state={s7}
                title="PV approved · HR Pool funded"
                detail={
                  poolFunded
                    ? 'Money landed in HR Pool'
                    : requestStatus === 'pv_generated'
                      ? 'PV generated by Finance — awaiting Principal approval'
                      : requestStatus === 'submitted'
                        ? 'Finance will generate the PV, then Principal approves'
                        : '—'
                }
                ctaLabel={paymentRequest?.pv_id ? 'View voucher →' : ''}
                ctaHref={paymentRequest?.pv_id ? `/payments/${paymentRequest.pv_id}` : ''}
                hideCta={!paymentRequest?.pv_id}
              />
              <CycleStep
                n={8}
                state={s8}
                title="Bank transfer file"
                detail={
                  poolFunded
                    ? 'Alliance Bank CSV ready to download'
                    : 'Available after HR Pool is funded'
                }
                ctaLabel="Download CSV →"
                ctaHref={`${periodUrl}/bank-transfer`}
                hideCta={s8 === 'pending'}
              />
              <CycleStep
                n={9}
                state={s9}
                title="Statutory files"
                detail={
                  poolFunded
                    ? 'KWSP · SOCSO · EIS · LHDN CP39 ready'
                    : 'Available after HR Pool is funded'
                }
                ctaLabel="Go to files →"
                ctaHref={periodUrl}
                hideCta={s9 === 'pending'}
              />
            </div>
          </section>

          {/* Snapshot — small panel with cross-cycle info */}
          <section className="mb-12">
            <h2 className="font-serif text-2xl text-ink mb-1">Snapshot</h2>
            <p className="font-serif italic text-graphite text-sm mb-4">
              Everything else you track, <em>at a glance</em>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-hairline rounded-md bg-surface p-5">
                <div className="font-serif italic text-accent text-sm mb-1">Pending claims</div>
                <div className="font-serif text-2xl text-ink leading-none">{totalPending}</div>
                <div className="font-mono text-xs text-muted mt-2">
                  {pendingBenefit} benefit · {pendingPool} pool
                </div>
              </div>
              <div className="border border-hairline rounded-md bg-surface p-5">
                <div className="font-serif italic text-accent text-sm mb-1">Director Salary</div>
                <div className={`font-serif text-lg leading-none ${payoutStatus === 'confirmed' ? 'text-ledger' : payoutStatus === 'draft' ? 'text-alert' : 'text-muted'}`}>
                  {payoutStatus === 'confirmed' ? 'Confirmed' : payoutStatus === 'draft' ? 'Draft' : 'Not calculated'}
                </div>
                <div className="font-mono text-xs text-muted mt-2">
                  {(dirPayouts ?? []).length} director{(dirPayouts ?? []).length === 1 ? '' : 's'} this period
                </div>
              </div>
              <div className="border border-hairline rounded-md bg-surface p-5">
                <div className="font-serif italic text-accent text-sm mb-1">Total Net (payroll)</div>
                <div className="font-serif text-2xl text-ink leading-none">{formatMoney(totalNet)}</div>
                <div className="font-mono text-xs text-muted mt-2">
                  {rows.length} row{rows.length === 1 ? '' : 's'} · {dayjs().format('MMM YYYY')}
                </div>
              </div>
            </div>
          </section>

          {/* Pending claims drill-down — kept for HR to act without leaving dashboard */}
          {(pendingClaims ?? []).length > 0 ? (
            <section className="mb-12">
              <h2 className="font-serif text-2xl text-ink mb-1">Needs your review</h2>
              <p className="font-serif italic text-graphite text-sm mb-4">
                Claims awaiting approval. <em>Benefit claims go to HR, pool claims to Finance.</em>
              </p>
              <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
                {(pendingClaims ?? []).slice(0, 5).map((c) => (
                  <Link
                    key={c.id}
                    href="/claims"
                    className="flex items-baseline justify-between px-5 py-4 hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                          {c.claim_type === 'project' ? 'POOL' : 'BENEFIT'}
                        </span>
                        <span className="font-serif text-sm text-ink truncate">
                          {c.claimant_name}
                        </span>
                      </div>
                      <div className="font-serif italic text-graphite text-sm truncate">
                        {c.description ?? '—'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular font-medium text-ink text-sm">
                        {formatMoney(Number(c.amount))}
                      </div>
                      <div className="font-mono text-xs text-muted">
                        {dayjs(c.created_at).format('D MMM')}
                      </div>
                    </div>
                  </Link>
                ))}
                {(pendingClaims ?? []).length > 5 ? (
                  <Link
                    href="/claims"
                    className="block text-center px-5 py-3 font-serif italic text-sm text-accent hover:text-accent-hover"
                  >
                    See all {(pendingClaims ?? []).length} →
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      )
    }

    if (userRole === 'dept_manager') {
      // Dept Manager Dashboard — role-specific overview. Currently only
      // Marketing has a real P&L; HR/Finance dept pools are cost-to-cost
      // and balance at zero by design. Either way, the dept_manager sees
      // their own department's pool state + their own submitted expense
      // requests awaiting Principal sign-off.
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
          <div className="mb-10">
            <div className="font-serif italic text-accent text-base mb-1">
              {dept.name} Overview
            </div>
            <h1 className="font-serif text-3xl text-ink mb-1">
              {dayjs().format('MMMM YYYY')}
            </h1>
            <p className="font-mono text-xs text-muted">
              {dayjs().format('dddd, D MMMM YYYY')}
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-sm text-accent mb-1">
                Pool balance
              </div>
              <div
                className={`font-serif text-2xl leading-none ${balance < 0 ? 'text-danger' : 'text-ink'}`}
              >
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
              <div className="font-serif text-2xl text-ink leading-none">
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
              <div
                className={`font-serif text-2xl leading-none ${np.net_profit < 0 ? 'text-danger' : 'text-ink'}`}
              >
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
              <div className="font-serif text-3xl text-ink leading-none">
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
            <h2 className="font-serif text-2xl text-ink mb-1">
              Awaiting Principal sign-off
            </h2>
            <p className="font-serif italic text-graphite text-sm mb-4">
              Your submitted expense requests. <em>They post to the pool once approved.</em>
            </p>
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
                      <div className="font-mono tabular font-medium text-ink text-sm">
                        {formatMoney(Number(r.amount))}
                      </div>
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
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-serif text-2xl text-ink">Recent approved</h2>
              <Link
                href={deptDetailHref}
                className="font-serif italic text-sm text-accent hover:text-accent-hover"
              >
                See full pool →
              </Link>
            </div>
            <p className="font-serif italic text-graphite text-sm mb-4">
              Last {Math.min(5, recentList.length || 5)} expenses posted to the pool.
            </p>
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
                      <div className="font-mono tabular font-medium text-ink text-sm">
                        {formatMoney(-Number(e.amount))}
                      </div>
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

  const isPrincipal = summary.role === 'principal'
  const isFinance = summary.role === 'finance'
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
        {/* LEFT 7 columns — Free pool hero */}
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Free pool
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none mb-3">
            {hasAnyData ? (
              <span className={summary.free_cash < 0 ? 'text-danger' : ''}>
                {formatMoney(summary.free_cash)}
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
                  stroke="#1A1613"
                  strokeWidth="1.25"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1="0"
                  y1="40"
                  x2="600"
                  y2="40"
                  stroke="#DFD4BE"
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
                stroke="#DFD4BE"
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
                {' · '}
                <em className="font-serif text-graphite">
                  free{' '}
                  <span className={`font-mono tabular not-italic font-medium ${summary.free_cash >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {formatMoney(summary.free_cash)}
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

                    {/* Dept pool by department */}
                    {summary.dept_pool_breakdown?.length > 0 ? (
                      <div className="border-t border-hairline pt-3">
                        <div className="font-mono text-xs text-muted uppercase tracking-wide mb-2">Dept pool by department</div>
                        {summary.dept_pool_breakdown.map((dp) => (
                          <div key={dp.department_id} className="flex justify-between text-sm py-0.5">
                            <span className="font-serif italic text-graphite">{dp.department_name}</span>
                            <span className="font-mono tabular font-medium text-ink">
                              {formatMoney(Number(dp.balance))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
          <p className="font-serif italic text-graphite text-sm mb-6">
            Weighted cost vs. lending rate, <em>this month</em>
          </p>
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
              <p className="font-serif italic text-graphite text-sm mb-4">
                Pending requests you submitted.
              </p>
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
              <p className="font-serif italic text-graphite text-sm mb-4">
                Latest decisions from Principal.
              </p>
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
        <h2 className="font-serif text-2xl text-ink mb-1">Subsidiaries</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          {subsidiaries.length} entities, <em>net position as of this morning</em>
        </p>

        {subsidiaries.length === 0 ? (
          <div className="py-10 text-center border-t border-hairline">
            <p className="font-serif italic text-muted text-base">
              No companies configured. Visit Settings to add subsidiaries.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Company</th>
                  <th className="text-right py-3 pr-4 font-medium">Savings</th>
                  <th className="text-right py-3 pr-4 font-medium">Loans</th>
                  <th className="text-right py-3 pr-4 font-medium">Net</th>
                  <th className="text-left py-3 pr-4 font-medium">Position</th>
                </tr>
              </thead>
              <tbody>
                {subsidiaries.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="py-4 pr-4">
                      <div className="font-serif text-md text-ink">{sub.name}</div>
                      <div className="font-mono text-xs text-muted">
                        {sub.short_code}
                        {sub.has_overdue ? (
                          <span className="text-danger"> · overdue</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">
                      {sub.savings_deposited > 0
                        ? formatMoney(sub.savings_deposited)
                        : '—'}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">
                      {sub.loans_outstanding > 0
                        ? formatMoney(sub.loans_outstanding)
                        : '—'}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono tabular">
                      {sub.net_position === 0 ? (
                        <span className="text-muted">—</span>
                      ) : sub.net_position > 0 ? (
                        <span className="text-ledger font-semibold">
                          +{formatMoneyBare(sub.net_position)}
                        </span>
                      ) : (
                        <span className="text-danger font-semibold">
                          {formatMoneyBare(sub.net_position)}
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4">
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
          <p className="font-serif italic text-graphite text-sm mb-4">
            {alerts.length} item{alerts.length === 1 ? '' : 's'} to watch
          </p>
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
          <p className="font-serif italic text-graphite text-sm mb-6">
            HV operating accounts, <em>balance as of last executed payment</em>
          </p>
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
        <p className="font-serif italic text-graphite text-sm mb-6">
          Unpaid invoices, dept pool totals, Marketing P&amp;L <em>this month</em>
        </p>

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
        <p className="font-serif italic text-graphite text-sm mb-6">
          Monthly payroll plus the unified Director Pool: <em>saving + invoice accumulation</em>
        </p>

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
            <div className="font-serif italic text-accent text-sm mb-1">Director Saving</div>
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
              5% saving + statutory surplus
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

type CycleStepState = 'done' | 'active' | 'waiting' | 'pending'

function CycleStep({
  n,
  state,
  title,
  detail,
  ctaLabel,
  ctaHref,
  hideCta = false,
}: {
  n: number
  state: CycleStepState
  title: string
  detail: string
  ctaLabel: string
  ctaHref: string
  hideCta?: boolean
}) {
  const numStyle =
    state === 'done'
      ? 'bg-ledger/10 text-ledger border-ledger/30'
      : state === 'active'
        ? 'bg-accent text-white border-accent'
        : state === 'waiting'
          ? 'bg-alert/10 text-alert border-alert/30'
          : 'bg-paper text-muted border-hairline'

  const titleStyle =
    state === 'pending' ? 'font-serif text-md text-muted' : 'font-serif text-md text-ink'

  const stateLabel =
    state === 'done' ? 'done' : state === 'active' ? 'next' : state === 'waiting' ? 'waiting' : '—'
  const stateLabelStyle =
    state === 'done'
      ? 'font-serif italic text-ledger text-xs'
      : state === 'active'
        ? 'font-serif italic text-accent text-xs'
        : state === 'waiting'
          ? 'font-serif italic text-alert text-xs'
          : 'font-serif italic text-muted text-xs'

  return (
    <div className="flex items-center gap-5 px-5 py-4">
      <div
        className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center font-mono text-sm font-medium ${numStyle}`}
      >
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 mb-0.5">
          <span className={titleStyle}>{title}</span>
          <span className={stateLabelStyle}>{stateLabel}</span>
        </div>
        <div className="font-serif italic text-graphite text-sm truncate">{detail}</div>
      </div>
      {!hideCta && ctaHref ? (
        <Link
          href={ctaHref}
          className={
            state === 'active'
              ? 'shrink-0 font-serif italic text-sm text-accent hover:text-accent-hover'
              : 'shrink-0 font-serif italic text-sm text-graphite hover:text-accent'
          }
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
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
